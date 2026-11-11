package com.kopo17.runshoes.compare;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** 비교 · 추천 계산의 JS 와 다르기 쉬운 곳 — 전수 대조는 scripts/parity/check.mjs */
class PolicyTest {

	private static Spec shoe(long id, Double stack, Double price, String width, Boolean wide) {
		return new Spec(id, "B", "모델 " + id, "조깅·회복주", "중립화", stack, 8.0, 270.0, 270.0, "M9", false, "b:" + id, true,
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

	private static String text(Spec s, String purpose, String stability, String cushion, String price, int i) {
		var r = RecommendPolicy.evaluate(s, Map.of("purpose", purpose, "width", "unknown", "stability", stability, "cushion", cushion, "price", price));
		return r.reasons().get(i).text();
	}

	@Test
	void cushionDirectionFollowsWanted() {
		// 작업 3-3 — 원한 범위와 견준다. low(35 미만)를 원했는데 37mm 면 "두꺼워요"(전에는 h >= 40 하나로 갈라 "얇아요")
		assertEquals("쿠션이 원하시는 것보다 두꺼워요 (37mm)", text(shoe(1, 37.0, null, "보통", false), "레이스", "unknown", "low", "unknown", 3));
		assertEquals("쿠션이 원하시는 것보다 얇아요 (37mm)", text(shoe(1, 37.0, null, "보통", false), "레이스", "unknown", "high", "unknown", 3));
		assertEquals("쿠션이 원하시는 것보다 두꺼워요 (41mm)", text(shoe(1, 41.0, null, "보통", false), "레이스", "unknown", "mid", "unknown", 3));
		assertEquals("쿠션이 원하시는 것보다 얇아요 (33mm)", text(shoe(1, 33.0, null, "보통", false), "레이스", "unknown", "mid", "unknown", 3));
	}

	@Test
	void missLineNamesOnlyCheckedHits() {
		// 맞은 조건이 없으면 사실만
		assertEquals("조깅·회복주용 신발이에요", text(shoe(1, 37.0, null, "보통", false), "레이스", "unknown", "low", "unknown", 0));
		// 하나만 맞으면 이름을 댄다 — 데이터가 없어 못 본 예산은 세지 않는다
		assertEquals("조깅·회복주용이지만 쿠션이 맞아요", text(shoe(1, 37.0, null, "보통", false), "레이스", "unknown", "mid", "low", 0));
		// 둘 이상 다 맞으면 "모두"
		assertEquals("조깅·회복주용이지만 다른 조건은 모두 맞아요", text(shoe(1, 37.0, 150000.0, "보통", false), "레이스", "중립화", "mid", "low", 0));
		// 하나라도 안 맞으면 맞은 것만, 꼬리는 안 맞은 첫 줄에만
		assertEquals("조깅·회복주용이지만 쿠션이 맞아요", text(shoe(1, 37.0, null, "보통", false), "레이스", "안정화", "mid", "unknown", 0));
		assertEquals("중립화 신발이에요", text(shoe(1, 37.0, null, "보통", false), "레이스", "안정화", "mid", "unknown", 2));
		// 판단한 다른 조건(용도 · 쿠션)이 다 맞으면 "모두" — 가격이 없어 못 본 예산은 세지 않는다
		assertEquals("중립화지만 다른 조건은 모두 맞아요", text(shoe(1, 37.0, null, "보통", false), "조깅·회복주", "안정화", "mid", "low", 2));
	}

	@Test
	void budgetSaysReleasePrice() {
		assertEquals("발매가가 예산보다 높아요 (309,000원) — 지금 파는 값은 더 낮을 수 있어요", text(shoe(1, 37.0, 309000.0, "보통", false), "조깅·회복주", "unknown", "mid", "mid", 4));
		assertEquals("발매가 309,000원이에요", text(shoe(1, 37.0, 309000.0, "보통", false), "조깅·회복주", "unknown", "mid", "unknown", 4));
	}

	@Test
	void josaFollowsLastSound() {
		assertEquals("보통으로", Josa.euro("보통"));
		assertEquals("좁음으로", Josa.euro("좁음"));
		assertEquals("발로", Josa.euro("발"));          // ㄹ 받침은 "로"
		assertEquals("본디 9는", Josa.of("본디 9", "은", "는"));   // 구 — 받침 없음
		assertEquals("클리프톤 10은", Josa.of("클리프톤 10", "은", "는"));
		assertEquals("넓음이고", Josa.of("넓음", "이고", "고"));
		assertEquals("안정화지만", Josa.of("안정화", "이지만", "지만"));
	}

	@Test
	void oldGenerationNamesVisibleCurrentOnly() {
		Spec old = new Spec(1, "H", "클리프톤 10", "조깅·회복주", "중립화", 40.0, 8.0, 270.0, 270.0, "M9", false, "h:clifton", false, 150000.0, "보통", false, null, 4.0, 3, 1);
		Spec cur = new Spec(2, "H", "클리프톤 11", "조깅·회복주", "중립화", 40.0, 8.0, 270.0, 270.0, "M9", false, "h:clifton", true, 150000.0, "보통", false, null, 4.0, 3, 1);
		var a = ask("unknown", "high", "low");
		assertEquals(List.of("지금은 다음 세대(클리프톤 11)가 나와 있어요"), RecommendPolicy.evaluate(old, a, RecommendPolicy.currentByLine(List.of(old, cur))).notes());
		// 현행이 숨겨져 목록에 없으면(@SQLRestriction) 아무 말도 하지 않는다
		assertEquals(List.of(), RecommendPolicy.evaluate(old, a, RecommendPolicy.currentByLine(List.of(old))).notes());
		assertEquals(List.of(), RecommendPolicy.evaluate(cur, a, RecommendPolicy.currentByLine(List.of(old, cur))).notes());
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
		assertEquals(100, r.score());   // 용도 40 + 안정성 30 + 쿠션 20 + 예산 10(작업 3-4)
		assertEquals(100, r.max());
		assertEquals("발볼은 보통으로 나왔어요", r.reasons().get(1).text());
	}

	@Test
	void sameRatioPrefersMoreChecked() {
		// 둘 다 만점 비율 — 판단한 조건이 많은 쪽이 앞(평점이 낮아도)
		Spec full = new Spec(1, "A", "에이", "조깅·회복주", "중립화", 42.0, 8.0, 270.0, 270.0, "M9", false, "a", true, 150000.0, "넓음", false, null, 1.0, 1, 0);
		Spec thin = new Spec(2, "B", "비", "조깅·회복주", "중립화", 42.0, 8.0, 270.0, 270.0, "M9", false, "b", true, null, "넓음", false, null, 5.0, 30, 50);
		var top = RecommendPolicy.top3(List.of(thin, full), ask("넓음", "high", "low"));
		assertEquals(List.of(1L, 2L), top.stream().map(x -> x.shoe().id()).toList());
		assertEquals(List.of("가격 정보가 없어 예산은 보지 않았어요"), top.get(1).notes());
	}

	@Test
	void budgetIsACeiling() {
		// 30만원까지 — 19만원도 맞는다(전에는 20~30만 구간만). 상한은 포함, 넘으면 안 맞음
		var cheap = RecommendPolicy.evaluate(shoe(1, 40.0, 199000.0, "보통", false), ask("unknown", "high", "mid"));
		assertEquals("예산에 맞아요 (발매가 199,000원)", cheap.reasons().get(cheap.reasons().size() - 1).text());
		var edge = RecommendPolicy.evaluate(shoe(2, 40.0, 300000.0, "보통", false), ask("unknown", "high", "mid"));
		assertEquals(edge.max(), edge.score());
		var over = RecommendPolicy.evaluate(shoe(3, 40.0, 309000.0, "보통", false), ask("unknown", "high", "mid"));
		assertEquals(over.max() - RecommendPolicy.BUDGET, over.score());
		assertEquals(10, RecommendPolicy.BUDGET);   // 작업 3-4 — 20 → 10
		// high(화면에서 뺀 옛 값)는 "상관없어요"와 같다 — 조건이 아니라 만점에 없다
		var any = RecommendPolicy.evaluate(shoe(4, 40.0, 109000.0, "보통", false), ask("unknown", "high", "high"));
		assertEquals(RecommendPolicy.evaluate(shoe(4, 40.0, 109000.0, "보통", false), ask("unknown", "high", "unknown")), any);
	}
}
