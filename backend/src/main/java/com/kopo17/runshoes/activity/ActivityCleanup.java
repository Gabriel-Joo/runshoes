package com.kopo17.runshoes.activity;

import java.sql.Timestamp;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * activity_logs 정리 — 매일(기본 04:00 KST) 보관 기간이 지난 행을 5,000건씩 지운다(한 번에 오래 잠그지 않게).
 * 이벤트 앞부분(LIKE 'auth.%' …)마다 따로 — (event, occurred_at) 인덱스를 탄다. Pod 가 여럿이면 같은 DELETE 를 두 번 할 뿐이다(멱등).
 * 끝나면 지운 수 · 남은 행 수를 로그 한 줄로, 남은 행이 경고선을 넘으면 WARN — Loki 를 붙이면 이 줄에 경보를 건다.
 */
@Component
class ActivityCleanup {

	private static final Logger log = LoggerFactory.getLogger(ActivityCleanup.class);
	private static final List<String> AUTH = List.of("auth.%", "user.%");
	private static final List<String> OTHER = List.of("review.%", "like.%", "review_like.%", "shoe.%", "compare.%");
	private static final int BATCH = 5000;

	private final JdbcTemplate jdbc;
	private final ActivityProperties props;

	ActivityCleanup(JdbcTemplate jdbc, ActivityProperties props) {
		this.jdbc = jdbc;
		this.props = props;
	}

	@Scheduled(cron = "${app.activity.cleanup-cron}", zone = "Asia/Seoul")
	void run() {
		long deleted = purge(AUTH, props.retentionAuth()) + purge(OTHER, props.retentionOther());
		long rows = jdbc.queryForObject("SELECT COUNT(*) FROM activity_logs", Long.class);
		if (rows > props.warnRows()) {
			log.warn("activity_logs 가 커졌다 — {}행(경고선 {}). 지난 정리에서 {}행 지움. docs/AUTH_RATELIMIT_DESIGN.md 6절", rows, props.warnRows(), deleted);
		} else {
			log.info("activity_logs 정리 — {}행 지움, {}행 남음", deleted, rows);
		}
	}

	private long purge(List<String> prefixes, java.time.Duration keep) {
		Timestamp before = Timestamp.valueOf(ActivityLogger.now().minus(keep));
		long total = 0;
		for (String p : prefixes) {
			int n;
			do {
				n = jdbc.update("DELETE FROM activity_logs WHERE event LIKE ? AND occurred_at < ? LIMIT " + BATCH, p, before);
				total += n;
			} while (n == BATCH);
		}
		return total;
	}
}
