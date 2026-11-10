package com.kopo17.runshoes.summary;

import java.time.LocalDateTime;

/**
 * 요약을 다시 만들어야 하나(docs/09_chatbot_rag.md 5절, 2026-11-10 사용자) — 화면 · DB 와 떨어진 판단만. 시험: StaleRuleTest.
 * 리뷰 1건마다 다시 만들지 않는다. 절대 수가 아니라 비율로 본다 — 1,800건에 1건은 요약을 바꿀 이유가 못 되고, 4건에 3건이면 내용이 달라진다.
 * 리뷰 수 · 평균은 생성 입력과 같은 범위(그 신발의 리뷰 전부)로 센다.
 */
public final class StaleRule {

	public static final int MIN_REVIEWS = 3;          // 이보다 적으면 요약하지 않는다(현행 그대로)
	static final int COUNT_PERCENT = 10;              // 리뷰 수가 만들 때보다 10% 이상 변했다(늘거나 줄거나)
	static final double RATING_DELTA = 0.3;           // 평균 별점이 0.3 이상 움직였다
	static final int MAX_AGE_DAYS = 30;               // 만든 지 30일이 지났다
	private static final double EPS = 1e-9;           // 4.0 → 4.3 같은 경계가 부동소수 때문에 빠지지 않게

	public enum Action {
		NONE,          // 그대로
		CREATE,        // 행이 없는데 3건을 넘겼다 — "아직 만들지 않은" 행(stale)을 만든다
		MARK_STALE,    // 조건에 맞는다 — is_stale 만 세운다
		DELETE         // 3건 미만이 됐다 — 행을 지운다(조회는 빈 응답)
	}

	/** 저장된 행. reviewCount · avgRating · generatedAt 은 아직 만들지 않은 행이면 null */
	public record Row(boolean stale, Integer reviewCount, Double avgRating, LocalDateTime generatedAt) {}

	public record Verdict(Action action, String reason) {
		static Verdict of(Action a, String reason) { return new Verdict(a, reason); }
	}

	private StaleRule() {}

	/** row 가 null 이면 행이 없다. avg 는 count 가 0 이면 아무 값이나 */
	public static Verdict judge(Row row, int count, double avg, LocalDateTime now) {
		if (count < MIN_REVIEWS) return row == null ? Verdict.of(Action.NONE, "3건 미만") : Verdict.of(Action.DELETE, "3건 미만이 됐다");
		if (row == null) return Verdict.of(Action.CREATE, "3건을 넘겼다");
		if (row.stale()) return Verdict.of(Action.NONE, "이미 stale");
		if (row.reviewCount() == null || row.avgRating() == null || row.generatedAt() == null) return Verdict.of(Action.MARK_STALE, "만든 기록이 없다");
		int base = row.reviewCount();
		if (100L * Math.abs(count - base) >= (long) COUNT_PERCENT * base) {   // 정수로 — |변화| / 기준 ≥ 10%
			return Verdict.of(Action.MARK_STALE, "리뷰 수 " + base + " → " + count);
		}
		if (Math.abs(avg - row.avgRating()) >= RATING_DELTA - EPS) {
			return Verdict.of(Action.MARK_STALE, String.format("평균 별점 %.3f → %.3f", row.avgRating(), avg));
		}
		if (!row.generatedAt().plusDays(MAX_AGE_DAYS).isAfter(now)) return Verdict.of(Action.MARK_STALE, "만든 지 30일");
		return Verdict.of(Action.NONE, "조건 밖");
	}
}
