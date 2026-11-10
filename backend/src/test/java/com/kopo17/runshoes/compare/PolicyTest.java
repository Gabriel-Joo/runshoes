package com.kopo17.runshoes.compare;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** 비교 · 추천 계산의 JS 와 다르기 쉬운 곳 — 전수 대조는 scripts/parity/check.mjs */
class PolicyTest {

	private static Spec shoe(long id, Double stack, Double price, String width, Boolean wide) {
		return new Spec(id, "B", "조깅·회복주", "중립화", stack, 8.0, 270.0, 270.0, "M9", false, "b:" + id, true,
				price, width, wide, null, 4.0, 3, 1);
	}

	@Test
	void numbersLookLikeJs() {
		assertEquals("40", JsText.num(40.0));          // Java 는 "40.0"
		assertEquals("41.5", JsText.num(41.5));
		assertEquals("199,000", JsText.locale(199000));
		assertEquals("1,234.568", JsText.locale(1234.5678));
	}

	@Test
	void rankUsesMiddleForTies() {
		double[] arr = {1, 2, 3, 4, 5, 6, 7, 8};
		assertEquals("low", ComparePolicy.rankIn(arr, 1).band());
		assertEquals("high", ComparePolicy.rankIn(arr, 8).band());
		assertEquals(3, ComparePolicy.rankIn(arr, 3).order());
		assertEquals(1.0, ComparePolicy.stdev(new double[] {5, 5}));   // 0 이면 1
	}

	@Test
	void tieBreakIsNotIntegerDivision() {
		// 4.0 × 20 × (3 / 6) + 1 × 0.5 = 40.5 — 정수 나눗셈이면 0.5
		assertEquals(40.5, RecommendPolicy.tie(shoe(1, 40.0, 1.0, "보통", false)));
	}

	@Test
	void cushionTextIsCarriedAsIs() {
		// 그대로 옮긴 알려진 문제 — low 인데 37mm 면 "얇아요"(09 13절 남은 작업). 고치면 이 시험도 바꾼다
		var r = RecommendPolicy.evaluate(shoe(1, 37.0, null, "보통", false),
				Map.of("purpose", "레이스", "width", "unknown", "stability", "unknown", "cushion", "low", "price", "unknown"));
		assertEquals("쿠션이 원하시는 것보다 얇아요 (37mm)", r.reasons().get(3).text());
		assertEquals(List.of(false, false, false, false), r.reasons().stream().map(RecommendPolicy.Reason::hit).toList());
	}
}
