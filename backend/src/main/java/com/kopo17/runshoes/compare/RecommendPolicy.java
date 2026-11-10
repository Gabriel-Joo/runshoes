package com.kopo17.runshoes.compare;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 추천받기 점수(docs/02_screens.md 1-4) — 이관 전 src/pages/Recommend.tsx 의 evaluate · 정렬을 그대로 옮긴 것(2026-11-10, 작업 3).
 * 결과(상위 3의 id · 순서 · score · reasons)는 scripts/parity/reference/recommend.mjs(얼린 사본)와 같아야 한다.
 * 가중치 · 경계 · 문구는 고치지 않았다 — 알려진 문제는 09_chatbot_rag.md 13절 "남은 작업"(쿠션 문구 · 조건 문구 · 옛 세대).
 */
final class RecommendPolicy {

	private RecommendPolicy() {}

	/** 받는 값 — 화면의 선택지 그대로(QUESTIONS). 다섯 칸 모두 필요 */
	static final Map<String, Set<String>> ANSWERS = Map.of(
			"purpose", Set.of("조깅·회복주", "템포·인터벌", "LSD·장거리", "레이스", "트레일"),
			"width", Set.of("넓음", "보통", "unknown"),
			"stability", Set.of("안정화", "중립화", "중립화-outer", "unknown"),
			"cushion", Set.of("high", "mid", "low", "unknown"),
			"price", Set.of("low", "mid", "high", "unknown"));

	record Reason(boolean hit, String text) {}

	record Scored(Spec shoe, int score, List<Reason> reasons) {}

	static Scored evaluate(Spec shoe, Map<String, String> answers) {
		int score = 0;
		List<Reason> reasons = new ArrayList<>();

		// 용도
		if (eq(shoe.purpose(), answers.get("purpose"))) {
			score += 40;
			reasons.add(new Reason(true, shoe.purpose() + "에 맞는 신발이에요"));
		} else {
			reasons.add(new Reason(false, shoe.purpose() + "용이지만 다른 조건이 잘 맞아요"));
		}

		// 발볼
		String width = answers.get("width");
		if ("넓음".equals(width)) {
			if ("넓음".equals(shoe.width())) {
				score += 30;
				reasons.add(new Reason(true, "발볼이 넓게 나온 모델이에요"));
			} else if (Boolean.TRUE.equals(shoe.wideAvailable())) {
				score += 20;
				reasons.add(new Reason(true, "overseas".equals(shoe.wideScope()) ? "와이드 모델이 해외에만 있어요" : "와이드 모델이 따로 있어요"));
			} else {
				// 모르는 값을 "보통" · "없어요"로 말하지 않는다(null = 정보 없음)
				String w = shoe.width() == null ? "발볼 정보가 없고" : "발볼은 " + shoe.width() + "이고";
				String wide = Boolean.FALSE.equals(shoe.wideAvailable()) ? "와이드 모델은 없어요" : "와이드 정보는 없어요";
				reasons.add(new Reason(false, w + " " + wide));
			}
		} else if ("보통".equals(width)) {
			if ("보통".equals(shoe.width())) {
				score += 20;
				reasons.add(new Reason(true, "발볼이 보통으로 나왔어요"));
			} else {
				reasons.add(new Reason(false, shoe.width() == null ? "발볼 정보가 없어요" : "발볼은 " + shoe.width() + "로 나왔어요"));
			}
		} else {
			boolean wide = Boolean.TRUE.equals(shoe.wideAvailable());
			reasons.add(new Reason(false, shoe.width() == null
					? wide ? "발볼 정보는 없지만 와이드 모델이 있어요" : "발볼 정보가 없어요"
					: wide ? "발볼은 " + shoe.width() + ", 와이드 모델도 있어요" : "발볼은 " + shoe.width() + "로 나왔어요"));
		}

		// 안정성
		String stability = answers.get("stability");
		if ("안정화".equals(stability) || "중립화".equals(stability) || "중립화-outer".equals(stability)) {
			String want = "안정화".equals(stability) ? "안정화" : "중립화";
			if (want.equals(shoe.stability())) {
				score += 30;
				reasons.add(new Reason(true, want.equals("안정화") ? "발이 안쪽으로 무너지는 걸 잡아줘요" : "교정 장치가 없는 중립화예요"));
			} else {
				reasons.add(new Reason(false, shoe.stability() + "지만 다른 조건이 잘 맞아요"));
			}
		} else {
			reasons.add(new Reason(false, "안정화".equals(shoe.stability()) ? "안정화예요 — 발이 안쪽으로 무너지는 걸 잡아줍니다" : "교정 장치가 없는 중립화예요"));
		}

		// 쿠션 — 경계 40 · 35mm
		String cushion = answers.get("cushion");
		if (!"unknown".equals(cushion) && shoe.stackHeight() != null) {
			double h = shoe.stackHeight();
			boolean fit = ("high".equals(cushion) && h >= 40) || ("mid".equals(cushion) && h >= 35 && h < 40) || ("low".equals(cushion) && h < 35);
			if (fit) {
				score += 20;
				reasons.add(new Reason(true, "쿠션 두께가 원하시는 정도예요 (" + JsText.num(h) + "mm)"));
			} else {
				// 그대로 옮김 — low 인데 35~39.5mm 면 "얇아요"가 나온다(남은 작업, 09 13절)
				reasons.add(new Reason(false, h >= 40 ? "쿠션이 원하시는 것보다 두꺼워요 (" + JsText.num(h) + "mm)" : "쿠션이 원하시는 것보다 얇아요 (" + JsText.num(h) + "mm)"));
			}
		} else if (shoe.stackHeight() != null) {
			reasons.add(new Reason(false, "쿠션 두께는 " + JsText.num(shoe.stackHeight()) + "mm예요"));
		}

		// 예산 — 경계 20만 · 30만
		String price = answers.get("price");
		if (!"unknown".equals(price) && shoe.price() != null) {
			double p = shoe.price();
			boolean fit = ("low".equals(price) && p < 200000) || ("mid".equals(price) && p >= 200000 && p < 300000) || ("high".equals(price) && p >= 300000);
			if (fit) {
				score += 20;
				reasons.add(new Reason(true, "예산에 맞아요 (" + JsText.locale(p) + "원)"));
			} else if (("low".equals(price) && p >= 200000) || ("mid".equals(price) && p >= 300000)) {
				reasons.add(new Reason(false, "예산보다 높지만 조건이 잘 맞아 함께 담았어요"));
			} else {
				reasons.add(new Reason(false, "생각하신 것보다 저렴해요 (" + JsText.locale(p) + "원)"));
			}
		} else if (shoe.price() != null) {
			reasons.add(new Reason(false, JsText.locale(shoe.price()) + "원이에요"));
		}
		return new Scored(shoe, score, List.copyOf(reasons));
	}

	/** 점수가 같으면 평점/리뷰/좋아요가 높은 쪽이 위로 — JS 와 같은 식 · 같은 순서(정수 나눗셈이 되지 않게 double). all 은 id 순, 정렬은 안정 정렬 */
	static double tie(Spec s) {
		double rating = s.rating() == null ? 0 : s.rating();          // JS: null * 20 = 0
		double rc = s.reviewCount() == null ? 0 : s.reviewCount();
		double like = s.likeCount() == null ? 0 : s.likeCount();
		return rating * 20 * (rc / (rc + 3)) + like * 0.5;
	}

	static List<Scored> top3(List<Spec> all, Map<String, String> answers) {
		List<Scored> scored = new ArrayList<>();
		for (Spec s : all) scored.add(evaluate(s, answers));
		scored.sort((a, b) -> {
			if (b.score() != a.score()) return b.score() - a.score();
			double d = tie(b.shoe()) - tie(a.shoe());
			return d > 0 ? 1 : d < 0 ? -1 : 0;
		});
		return scored.subList(0, Math.min(3, scored.size()));
	}

	static Map<String, Object> result(List<Spec> all, Map<String, String> answers) {
		List<Map<String, Object>> results = new ArrayList<>();
		for (Scored r : top3(all, answers)) {
			Map<String, Object> m = new LinkedHashMap<>();
			m.put("id", r.shoe().id());
			m.put("score", r.score());
			m.put("reasons", r.reasons().stream().map(x -> Map.of("hit", x.hit(), "text", x.text())).toList());
			results.add(m);
		}
		return Map.of("results", results);
	}

	private static boolean eq(String a, String b) {
		return a != null && a.equals(b);
	}
}
