package com.kopo17.runshoes.auth;

import com.kopo17.runshoes.activity.ActivityLogger;
import com.kopo17.runshoes.activity.ActivityLogger.Entry;
import java.time.LocalDateTime;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * 로그인 계정 잠금 — 관리자 회원 목록(2026-11-14 사용자)이 보고 푼다. 시도 제한의 속(RateLimiter · EmailKey)은 이 패키지 밖에 내지 않는다.
 * 계정에는 잠김 칸이 없다 — activity_logs 의 실패를 센다(계정 15분 5번 · IP 15분 20번, docs/04_auth.md 1-4).
 * 풀기는 「잠금 풀기」 기록(admin.login.unlock, 대상 = 이메일 키)을 남기고, 세는 쿼리가 그 뒤의 실패만 본다. IP 잠금은 계정 단위로 풀 수 없다.
 * 이메일은 users.email(소문자로 저장) 그대로 — 로그인이 키를 만들 때와 같다
 */
@Component
public class LoginLocks {

	private final RateLimiter limiter;
	private final EmailKey emailKey;
	private final ActivityLogger activity;

	LoginLocks(RateLimiter limiter, EmailKey emailKey, ActivityLogger activity) {
		this.limiter = limiter;
		this.emailKey = emailKey;
		this.activity = activity;
	}

	/** 잠겨 있으면 풀리는 때(UTC), 아니면 null */
	public LocalDateTime lockedUntil(String email) {
		return limiter.accountLockedUntil(emailKey.of(email));
	}

	/** 잠겨 있으면 풀고 기록한다(부른 쪽 트랜잭션 안). 잠겨 있지 않았으면 false — 기록하지 않는다 */
	public boolean unlock(long userId, String email, long adminId) {
		long key = emailKey.of(email);
		LocalDateTime until = limiter.accountLockedUntil(key);
		if (until == null) return false;
		activity.log(Entry.of(RateLimiter.UNLOCK, adminId, "email", key).meta(Map.of("userId", userId)));
		return true;
	}
}
