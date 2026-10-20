package com.kopo17.runshoes.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import java.time.LocalDateTime;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;

/** 429 의 남은 시간(초 올림 · 분 올림)과 이메일 카운팅 키 — DB 없이 */
class RateLimitTest {

	private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 21, 12, 0, 0);

	@Test
	void 남은_시간은_초로_올리고_문구는_분으로_올린다() {
		AuthException e = RateLimiter.tooMany(NOW.plusMinutes(15), NOW, RateLimiter.LOGIN);
		assertEquals(900, e.retryAfter);
		assertEquals("로그인 시도가 너무 많아요. 15분 뒤에 다시 해 주세요.", e.getMessage());
		assertEquals(429, e.status.value());
		assertEquals("RATE_LIMITED", e.code);

		e = RateLimiter.tooMany(NOW.plusSeconds(61).plusNanos(1_000_000), NOW, RateLimiter.LOGIN);
		assertEquals(62, e.retryAfter);                       // 61.001초 → 62초
		assertEquals("로그인 시도가 너무 많아요. 2분 뒤에 다시 해 주세요.", e.getMessage());

		e = RateLimiter.tooMany(NOW.minusSeconds(5), NOW, RateLimiter.SIGNUP);   // 이미 지났어도 최소 1초
		assertEquals(1, e.retryAfter);
		assertEquals("가입 시도가 너무 많아요. 1분 뒤에 다시 해 주세요.", e.getMessage());
	}

	@Test
	void 이메일_키는_같은_입력에_같고_키마다_다르다() {
		EmailKey a = new EmailKey(new SecretKeySpec("test-secret-0123456789-0123456789-abcdef".getBytes(), "HmacSHA256"));
		EmailKey b = new EmailKey(new SecretKeySpec("another-secret-0123456789-0123456789-xyz".getBytes(), "HmacSHA256"));
		assertEquals(a.of("runner01@runshoes.test"), a.of("runner01@runshoes.test"));
		assertNotEquals(a.of("runner01@runshoes.test"), a.of("runner02@runshoes.test"));
		assertNotEquals(a.of("runner01@runshoes.test"), b.of("runner01@runshoes.test"));   // 서명 키가 바뀌면 처음부터
	}
}
