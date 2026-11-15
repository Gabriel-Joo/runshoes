package com.kopo17.runshoes.api;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 챗봇 대화 보기(관리자 마이페이지, 2026-11-14 사용자 — docs/09_chatbot_rag.md 18절 「읽는 길」). chatbot_turns(V19)를 읽는다.
 * V19 때는 「읽는 API 를 두지 않는다 — 대시보드가 복제본을 읽는다」였다. 사용자가 이번에 관리자 화면에서 대화 원문을 보기로 정했다
 * (숫자 · 추세는 Grafana, 개별 대화는 관리자 화면). 대시보드 읽기 계정이 question · answer 를 못 읽는 것은 그대로다.
 *
 * GET /api/admin/chatbot-conversations?from=&to=&account=&branch=&page=&size=
 *     대화(= 웹소켓 연결 하나, conn_id) 목록 — 마지막 턴 최근 순, 서버 페이지 나누기 {items, total, page, size}.
 *     from · to 한국 날짜(그 사이에 턴이 있는 대화), account 는 계정 id(숫자) 또는 닉네임 부분 일치, branch 는 그 갈래 턴이 있는 대화.
 *     한 줄 {connId, userId, nickname, demo, startedAt, lastAt, turns, branches, firstQuestion}
 * GET /api/admin/chatbot-conversations/{connId}   그 대화의 턴 전부(차례대로) — 질문 · 답 전체, 갈래, 걸린 시간 · 단계별 시간
 * 권한: admin · 데모 관리자(보기만 — 쓰는 API 가 없다). 데모 관리자도 질문 · 답 원문을 본다(2026-11-15 사용자 — 시현용이라 가리면
 *   화면이 빈다. 실제 서비스로 가면 데모 관리자 계정을 지운다, docs/04_auth.md).
 * demo — 체험 계정(시드 runner01~30 · 데모 관리자)이면 true. 체험 계정의 대화는 한 사람의 것이 아니다(여럿이 함께 쓴다).
 */
@RestController
@RequestMapping("/api/admin/chatbot-conversations")
class AdminChatbotTurnController {

	/** 체험 계정 — UserRepository.seedUsers 와 같은 규칙 + 데모 관리자 */
	private static final String DEMO_ACCOUNT = "(u.role = 'DEMO_ADMIN' OR u.email REGEXP '^runner[0-9]{2}@runshoes[.]test$')";

	private final JdbcTemplate jdbc;

	AdminChatbotTurnController(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	@GetMapping
	@Transactional(readOnly = true)
	Map<String, Object> list(@RequestParam(required = false) String from, @RequestParam(required = false) String to,
			@RequestParam(required = false) String account, @RequestParam(required = false) String branch,
			@RequestParam(required = false) String page, @RequestParam(required = false) String size) {
		Viewer viewer = Viewer.current();
		viewer.requireAdminView();
		AdminPage p = AdminPage.of(page, size);
		StringBuilder where = new StringBuilder(" WHERE 1 = 1");
		List<Object> args = new ArrayList<>();
		LocalDateTime f = AdminPage.fromKst(from), t = AdminPage.toKstExclusive(to);
		if (f != null) { where.append(" AND t.created_at >= ?"); args.add(Timestamp.valueOf(f)); }
		if (t != null) { where.append(" AND t.created_at < ?"); args.add(Timestamp.valueOf(t)); }
		if (account != null && !account.isBlank()) {
			if (account.strip().matches("[0-9]{1,18}")) { where.append(" AND t.user_id = ?"); args.add(Long.parseLong(account.strip())); }
			else { where.append(" AND u.nickname LIKE ?"); args.add(AdminPage.like(account)); }
		}
		String having = "";
		if (branch != null && !branch.isBlank()) { having = " HAVING SUM(t.branch = ?) > 0"; args.add(branch.strip()); }
		String grouped = """
				SELECT t.conn_id, MIN(t.created_at) AS started_at, MAX(t.created_at) AS last_at, COUNT(*) AS turns, MAX(t.user_id) AS user_id,
				       GROUP_CONCAT(DISTINCT t.branch ORDER BY t.branch) AS branches, MIN(t.turn_id) AS first_turn
				  FROM chatbot_turns t LEFT JOIN users u ON u.id = t.user_id""" + where + " GROUP BY t.conn_id" + having;
		long total = jdbc.queryForObject("SELECT COUNT(*) FROM (" + grouped + ") g", Long.class, args.toArray());
		List<Object> pageArgs = new ArrayList<>(args);
		pageArgs.add(p.size());
		pageArgs.add(p.offset());
		List<Map<String, Object>> items = jdbc.query("""
				SELECT g.*, u.nickname, """ + DEMO_ACCOUNT + """
				        AS demo, ft.question AS first_question
				  FROM (""" + grouped + """
				       ) g
				  LEFT JOIN users u ON u.id = g.user_id
				  LEFT JOIN chatbot_turns ft ON ft.turn_id = g.first_turn
				 ORDER BY g.last_at DESC, g.first_turn DESC LIMIT ? OFFSET ?""",
				(rs, i) -> {
					Map<String, Object> d = new LinkedHashMap<>();
					d.put("connId", rs.getString("conn_id"));
					d.put("userId", rs.getObject("user_id", Long.class));
					d.put("nickname", rs.getString("nickname"));
					d.put("demo", rs.getBoolean("demo"));
					d.put("startedAt", at(rs, "started_at"));
					d.put("lastAt", at(rs, "last_at"));
					d.put("turns", rs.getInt("turns"));
					String b = rs.getString("branches");
					d.put("branches", b == null ? List.of() : Arrays.asList(b.split(",")));
					d.put("firstQuestion", rs.getString("first_question"));
					return d;
				}, pageArgs.toArray());
		return p.body(items, total);
	}

	/** 한 대화의 턴 — 없는 conn_id 는 404 */
	@GetMapping("/{connId}")
	@Transactional(readOnly = true)
	Map<String, Object> turns(@PathVariable String connId) {
		Viewer viewer = Viewer.current();
		viewer.requireAdminView();
		if (!connId.matches("[0-9a-zA-Z_-]{1,32}")) throw ApiException.notFound();
		List<Map<String, Object>> turns = jdbc.query("""
				SELECT turn_id, created_at, question, answer, branch, by_rule, llm_ok, health, fallback_used, shoe_count, latency_ms, """
				+ String.join(", ", ChatbotTurnController.STAGE_COLUMNS) + " FROM chatbot_turns WHERE conn_id = ? ORDER BY turn_id",
				(rs, i) -> turn(rs), connId);
		if (turns.isEmpty()) throw ApiException.notFound();
		Map<String, Object> d = new LinkedHashMap<>();
		d.put("connId", connId);
		d.put("turns", turns);
		return d;
	}

	private static Map<String, Object> turn(ResultSet rs) throws SQLException {
		Map<String, Object> d = new LinkedHashMap<>();
		d.put("turnId", rs.getLong("turn_id"));
		d.put("createdAt", at(rs, "created_at"));
		d.put("question", rs.getString("question"));
		d.put("answer", rs.getString("answer"));
		d.put("branch", rs.getString("branch"));
		d.put("byRule", rs.getObject("by_rule", Boolean.class));
		d.put("llmOk", rs.getObject("llm_ok", Boolean.class));
		d.put("health", rs.getObject("health", Boolean.class));
		d.put("fallbackUsed", rs.getBoolean("fallback_used"));
		d.put("shoeCount", rs.getInt("shoe_count"));
		d.put("latencyMs", rs.getInt("latency_ms"));
		Map<String, Object> stages = new LinkedHashMap<>();
		for (int i = 0; i < ChatbotTurnController.STAGE_KEYS.size(); i++) {
			stages.put(ChatbotTurnController.STAGE_KEYS.get(i), rs.getInt(ChatbotTurnController.STAGE_COLUMNS.get(i)));
		}
		d.put("stages", Collections.unmodifiableMap(stages));
		return d;
	}

	private static String at(ResultSet rs, String col) throws SQLException {
		LocalDateTime t = rs.getObject(col, LocalDateTime.class);
		return t == null ? null : Values.formatCreatedAt(t);
	}
}
