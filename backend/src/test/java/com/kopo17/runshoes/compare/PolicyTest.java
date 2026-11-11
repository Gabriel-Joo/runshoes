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

	private static Map<String, String> ask(String width, String cushion, String price) {
		return Map.of("purpose", "조깅·회복주", "width", width, "stability", "중립화", "cushion", cushion, "price", price);
	}

	@Test
	void missingDataIsNotScored() {
		// 스택 · 가격 없는 신발 — 두 조건을 점수 · 만점에서 함께 뺀다. 못 본 것이 둘이라 후보에서는 빠진다(하한선)
		var r = RecommendPolicy.evaluate(shoe(1, null, null, "보통", false), ask("unknown", "high", "low"));
		assertEquals(70, r.score());
		assertEquals(70, r.max());
		assertEquals(2, r.checked());
		assertEquals(List.of("cushion", "price"), r.skipped());
		assertEquals(List.of("스택 · 가격 정보가 없어 쿠션 · 예산은 보지 않았어요"), r.notes());
		assertEquals(List.of(), RecommendPolicy.top3(List.of(shoe(1, null, null, "보통", false)), ask("unknown", "high", "low")));
	}

	@Test
	void normalWidthIsNotACondition() {
		// "보통"을 고르면 발볼을 보지 않는다 — 보통 신발도 점수 없음, 만점에도 없음(10_recommend.md)
		var r = RecommendPolicy.evaluate(shoe(1, 40.0, 150000.0, "보통", false), ask("보통", "high", "low"));
		assertEquals(110, r.score());
		assertEquals(110, r.max());
		assertEquals("발볼은 보통로 나왔어요", r.reasons().get(1).text());
	}

	@Test
	void sameRatioPrefersMoreChecked() {
		// 둘 다 만점 비율 — 판단한 조건이 많은 쪽이 앞(평점이 낮아도)
		Spec full = new Spec(1, "A", "조깅·회복주", "중립화", 42.0, 8.0, 270.0, 270.0, "M9", false, "a", true, 150000.0, "넓음", false, null, 1.0, 1, 0);
		Spec thin = new Spec(2, "B", "조깅·회복주", "중립화", 42.0, 8.0, 270.0, 270.0, "M9", false, "b", true, null, "넓음", false, null, 5.0, 30, 50);
		var top = RecommendPolicy.top3(List.of(thin, full), ask("넓음", "high", "low"));
		assertEquals(List.of(1L, 2L), top.stream().map(x -> x.shoe().id()).toList());
		assertEquals(List.of("가격 정보가 없어 예산은 보지 않았어요"), top.get(1).notes());
	}

	@Test
	void budgetIsACeiling() {
		// 30만원까지 — 19만원도 맞는다(전에는 20~30만 구간만). 상한은 포함, 넘으면 안 맞음
		var cheap = RecommendPolicy.evaluate(shoe(1, 40.0, 199000.0, "보통", false), ask("unknown", "high", "mid"));
		assertEquals("예산에 맞아요 (199,000원)", cheap.reasons().get(cheap.reasons().size() - 1).text());
		var edge = RecommendPolicy.evaluate(shoe(2, 40.0, 300000.0, "보통", false), ask("unknown", "high", "mid"));
		assertEquals(edge.max(), edge.score());
		var over = RecommendPolicy.evaluate(shoe(3, 40.0, 309000.0, "보통", false), ask("unknown", "high", "mid"));
		assertEquals(over.max() - 20, over.score());
		// high(화면에서 뺀 옛 값)는 "상관없어요"와 같다 — 조건이 아니라 만점에 없다
		var any = RecommendPolicy.evaluate(shoe(4, 40.0, 109000.0, "보통", false), ask("unknown", "high", "high"));
		assertEquals(RecommendPolicy.evaluate(shoe(4, 40.0, 109000.0, "보통", false), ask("unknown", "high", "unknown")), any);
	}
}
