package com.kopo17.runshoes.auth;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

/**
 * 시도 제한의 카운팅 키 — 정규화한 이메일의 HMAC-SHA256 앞 8바이트(activity_logs.target_id, target_type='email').
 * **세는 데만** 쓴다: 없는 이메일도 같은 기준으로 세야 하는데 그때는 user_id 가 없다. 사람이 읽는 것은 user_id 다(docs/AUTH_RATELIMIT_DESIGN.md 3절).
 * 키는 JWT 서명 키에서 용도를 붙여 따로 뽑는다 — JWT_SECRET 을 바꾸면 세던 것이 처음부터(시도 제한 창은 15분이라 상관없다)
 */
@Component
class EmailKey {

	private final SecretKeySpec key;

	EmailKey(SecretKey jwtKey) {
		this.key = new SecretKeySpec(hmac(new SecretKeySpec(jwtKey.getEncoded(), "HmacSHA256"), "runshoes:activity:email"), "HmacSHA256");
	}

	long of(String normalizedEmail) {
		return ByteBuffer.wrap(hmac(key, normalizedEmail)).getLong();
	}

	private static byte[] hmac(SecretKeySpec k, String s) {
		try {
			Mac mac = Mac.getInstance("HmacSHA256");
			mac.init(k);
			return mac.doFinal(s.getBytes(StandardCharsets.UTF_8));
		} catch (GeneralSecurityException e) {
			throw new IllegalStateException(e);
		}
	}
}
