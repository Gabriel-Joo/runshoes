package com.kopo17.runshoes.api;

import jakarta.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 챗봇이 찾지 못한 신발 · 용어(V18) — 작업 5-1(docs/09_chatbot_rag.md 9절).
 * POST /api/internal/chatbot-misses  챗봇 사이드카만 — 같은 Pod 안에서 127.0.0.1:3000 으로 들어온 연결만 받는다(그 밖은 404 {}).
 *                                    연결이 들어온 서버 쪽 주소(localAddr)를 본다. remoteAddr 는 믿지 않는다 — Spring Boot 는 쿠버네티스에서
 *                                    forward-headers-strategy 를 NATIVE 로 보고 X-Forwarded-For 로 remoteAddr 를 바꾼다(내부 대역 · 127/8 을
 *                                    프록시로 믿는다). 그래서 클러스터 · LAN 에서 "X-Forwarded-For: 127.0.0.1" 이면 remoteAddr 가 127.0.0.1 이 됐다
 *                                    (2026-11-12 로컬 재현). ingress 는 Pod IP 로 들어오므로 localAddr 가 루프백일 수 없다.
 *                                    본문 {kind: "shoe"|"term"|"feature", query, message} → 204. 잘못된 본문 400 {}
 * GET  /api/admin/chatbot-misses     관리 화면 — query 로 묶어 센 목록 [{kind, query, count, lastAt, lastMessage}], 최근 순 200개.
 *                                    admin · 데모 관리자(보기만)
 */
@RestController
class ChatbotMissController {

	static final Set<String> KINDS = Set.of("shoe", "term", "feature");
	/** 다른 응답의 createdAt 과 같은 모양(UTC, ms) */
	static final DateTimeFormatter AT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
	static final int QUERY_MAX = 100, MESSAGE_MAX = 300, LIST_MAX = 200;

	private final JdbcTemplate jdbc;

	ChatbotMissController(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
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

	@GetMapping("/api/admin/chatbot-misses")
	List<Map<String, Object>> list() {
		Viewer.current().requireAdminView();
		// 묶음 안의 마지막 원문 — 같은 query 에서 id 가 가장 큰 행
		return jdbc.query("""
				SELECT g.kind, g.query, g.cnt, g.last_at, m.message
				  FROM (SELECT kind, query, COUNT(*) AS cnt, MAX(created_at) AS last_at, MAX(id) AS last_id
				          FROM chatbot_misses GROUP BY kind, query) g
				  JOIN chatbot_misses m ON m.id = g.last_id
				 ORDER BY g.last_at DESC, g.last_id DESC
				 LIMIT ?""",
				(rs, i) -> Map.<String, Object>of(
						"kind", rs.getString(1),
						"query", rs.getString(2),
						"count", rs.getInt(3),
						"lastAt", AT.format(rs.getTimestamp(4).toLocalDateTime()),
						"lastMessage", rs.getString(5)),
				LIST_MAX);
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
