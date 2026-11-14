package com.kopo17.runshoes.summary;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Component;

/**
 * 요약 배치의 실행 기록(V20 summary_batch_runs · summary_batch_failures).
 * 기록은 덤이다 — 어느 메서드도 던지지 않는다. 쓰기가 실패하면 경고 로그만 남기고 배치(요약 만들기)는 끝까지 돈다.
 * 시작 줄을 넣지 못했으면(runId null) 그 실행의 실패 줄 · 끝 고치기는 건너뛴다.
 */
@Component
public class BatchRunLog {

	private static final Logger log = LoggerFactory.getLogger(BatchRunLog.class);
	static final int REASON_MAX = 300, ERROR_MAX = 500;

	private final JdbcTemplate jdbc;

	BatchRunLog(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	/** 시작 줄(result running) — 넣은 run_id, 실패하면 null */
	public Long start(LocalDateTime startedAt) {
		try {
			GeneratedKeyHolder key = new GeneratedKeyHolder();
			jdbc.update(con -> {
				PreparedStatement ps = con.prepareStatement(
						"INSERT INTO summary_batch_runs (started_at, result) VALUES (?, 'running')", Statement.RETURN_GENERATED_KEYS);
				ps.setTimestamp(1, Timestamp.valueOf(startedAt));
				return ps;
			}, key);
			Number id = key.getKey();
			return id == null ? null : id.longValue();
		} catch (Exception e) {
			log.warn("[summary-batch] 실행 기록 시작 줄을 넣지 못했다 — 배치는 그대로 돈다: {}", e.toString());
			return null;
		}
	}

	/** 만들지 못한 켤레 한 줄 */
	public void failure(Long runId, long shoeId, Exception cause) {
		if (runId == null) return;
		try {
			jdbc.update("INSERT INTO summary_batch_failures (run_id, shoe_id, reason, created_at) VALUES (?, ?, ?, ?)",
					runId, shoeId, cut(reason(cause), REASON_MAX), Timestamp.valueOf(now()));
		} catch (Exception e) {
			log.warn("[summary-batch] 실패 기록을 넣지 못했다(shoeId={}): {}", shoeId, e.toString());
		}
	}

	/** 끝 — ran 이면 r 의 숫자를, skipped · error 면 숫자 없이 */
	public void finish(Long runId, String result, SummaryBatch.Result r, long durationMs, String error) {
		if (runId == null) return;
		try {
			boolean ran = r != null && r.ran();
			jdbc.update("""
					UPDATE summary_batch_runs SET finished_at = ?, result = ?, target = ?, ok = ?, failed = ?, restaled = ?, gone = ?,
					       duration_ms = ?, error = ? WHERE run_id = ?""",
					Timestamp.valueOf(now()), result,
					ran ? r.target() : null, ran ? r.ok() : null, ran ? r.failed() : null, ran ? r.restaled() : null, ran ? r.gone() : null,
					durationMs, error == null ? null : cut(error, ERROR_MAX), runId);
		} catch (Exception e) {
			log.warn("[summary-batch] 실행 기록 끝 줄을 고치지 못했다(runId={}): {}", runId, e.toString());
		}
	}

	static String reason(Throwable e) {
		if (e == null) return "알 수 없음";
		String m = e.getMessage();
		return m == null || m.isBlank() ? e.getClass().getSimpleName() : e.getClass().getSimpleName() + ": " + m;
	}

	static LocalDateTime now() {
		return LocalDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MILLIS);
	}

	private static String cut(String s, int max) {
		return s.length() <= max ? s : s.substring(0, max);
	}
}
