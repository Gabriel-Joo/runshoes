package com.kopo17.runshoes.api;

import jakarta.servlet.http.HttpServletRequest;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 챗봇 대화 한 턴에 한 줄(V19 chatbot_turns) — docs/09_chatbot_rag.md 18절.
 * POST /api/internal/chatbot-turns  챗봇 사이드카만 — V18(ChatbotMissController)과 같이 같은 Pod 안에서 127.0.0.1:3000 으로 들어온
 *                                   연결만 받는다(localAddr 를 본다, 그 밖은 404 {}).
 *                                   본문 {connId, userId, question, answer, branch, byRule, llmOk, health, fallbackUsed, shoeCount,
 *                                         latencyMs, routerMs, searchMs, genMs, catalogMs, compareMs, recommendMs, reviewMs, summaryMs}
 *                                   → 204. 잘못된 본문 400 {}
 * 읽는 API 는 두지 않는다 — 대시보드가 DB 복제본을 읽는다(A-3).
 */
@RestController
class ChatbotTurnController {

	static final int CONN_MAX = 32, QUESTION_MAX = 500, BRANCH_MAX = 20;
	/** TEXT 는 65,535바이트 — utf8mb4 한 글자 최대 4바이트라 글자 수로 넉넉히 자른다 */
	static final int ANSWER_MAX = 16_000;

	private final JdbcTemplate jdbc;

	ChatbotTurnController(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	/** 단계별 시간 칸 — 본문 키와 DB 칸 이름(chatbot/timing.py STAGES 와 같은 순서). 그 턴에 안 쓴 단계는 0 */
	static final List<String> STAGE_KEYS = List.of("routerMs", "searchMs", "genMs", "catalogMs", "compareMs", "recommendMs", "reviewMs", "summaryMs");
	static final List<String> STAGE_COLUMNS = List.of("router_ms", "search_ms", "gen_ms", "catalog_ms", "compare_ms", "recommend_ms", "review_ms", "summary_ms");

	record Turn(String connId, Long userId, String question, String answer, String branch, Boolean byRule, Boolean llmOk,
			Boolean health, boolean fallbackUsed, int shoeCount, int latencyMs, List<Integer> stages) {}

	@PostMapping("/api/internal/chatbot-turns")
	ResponseEntity<Void> record(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
		if (!ChatbotMissController.isLoopback(req.getLocalAddr())) throw ApiException.notFound();
		Turn t = parse(body);
		if (t == null) throw ApiException.badRequest("connId · question · answer · branch · 시간");
		List<Object> args = new ArrayList<>(List.of(t.connId()));
		args.add(t.userId());   // List.of 는 null 을 받지 않는다
		args.add(Timestamp.valueOf(LocalDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MILLIS)));
		args.addAll(Arrays.asList(t.question(), t.answer(), t.branch(), t.byRule(), t.llmOk(), t.health(), t.fallbackUsed(), t.shoeCount(), t.latencyMs()));
		args.addAll(t.stages());
		jdbc.update("INSERT INTO chatbot_turns (conn_id, user_id, created_at, question, answer, branch, by_rule, llm_ok, health, "
				+ "fallback_used, shoe_count, latency_ms, " + String.join(", ", STAGE_COLUMNS) + ") VALUES ("
				+ String.join(", ", Collections.nCopies(args.size(), "?")) + ")", args.toArray());
		return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
	}

	/** 본문 → 한 줄. 틀리면 null(400). 글은 칸 길이에서 자른다 */
	static Turn parse(Map<String, Object> b) {
		if (b == null) return null;
		if (!(b.get("connId") instanceof String conn) || conn.isBlank() || conn.length() > CONN_MAX) return null;
		if (!(b.get("question") instanceof String q) || q.isBlank()) return null;
		if (!(b.get("answer") instanceof String a)) return null;   // 빈 글은 받는다(턴이 예외로 끝남 — branch error)
		if (!(b.get("branch") instanceof String br) || br.isBlank() || br.length() > BRANCH_MAX) return null;
		Object uid = b.get("userId");
		if (uid != null && !(uid instanceof Integer || uid instanceof Long)) return null;
		if (!(b.get("fallbackUsed") instanceof Boolean fb)) return null;
		Integer shoes = count(b.get("shoeCount"), Short.MAX_VALUE), total = count(b.get("latencyMs"), Integer.MAX_VALUE);
		if (shoes == null || total == null) return null;
		List<Integer> stages = new ArrayList<>();
		for (String k : STAGE_KEYS) {
			Integer v = count(b.get(k), Integer.MAX_VALUE);
			if (v == null) return null;
			stages.add(v);
		}
		// 참 · 거짓 · 없음(null) 셋 — 그 밖의 값은 400
		for (String k : new String[] {"byRule", "llmOk", "health"}) {
			if (b.get(k) != null && !(b.get(k) instanceof Boolean)) return null;
		}
		return new Turn(conn.strip(), uid == null ? null : ((Number) uid).longValue(), cut(q.strip(), QUESTION_MAX), cut(a, ANSWER_MAX),
				br.strip(), (Boolean) b.get("byRule"), (Boolean) b.get("llmOk"), (Boolean) b.get("health"), fb,
				shoes, total, List.copyOf(stages));
	}

	/** 0 이상 정수만, 위는 칸 크기에서 자른다 */
	private static Integer count(Object v, int max) {
		if (!(v instanceof Integer || v instanceof Long)) return null;
		long n = ((Number) v).longValue();
		return n < 0 ? null : (int) Math.min(n, max);
	}

	private static String cut(String s, int max) {
		return s.length() <= max ? s : s.substring(0, max);
	}
}
