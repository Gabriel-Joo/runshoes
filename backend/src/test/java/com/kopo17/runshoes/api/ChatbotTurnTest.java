package com.kopo17.runshoes.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** 챗봇 턴 기록(V19)의 본문 검사 — 쓰는 길(루프백만)은 ChatbotMissTest 와 같은 isLoopback 을 쓴다 */
class ChatbotTurnTest {

	static Map<String, Object> body() {
		Map<String, Object> b = new HashMap<>();
		b.put("connId", "0123456789abcdef0123456789abcdef");
		b.put("userId", 3);
		b.put("question", "노바블라스트 5 무게는?");
		b.put("answer", "아식스의 노바블라스트 5는 …");
		b.put("branch", "spec");
		b.put("byRule", true);
		b.put("llmOk", true);
		b.put("health", false);
		b.put("fallbackUsed", false);
		b.put("shoeCount", 1);
		b.put("latencyMs", 1834);
		b.put("routerMs", 612);
		b.put("searchMs", 0);
		b.put("genMs", 1101);
		b.put("catalogMs", 80);
		b.put("compareMs", 0);
		b.put("recommendMs", 0);
		b.put("reviewMs", 0);
		b.put("summaryMs", 0);
		return b;
	}

	@Test
	void parsesFullBody() {
		var t = ChatbotTurnController.parse(body());
		assertNotNull(t);
		assertEquals(3L, t.userId());
		assertEquals("spec", t.branch());
		assertEquals(1834, t.latencyMs());
		assertEquals(java.util.List.of(612, 0, 1101, 80, 0, 0, 0, 0), t.stages());   // STAGE_KEYS 순서
	}

	@Test
	void everyStageKeyIsRequired() {
		for (String k : ChatbotTurnController.STAGE_KEYS) {
			var b = body();
			b.remove(k);
			assertNull(ChatbotTurnController.parse(b), k);
		}
		assertEquals(ChatbotTurnController.STAGE_KEYS.size(), ChatbotTurnController.STAGE_COLUMNS.size());
	}

	@Test
	void nullsAreAllowedWhereTheTurnSkippedTheRouter() {
		var b = body();
		b.put("userId", null);
		b.put("byRule", null);
		b.put("llmOk", null);
		b.put("health", null);
		var t = ChatbotTurnController.parse(b);
		assertNotNull(t);
		assertNull(t.userId());
		assertNull(t.byRule());
	}

	@Test
	void errorTurnHasEmptyAnswer() {
		var b = body();
		b.put("answer", "");
		b.put("branch", "error");
		assertNotNull(ChatbotTurnController.parse(b));
	}

	@Test
	void rejectsBadBodies() {
		assertNull(ChatbotTurnController.parse(null));
		for (String[] kv : new String[][] {
				{"connId", null}, {"connId", ""}, {"connId", "x".repeat(33)}, {"question", " "}, {"answer", null},
				{"branch", ""}, {"branch", "x".repeat(21)}}) {
			var b = body();
			b.put(kv[0], kv[1]);
			assertNull(ChatbotTurnController.parse(b), kv[0] + "=" + kv[1]);
		}
		var b = body();
		b.put("latencyMs", -1);
		assertNull(ChatbotTurnController.parse(b));
		b = body();
		b.put("genMs", "12");
		assertNull(ChatbotTurnController.parse(b));
		b = body();
		b.put("health", "true");
		assertNull(ChatbotTurnController.parse(b));
		b = body();
		b.put("userId", "3");
		assertNull(ChatbotTurnController.parse(b));
		b = body();
		b.put("fallbackUsed", null);
		assertNull(ChatbotTurnController.parse(b));
	}

	@Test
	void cutsLongText() {
		var b = body();
		b.put("question", "가".repeat(600));
		b.put("answer", "나".repeat(20_000));
		var t = ChatbotTurnController.parse(b);
		assertEquals(ChatbotTurnController.QUESTION_MAX, t.question().length());
		assertEquals(ChatbotTurnController.ANSWER_MAX, t.answer().length());
	}
}
