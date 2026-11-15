package com.kopo17.runshoes.api;

import jakarta.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import com.kopo17.runshoes.activity.ActivityLogger;
import com.kopo17.runshoes.activity.ActivityLogger.Entry;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 챗봇이 찾지 못한 신발 · 용어(V18) — 작업 5-1(docs/09_chatbot_rag.md 9절).
 * POST /api/internal/chatbot-misses  챗봇 사이드카만 — 같은 Pod 안에서 127.0.0.1:3000 으로 들어온 연결만 받는다(그 밖은 404 {}).
 *                                    연결이 들어온 서버 쪽 주소(localAddr)를 본다. remoteAddr 는 믿지 않는다 — Spring Boot 는 쿠버네티스에서
 *                                    forward-headers-strategy 를 NATIVE 로 보고 X-Forwarded-For 로 remoteAddr 를 바꾼다(내부 대역 · 127/8 을
 *                                    프록시로 믿는다). 그래서 클러스터 · LAN 에서 "X-Forwarded-For: 127.0.0.1" 이면 remoteAddr 가 127.0.0.1 이 됐다
 *                                    (2026-11-12 로컬 재현). ingress 는 Pod IP 로 들어오므로 localAddr 가 루프백일 수 없다.
 *                                    본문 {kind: "shoe"|"term"|"feature", query, message} → 204. 잘못된 본문 400 {}
 * GET  /api/admin/chatbot-misses     관리자 마이페이지의 챗봇 문의 — (kind, query)로 묶은 목록, 처리 상태(V23) · 종류 · 날짜로 거르고
 *                                    서버가 페이지를 나눈다(2026-11-14, 신발 관리 탭의 최근 200개 배열에서 바꿨다). admin · 데모 관리자(보기만)
 * POST /api/admin/chatbot-misses/decide  처리함 · 무시 · 되돌리기 — admin 만
 */
@RestController
class ChatbotMissController {

	static final Set<String> KINDS = Set.of("shoe", "term", "feature");
	/** 다른 응답의 createdAt 과 같은 모양(UTC, ms) */
	static final DateTimeFormatter AT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
	static final int QUERY_MAX = 100, MESSAGE_MAX = 300;

	private final JdbcTemplate jdbc;
	private final ActivityLogger activity;

	ChatbotMissController(JdbcTemplate jdbc, ActivityLogger activity) {
		this.jdbc = jdbc;
		this.activity = activity;
	}

	@PostMapping("/api/internal/chatbot-misses")
	ResponseEntity<Void> record(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
		if (!isLoopback(req.getLocalAddr())) throw ApiException.notFound();
		if (body == null || !(body.get("kind") instanceof String kind) || !KINDS.contains(kind)
				|| !(body.get("query") instanceof String q) || q.isBlank()
				|| !(body.get("message") instanceof String m) || m.isBlank()) {
			throw ApiException.badRequest("kind · query · message");
		}
		jdbc.update("INSERT INTO chatbot_misses (kind, query, message, created_at) VALUES (?, ?, ?, ?)",
				kind, cut(q.strip(), QUERY_MAX), cut(m.strip(), MESSAGE_MAX),
				Timestamp.valueOf(LocalDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MILLIS)));
		return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
	}

	/** 처리 상태(V23) — 화면 · 본문의 값. 묶음의 상태는 「새로 온 줄(NULL)이 있으면 open, 없으면 마지막 줄의 상태」 */
	static final Set<String> STATUSES = Set.of("open", "done", "ignored");

	/**
	 * 관리자 마이페이지의 챗봇 문의(2026-11-14 — 신발 관리 탭에서 옮겼다). (kind, query)로 묶어 마지막 질문 최근 순, 서버 페이지 나누기.
	 * ?status=open(기본) · done · ignored · all &kind=shoe|term|feature &from=&to=(한국 날짜 — 그 사이의 질문만 센다) &page=&size=
	 * 한 줄 {kind, query, count, open, lastAt, lastMessage, status, decidedAt, lastDecision, lastDecidedAt, decidedNote}. count 는 그 기간의 질문 수,
	 * open 은 그 가운데 처리 안 한 수. lastDecision · lastDecidedAt · decidedNote 는 마지막으로 처리한 줄의 상태 · 때 · 사유(V24, 2026-11-15)
	 */
	@GetMapping("/api/admin/chatbot-misses")
	@Transactional(readOnly = true)
	Map<String, Object> list(@RequestParam(required = false) String status, @RequestParam(required = false) String kind,
			@RequestParam(required = false) String from, @RequestParam(required = false) String to,
			@RequestParam(required = false) String page, @RequestParam(required = false) String size) {
		Viewer.current().requireAdminView();
		AdminPage p = AdminPage.of(page, size);
		String st = status == null || status.isBlank() ? "open" : status.strip();
		if (!st.equals("all") && !STATUSES.contains(st)) throw ApiException.invalid("status 는 open · done · ignored · all 가운데 하나예요.");
		StringBuilder where = new StringBuilder(" WHERE 1 = 1");
		List<Object> args = new ArrayList<>();
		if (kind != null && !kind.isBlank()) {
			if (!KINDS.contains(kind.strip())) throw ApiException.invalid("kind 는 shoe · term · feature 가운데 하나예요.");
			where.append(" AND kind = ?");
			args.add(kind.strip());
		}
		LocalDateTime f = AdminPage.fromKst(from), t = AdminPage.toKstExclusive(to);
		if (f != null) { where.append(" AND created_at >= ?"); args.add(Timestamp.valueOf(f)); }
		if (t != null) { where.append(" AND created_at < ?"); args.add(Timestamp.valueOf(t)); }
		// 묶음의 마지막 줄(id 가 가장 큰 줄) — 마지막 원문 · 마지막 상태.
		// 처리한 줄 가운데 마지막(d) — 사유 · 그때 상태(V24). 처리한 뒤 새 질문이 와서 다시 「처리 안 함」이 된 묶음도 왜 그렇게 했는지 보이게
		// (마지막 줄은 새 질문이라 사유가 없다)
		String grouped = """
				SELECT g.kind, g.query, g.cnt, g.open_cnt, g.last_at, g.last_id, m.message, m.status AS last_status, m.decided_at,
				       CASE WHEN g.open_cnt > 0 THEN 'open' ELSE COALESCE(m.status, 'open') END AS state,
				       d.status AS prev_status, d.decided_at AS prev_at, d.decided_note AS prev_note
				  FROM (SELECT kind, query, COUNT(*) AS cnt, SUM(status IS NULL) AS open_cnt, MAX(created_at) AS last_at, MAX(id) AS last_id,
				               MAX(CASE WHEN status IS NOT NULL THEN id END) AS dec_id
				          FROM chatbot_misses""" + where + """
				         GROUP BY kind, query) g
				  JOIN chatbot_misses m ON m.id = g.last_id
				  LEFT JOIN chatbot_misses d ON d.id = g.dec_id""";
		String outer = st.equals("all") ? "" : " WHERE x.state = ?";
		List<Object> outerArgs = new ArrayList<>(args);
		if (!st.equals("all")) outerArgs.add(st);
		long total = jdbc.queryForObject("SELECT COUNT(*) FROM (" + grouped + ") x" + outer, Long.class, outerArgs.toArray());
		List<Object> pageArgs = new ArrayList<>(outerArgs);
		pageArgs.add(p.size());
		pageArgs.add(p.offset());
		List<Map<String, Object>> items = jdbc.query("SELECT * FROM (" + grouped + ") x" + outer + " ORDER BY x.last_at DESC, x.last_id DESC LIMIT ? OFFSET ?",
				(rs, i) -> {
					Map<String, Object> d = new LinkedHashMap<>();
					d.put("kind", rs.getString("kind"));
					d.put("query", rs.getString("query"));
					d.put("count", rs.getInt("cnt"));
					d.put("open", rs.getInt("open_cnt"));
					d.put("lastAt", AT.format(rs.getTimestamp("last_at").toLocalDateTime()));
					d.put("lastMessage", rs.getString("message"));
					d.put("status", rs.getString("state"));
					Timestamp decided = rs.getTimestamp("decided_at");
					d.put("decidedAt", decided == null ? null : AT.format(decided.toLocalDateTime()));
					// 마지막으로 처리한 것(V24) — 처리함 · 무시 묶음이면 지금 상태와 같고, 다시 처리 안 함이 된 묶음이면 그 전의 것. 처리한 적 없으면 셋 다 null
					d.put("lastDecision", rs.getString("prev_status"));
					Timestamp prevAt = rs.getTimestamp("prev_at");
					d.put("lastDecidedAt", prevAt == null ? null : AT.format(prevAt.toLocalDateTime()));
					d.put("decidedNote", rs.getString("prev_note"));
					return d;
				}, pageArgs.toArray());
		return p.body(items, total);
	}

	/** 처리 사유(V24 decided_note) 최대 글자 수 */
	static final int NOTE_MAX = 200;

	/**
	 * 처리 상태 고르기 — 본문 {kind, query, status: "done" | "ignored" | "open", note?}. 그 묶음의 줄 전부에 적는다(open 은 되돌리기 — NULL).
	 * note 는 사유(선택, 2026-11-15 V24) — 글이 아니거나 200자를 넘으면 400, 비면 없음. 되돌리기는 사유도 비운다(보내도 쓰지 않는다).
	 * admin 만(데모 관리자 403 demo_admin). 없는 묶음 404. 활동 기록 admin.chatbot_miss.done · .ignored · .open(meta 에 사유)
	 */
	@PostMapping("/api/admin/chatbot-misses/decide")
	@Transactional
	Map<String, Object> decide(@RequestBody(required = false) Map<String, Object> body) {
		Viewer viewer = Viewer.current();
		viewer.requireUser();
		if (body == null || !(body.get("kind") instanceof String kind) || !KINDS.contains(kind)
				|| !(body.get("query") instanceof String q) || q.isBlank()
				|| !(body.get("status") instanceof String st) || !STATUSES.contains(st)) {
			throw ApiException.invalid("kind · query · status(done · ignored · open)를 보내 주세요.");
		}
		Object rawNote = body.get("note");
		if (rawNote != null && !(rawNote instanceof String)) throw ApiException.invalid("note(사유)는 글로 보내 주세요.");
		boolean reopen = st.equals("open");
		String note = reopen || rawNote == null || ((String) rawNote).isBlank() ? null : ((String) rawNote).strip();
		if (note != null && note.codePointCount(0, note.length()) > NOTE_MAX) throw ApiException.invalid("사유는 " + NOTE_MAX + "자까지 적을 수 있어요.");
		Integer rows = jdbc.queryForObject("SELECT COUNT(*) FROM chatbot_misses WHERE kind = ? AND query = ?", Integer.class, kind, q);
		if (rows == null || rows == 0) throw ApiException.notFound();
		viewer.requireAdmin();
		int n = jdbc.update("UPDATE chatbot_misses SET status = ?, decided_at = ?, decided_by = ?, decided_note = ? WHERE kind = ? AND query = ?",
				reopen ? null : st, reopen ? null : Timestamp.valueOf(LocalDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MILLIS)),
				reopen ? null : viewer.userId(), note, kind, q);
		Map<String, Object> meta = new LinkedHashMap<>();
		meta.put("kind", kind);
		meta.put("query", q);
		meta.put("rows", n);
		meta.put("note", note);
		activity.log(new Entry("admin.chatbot_miss." + st, viewer.userId(), "chatbot_miss", null, meta));
		Map<String, Object> d = new LinkedHashMap<>();
		d.put("kind", kind);
		d.put("query", q);
		d.put("status", st);
		d.put("note", note);
		d.put("rows", n);
		return d;
	}

	static boolean isLoopback(String addr) {
		if (addr == null || addr.isBlank()) return false;
		try {
			// 숫자 주소만 받는다 — 이름("localhost")이면 이름 조회가 일어나므로 거절
			if (!addr.matches("[0-9.]+|[0-9a-fA-F:.%]+")) return false;
			return InetAddress.getByName(addr).isLoopbackAddress();
		} catch (UnknownHostException e) {
			return false;
		}
	}

	private static String cut(String s, int max) {
		return s.length() <= max ? s : s.substring(0, max);
	}
}
