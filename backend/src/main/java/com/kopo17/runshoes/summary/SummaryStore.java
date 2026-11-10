package com.kopo17.runshoes.summary;

import com.kopo17.runshoes.summary.StaleRule.Action;
import com.kopo17.runshoes.summary.StaleRule.Row;
import com.kopo17.runshoes.summary.StaleRule.Verdict;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * shoe_summaries(V14) 읽기 · 쓰기 — 엔티티 없이 JDBC 로. 판단은 StaleRule, 이 클래스는 행을 잠그고 결과를 적용만 한다.
 * 신발 행을 먼저 잠근다(SELECT … FOR UPDATE) — 리뷰 쓰기(ReviewCollection → Ratings.lock)와 같은 순서라, 배치의 저장과 리뷰 쓰기가 한 줄로 선다.
 */
@Component
public class SummaryStore {

	private static final Logger log = LoggerFactory.getLogger(SummaryStore.class);

	/** 조회용 — 만든 요약(positive 가 있다). generatedAt 은 UTC */
	public record Saved(String positive, String negative, int reviewCount, LocalDateTime generatedAt) {}

	public enum SaveResult { SAVED, RESTALED, GONE }

	private final JdbcTemplate jdbc;

	SummaryStore(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	static LocalDateTime nowUtc() {
		return LocalDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MILLIS);   // DATETIME(3)
	}

	/**
	 * 리뷰를 쓰고 · 고치고 · 지운 뒤(같은 트랜잭션), 그리고 배치 시작의 전체 재판단에서 부른다.
	 * 조건에 맞으면 is_stale 만 세우고 끝낸다 — 요약을 만들지 않는다(응답이 기다리지 않게).
	 */
	@Transactional
	public Verdict judge(long shoeId) {
		lockShoe(shoeId);
		Row row = row(shoeId, true).orElse(null);
		Map<String, Object> c = jdbc.queryForMap("SELECT COUNT(*) AS n, COALESCE(SUM(rating), 0) AS total FROM reviews WHERE shoe_id = ?", shoeId);
		int n = ((Number) c.get("n")).intValue();
		double avg = n == 0 ? 0 : ((Number) c.get("total")).doubleValue() / n;
		Verdict v = StaleRule.judge(row, n, avg, nowUtc());
		switch (v.action()) {
			case CREATE -> jdbc.update("INSERT INTO shoe_summaries (shoe_id, is_stale) VALUES (?, TRUE)", shoeId);
			case MARK_STALE -> jdbc.update("UPDATE shoe_summaries SET is_stale = TRUE WHERE shoe_id = ?", shoeId);
			case DELETE -> jdbc.update("DELETE FROM shoe_summaries WHERE shoe_id = ?", shoeId);
			case NONE -> { }
		}
		if (v.action() != Action.NONE) log.info("[summary] shoeId={} {} — {}", shoeId, v.action(), v.reason());
		return v;
	}

	/**
	 * 배치가 만든 요약을 저장한다. 입력으로 쓴 리뷰 수 · 평균을 같이 적고, 같은 트랜잭션에서 지금 값과 다시 비교한다 —
	 * Ollama 를 기다리는 사이 리뷰가 달렸으면 방금 저장한 요약을 다시 stale 로(RESTALED). 행이 그 사이 지워졌으면 GONE.
	 */
	@Transactional
	public SaveResult save(long shoeId, String positive, String negative, int inputCount, double inputAvg) {
		lockShoe(shoeId);
		int updated = jdbc.update("""
				UPDATE shoe_summaries SET positive = ?, negative = ?, review_count = ?, avg_rating = ?, generated_at = ?, is_stale = FALSE
				WHERE shoe_id = ?""", positive, negative, inputCount, inputAvg, nowUtc(), shoeId);   // LocalDateTime 그대로 — 시간대 변환 없이(UTC 로 적는다)
		if (updated == 0) return SaveResult.GONE;
		Verdict v = judge(shoeId);
		return v.action() == Action.NONE ? SaveResult.SAVED : SaveResult.RESTALED;
	}

	/** 조회 — 보이는 신발의 행만. 행이 없으면 empty, 행은 있는데 아직 만들지 않았으면 Optional.of(empty), 만들었으면 Optional.of(Saved) */
	@Transactional(readOnly = true)
	public Optional<Optional<Saved>> find(long shoeId) {
		List<Optional<Saved>> rows = jdbc.query("""
				SELECT ss.positive, ss.negative, ss.review_count, ss.generated_at FROM shoe_summaries ss
				JOIN shoes s ON s.id = ss.shoe_id AND s.deleted_at IS NULL WHERE ss.shoe_id = ?""",
				(rs, i) -> rs.getString("positive") == null ? Optional.<Saved>empty()
						: Optional.of(new Saved(rs.getString("positive"), rs.getString("negative"), rs.getInt("review_count"),
								rs.getObject("generated_at", LocalDateTime.class))),
				shoeId);
		return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
	}

	/** 배치가 볼 신발 — 보이는 신발 전체(재판단) */
	public List<Long> visibleShoeIds() {
		return jdbc.queryForList("SELECT id FROM shoes WHERE deleted_at IS NULL ORDER BY id", Long.class);
	}

	/** 배치가 만들 신발 — 보이는 신발 가운데 stale 인 것만 */
	public List<Long> staleShoeIds() {
		return jdbc.queryForList("""
				SELECT ss.shoe_id FROM shoe_summaries ss JOIN shoes s ON s.id = ss.shoe_id AND s.deleted_at IS NULL
				WHERE ss.is_stale ORDER BY ss.shoe_id""", Long.class);
	}

	/** 관리 화면 · 배치 로그 — 보이는 신발의 행만 센다 */
	public Map<String, Object> counts() {
		// 별칭에 n_ 을 붙인다 — generated 는 MySQL 예약어다
		Map<String, Object> m = jdbc.queryForMap("""
				SELECT COALESCE(SUM(ss.is_stale), 0) AS n_stale,
				       COALESCE(SUM(ss.positive IS NULL), 0) AS n_pending,
				       COALESCE(SUM(ss.positive IS NOT NULL), 0) AS n_generated,
				       COUNT(*) AS n_total
				FROM shoe_summaries ss JOIN shoes s ON s.id = ss.shoe_id AND s.deleted_at IS NULL""");
		Map<String, Object> out = new LinkedHashMap<>();
		for (String k : List.of("stale", "pending", "generated", "total")) out.put(k, ((Number) m.get("n_" + k)).intValue());
		return out;
	}

	private void lockShoe(long shoeId) {
		jdbc.queryForList("SELECT id FROM shoes WHERE id = ? FOR UPDATE", Long.class, shoeId);
	}

	private Optional<Row> row(long shoeId, boolean forUpdate) {
		List<Row> rows = jdbc.query("SELECT is_stale, review_count, avg_rating, generated_at FROM shoe_summaries WHERE shoe_id = ?" + (forUpdate ? " FOR UPDATE" : ""),
				(rs, i) -> {
					LocalDateTime t = rs.getObject("generated_at", LocalDateTime.class);
					Number rc = (Number) rs.getObject("review_count");
					Number avg = (Number) rs.getObject("avg_rating");
					return new Row(rs.getBoolean("is_stale"), rc == null ? null : rc.intValue(), avg == null ? null : avg.doubleValue(),
							t);
				}, shoeId);
		return rows.stream().findFirst();
	}
}
