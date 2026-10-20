package com.kopo17.runshoes.activity;

import com.kopo17.runshoes.activity.ActivityLogger.Entry;
import com.kopo17.runshoes.domain.ShoeRepository;
import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * POST /api/activity — 화면이 알려 주는 조회(docs/AUTH_RATELIMIT_DESIGN.md 3절). 로그인한 사람만(401 은 SecurityConfig).
 * {type:"shoe.view", shoeId} — 같은 사람 · 같은 신발은 30분에 한 번만 남긴다. {type:"compare.view", shoeIds:[…]} — 2~3개, 같은 조합은 30분에 한 번.
 * 언제나 204(남겼는지 말하지 않는다). 없는 신발 404, 모르는 type · 모양 400 — 본문은 {}.
 */
@RestController
class ActivityController {

	private static final int DEDUPE_MINUTES = 30;

	private final ActivityLogger activity;
	private final ShoeRepository shoes;
	private final JdbcTemplate jdbc;

	ActivityController(ActivityLogger activity, ShoeRepository shoes, JdbcTemplate jdbc) {
		this.activity = activity;
		this.shoes = shoes;
		this.jdbc = jdbc;
	}

	record Body(String type, Long shoeId, List<Long> shoeIds) {}

	static class Bad extends RuntimeException {
		final HttpStatus status;

		Bad(HttpStatus status) {
			this.status = status;
		}
	}

	@PostMapping("/api/activity")
	@Transactional
	ResponseEntity<Void> record(@AuthenticationPrincipal Jwt jwt, @RequestBody(required = false) Body b) {
		long userId = Long.parseLong(jwt.getSubject());
		if (b == null || b.type() == null) throw new Bad(HttpStatus.BAD_REQUEST);
		Timestamp since = Timestamp.valueOf(ActivityLogger.now().minusMinutes(DEDUPE_MINUTES));
		switch (b.type()) {
			case "shoe.view" -> {
				if (b.shoeId() == null) throw new Bad(HttpStatus.BAD_REQUEST);
				if (!shoes.existsById(b.shoeId())) throw new Bad(HttpStatus.NOT_FOUND);
				Integer seen = jdbc.queryForObject("""
						SELECT COUNT(*) FROM activity_logs WHERE user_id = ? AND event = 'shoe.view' AND target_id = ? AND occurred_at > ?""",
						Integer.class, userId, b.shoeId(), since);
				if (seen == 0) activity.log(Entry.of("shoe.view", userId, "shoe", b.shoeId()));
			}
			case "compare.view" -> {
				List<Long> ids = b.shoeIds() == null ? List.of() : b.shoeIds().stream().distinct().sorted().toList();
				if (ids.size() < 2 || ids.size() > 3) throw new Bad(HttpStatus.BAD_REQUEST);
				if (shoes.countByIdIn(ids) != ids.size()) throw new Bad(HttpStatus.NOT_FOUND);
				String meta = "{\"shoeIds\": " + ids + "}";
				Integer seen = jdbc.queryForObject("""
						SELECT COUNT(*) FROM activity_logs WHERE user_id = ? AND event = 'compare.view' AND occurred_at > ? AND meta = CAST(? AS JSON)""",
						Integer.class, userId, since, meta);
				if (seen == 0) activity.log(new Entry("compare.view", userId, null, null, Map.of("shoeIds", ids)));
			}
			default -> throw new Bad(HttpStatus.BAD_REQUEST);
		}
		return ResponseEntity.noContent().build();
	}

	@ExceptionHandler(Bad.class)
	ResponseEntity<Object> bad(Bad e) {
		return ResponseEntity.status(e.status).body(Map.of());
	}
}
