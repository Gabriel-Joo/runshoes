package com.kopo17.runshoes.api;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/** 챗봇 내부 POST(V18)는 같은 Pod 의 루프백으로 들어온 연결만 받는다 — 컨트롤러는 localAddr 를 이 검사에 넣는다 */
class ChatbotMissTest {

	@Test
	void loopbackOnly() {
		assertTrue(ChatbotMissController.isLoopback("127.0.0.1"));
		assertTrue(ChatbotMissController.isLoopback("0:0:0:0:0:0:0:1"));
		assertTrue(ChatbotMissController.isLoopback("::1"));
		assertFalse(ChatbotMissController.isLoopback("10.244.1.17"));     // ingress 를 거친 요청 — 다른 Pod
		assertFalse(ChatbotMissController.isLoopback("192.168.122.1"));
		assertFalse(ChatbotMissController.isLoopback(""));
		assertFalse(ChatbotMissController.isLoopback(null));
		assertFalse(ChatbotMissController.isLoopback("localhost"));         // 이름은 받지 않는다(이름 조회 없음)
	}
}
