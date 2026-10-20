package com.kopo17.runshoes.auth;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 로그인 · 가입 시도 제한 — Redis 없이 activity_logs 를 센다(Pod 가 여럿이어도 같은 수를 본다). docs/AUTH_RATELIMIT_DESIGN.md 1 · 2 · 7절.
 * 로그인: 최근 창(15분) 안의 실패 — 계정(이메일 키)은 마지막 성공 뒤의 것만(성공하면 리셋), IP 는 전부. 넘으면 마지막 실패에서 창만큼 막는다.
 *   잠긴 동안에는 맞는 비밀번호여도 같은 429 — 비밀번호를 검사하기 전에 센다(BCrypt 도 돌리지 않는다). 없는 이메일도 같은 기준.
 *   막힌 시도(auth.login.blocked)는 실패로 세지 않는다 — 두드릴수록 잠금이 길어지지 않게.
 * 가입: 같은 IP 의 성공한 가입이 1시간에 10건 — 그 가운데 가장 오래된 것에서 1시간 뒤 풀린다.
 */
@Component
class RateLimiter {

	static final List<String> FAILURES = List.of("auth.login.failure", "auth.password.failure");

	private final JdbcTemplate jdbc;
	private final RateLimitProperties props;

	RateLimiter(JdbcTemplate jdbc, RateLimitProperties props) {
		this.jdbc = jdbc;
		this.props = props;
	}

	/** 막혀 있으면 429(AuthException) */
	void checkLogin(long emailKey, String ip) {
		LocalDateTime now = now(), since = now.minus(props.loginWindow());
		Map<String, Object> acc = jdbc.queryForMap("""
				SELECT COUNT(*) AS n, MAX(occurred_at) AS last FROM activity_logs
				WHERE event IN ('auth.login.failure', 'auth.password.failure') AND target_type = 'email' AND target_id = ? AND occurred_at > ?
				  AND occurred_at > COALESCE((SELECT MAX(occurred_at) FROM activity_logs
				                              WHERE event = 'auth.login.success' AND target_type = 'email' AND target_id = ?), '1970-01-01')""",
				emailKey, Timestamp.valueOf(since), emailKey);
		blockIf(acc, props.loginAccount(), props.loginWindow(), now, LOGIN);
		if (ip == null) return;
		Map<String, Object> byIp = jdbc.queryForMap("""
				SELECT COUNT(*) AS n, MAX(occurred_at) AS last FROM activity_logs
				WHERE ip = ? AND event IN ('auth.login.failure', 'auth.password.failure') AND occurred_at > ?""", ip, Timestamp.valueOf(since));
		blockIf(byIp, props.loginIp(), props.loginWindow(), now, LOGIN);
	}

	void checkSignup(String ip) {
		if (ip == null) return;
		LocalDateTime now = now();
		List<Timestamp> nth = jdbc.queryForList("""
				SELECT occurred_at FROM activity_logs WHERE ip = ? AND event = 'auth.signup' AND occurred_at > ?
				ORDER BY occurred_at DESC LIMIT 1 OFFSET ?""", Timestamp.class, ip, Timestamp.valueOf(now.minus(props.signupWindow())), props.signupIp() - 1);
		if (!nth.isEmpty()) throw tooMany(nth.get(0).toLocalDateTime().plus(props.signupWindow()), now, SIGNUP);
	}

	private static void blockIf(Map<String, Object> row, int limit, Duration window, LocalDateTime now, String template) {
		long n = ((Number) row.get("n")).longValue();
		if (n < limit) return;
		Object v = row.get("last");                   // MySQL 드라이버는 DATETIME 을 LocalDateTime 으로 준다(다른 드라이버는 Timestamp)
		LocalDateTime last = v instanceof Timestamp t ? t.toLocalDateTime() : (LocalDateTime) v;
		throw tooMany(last.plus(window), now, template);
	}

	static final String LOGIN = "로그인 시도가 너무 많아요. %d분 뒤에 다시 해 주세요.";
	static final String SIGNUP = "가입 시도가 너무 많아요. %d분 뒤에 다시 해 주세요.";

	/** 남은 시간은 초(Retry-After), 문구는 분 올림 */
	static AuthException tooMany(LocalDateTime until, LocalDateTime now, String template) {
		long seconds = Math.max(1, (Duration.between(now, until).toMillis() + 999) / 1000);
		return AuthException.tooMany(seconds, String.format(template, (seconds + 59) / 60));
	}

	private static LocalDateTime now() {
		return LocalDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MILLIS);
	}
}
