package com.kopo17.runshoes.activity;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kopo17.runshoes.auth.RequestInfo;
import jakarta.servlet.http.HttpServletRequest;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * activity_logs 에 한 줄 — 인증 이력 · 리뷰 · 찜 쓰기 · 조회(docs/AUTH_RATELIMIT_DESIGN.md 3 · 4절).
 * log: 부른 쪽 트랜잭션 안에서 — 롤백된 일의 기록은 남지 않는다.
 * logNow: 따로 커밋 — 401 · 429 로 끝나는 요청(로그인 실패 · 시도 제한 · refresh 재사용)의 기록이 사라지면 시도 제한이 세지 못한다.
 * IP · User-Agent 는 인증 이벤트(auth.* · user.*)에만. 쓰기 · 조회에는 남기지 않는다. request_id 는 ingress 의 X-Request-ID(없으면 새로)
 */
@Component
public class ActivityLogger {

	private final JdbcTemplate jdbc;
	private final ObjectMapper json;
	private final TransactionTemplate separate;

	ActivityLogger(JdbcTemplate jdbc, ObjectMapper json, PlatformTransactionManager tx) {
		this.jdbc = jdbc;
		this.json = json;
		this.separate = new TransactionTemplate(tx);
		this.separate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
	}

	/** target 이 없으면 targetType · targetId 를 null 로 */
	public record Entry(String event, Long userId, String targetType, Long targetId, Map<String, Object> meta) {
		public static Entry of(String event, Long userId, String targetType, Long targetId) {
			return new Entry(event, userId, targetType, targetId, null);
		}

		public Entry meta(Map<String, Object> m) {
			return new Entry(event, userId, targetType, targetId, m);
		}
	}

	public void log(Entry e) {
		insert(e);
	}

	public void logNow(Entry e) {
		separate.executeWithoutResult(s -> insert(e));
	}

	static boolean isAuthEvent(String event) {
		return event.startsWith("auth.") || event.startsWith("user.");
	}

	private void insert(Entry e) {
		HttpServletRequest req = currentRequest();
		RequestInfo info = req != null && isAuthEvent(e.event()) ? RequestInfo.of(req) : null;
		String requestId = req == null ? null : req.getHeader("X-Request-ID");
		if (req != null && (requestId == null || requestId.isBlank())) requestId = UUID.randomUUID().toString();
		jdbc.update("""
				INSERT INTO activity_logs (occurred_at, user_id, event, target_type, target_id, meta, ip, user_agent, request_id)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
				Timestamp.valueOf(now()), e.userId(), e.event(), e.targetType(), e.targetId(), metaJson(e.meta()),
				info == null ? null : info.ip(), info == null ? null : info.userAgent(), cut(requestId, 64));
	}

	private String metaJson(Map<String, Object> meta) {
		if (meta == null || meta.isEmpty()) return null;
		try {
			return json.writeValueAsString(meta);
		} catch (JsonProcessingException ex) {
			throw new IllegalStateException(ex);
		}
	}

	private static HttpServletRequest currentRequest() {
		return RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes a ? a.getRequest() : null;
	}

	static LocalDateTime now() {
		return LocalDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MILLIS);
	}

	private static String cut(String s, int max) {
		return s == null ? null : s.length() <= max ? s : s.substring(0, max);
	}
}
