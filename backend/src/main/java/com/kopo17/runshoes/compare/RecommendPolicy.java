package com.kopo17.runshoes.compare;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 추천받기 점수(docs/10_recommend.md) — 이관 전 src/pages/Recommend.tsx 의 evaluate · 정렬을 옮기고(2026-11-10, 작업 3),
 * 데이터 없음을 중립으로 바꿨다(작업 3-1): 판단할 수 없는 조건은 점수 · 만점에서 함께 빼고 비율로 줄 세운다,
 * 비율이 같으면 판단한 조건이 많은 쪽 먼저, 물어본 조건 중 못 본 것이 둘 이상이면 후보에서 뺀다, "보통" 발볼은 보지 않는다.
 * 결과(상위 3의 id · 순서 · score · max · checked · reasons · notes)는 scripts/parity/reference/recommend.mjs 와 === 로 같아야 한다.
 * 배점 · 경계 · 문구는 이관 전 그대로 — 고칠 것은 10_recommend.md "남은 작업".
 */
final class RecommendPolicy {

	private RecommendPolicy() {}

	/** 받는 값 — 화면의 선택지 그대로(QUESTIONS). 다섯 칸 모두 필요 */
	static final Map<String, Set<String>> ANSWERS = Map.of(
			"purpose", Set.of("조깅·회복주", "템포·인터벌", "LSD·장거리", "레이스", "트레일"),
			"width", Set.of("넓음", "보통", "unknown"),
			"stability", Set.of("안정화", "중립화", "중립화-outer", "unknown"),
			"cushion", Set.of("high", "mid", "low", "unknown"),
			"price", Set.of("low", "mid", "high", "unknown"));   // high — 화면에서 뺀 옛 값, unknown 과 같게(작업 3-2)

	record Reason(boolean hit, String text) {}

	/** score — 판단한 조건에서 얻은 점수, max — 판단한 조건의 만점, checked — 판단한 조건 수, skipped — 물어봤지만 데이터가 없어 못 본 조건 */
	record Scored(Spec shoe, int score, int max, int checked, List<String> skipped, List<Reason> reasons, List<String> notes) {
		double ratio() { return (double) score / max; }
	}

	/** 못 본 조건 → notes 한 줄(하한선 때문에 후보에는 많아야 하나) */
	static String skippedNote(List<String> skipped, Spec shoe) {
		List<String> data = new ArrayList<>(), cond = new ArrayList<>();
		for (String k : skipped) {
			switch (k) {
				case "width" -> { data.add(Boolean.FALSE.equals(shoe.wideAvailable()) ? "발볼" : "발볼 · 와이드"); cond.add("발볼"); }
				case "cushion" -> { data.add("스택"); cond.add("쿠션"); }
				case "price" -> { data.add("가격"); cond.add("예산"); }
				default -> throw new IllegalArgumentException(k);
			}
		}
		String tail = skipped.contains("width") && Boolean.FALSE.equals(shoe.wideAvailable()) ? " — 와이드 모델은 없어요" : "";
		return String.join(" · ", data) + " 정보가 없어 " + String.join(" · ", cond) + "은 보지 않았어요" + tail;
	}

	static Scored evaluate(Spec shoe, Map<String, String> answers) {
		int score = 0, max = 0, checked = 0;
		List<Reason> reasons = new ArrayList<>();
		List<String> skipped = new ArrayList<>();

		// 용도 — 빈 칸 없음
		max += 40;
		checked++;
		if (eq(shoe.purpose(), answers.get("purpose"))) {
			score += 40;
			reasons.add(new Reason(true, shoe.purpose() + "에 맞는 신발이에요"));
		} else {
			reasons.add(new Reason(false, shoe.purpose() + "용이지만 다른 조건이 잘 맞아요"));
		}

		// 발볼 — "넓음"만 조건이다
		String width = answers.get("width");
		if ("넓음".equals(width)) {
			if ("넓음".equals(shoe.width())) {
				max += 30;
				checked++;
				score += 30;
				reasons.add(new Reason(true, "발볼이 넓게 나온 모델이에요"));
			} else if (Boolean.TRUE.equals(shoe.wideAvailable())) {
				max += 30;
				checked++;
				score += 20;
				reasons.add(new Reason(true, "overseas".equals(shoe.wideScope()) ? "와이드 모델이 해외에만 있어요" : "와이드 모델이 따로 있어요"));
			} else if (shoe.width() != null) {
				max += 30;
				checked++;
				String wide = Boolean.FALSE.equals(shoe.wideAvailable()) ? "와이드 모델은 없어요" : "와이드 정보는 없어요";
				reasons.add(new Reason(false, "발볼은 " + shoe.width() + "이고 " + wide));
			} else {
				skipped.add("width");   // 발볼도 모르고 와이드도 없거나 모른다 — notes
			}
		} else {
			// "보통" · "잘 모르겠어요" — 발볼을 보지 않는다. 이 칸은 넓다 · 좁다는 평이 있었는지를 담아 "보통"을 가릴 수 없다(10_recommend.md)
			boolean wide = Boolean.TRUE.equals(shoe.wideAvailable());
			reasons.add(new Reason(false, shoe.width() == null
					? wide ? "발볼 정보는 없지만 와이드 모델이 있어요" : "발볼 정보가 없어요"
					: wide ? "발볼은 " + shoe.width() + ", 와이드 모델도 있어요" : "발볼은 " + shoe.width() + "로 나왔어요"));
		}

		// 안정성
		String stability = answers.get("stability");
		if ("안정화".equals(stability) || "중립화".equals(stability) || "중립화-outer".equals(stability)) {
			max += 30;
			checked++;
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
		if (!"unknown".equals(cushion) && shoe.stackHeight() == null) {
			skipped.add("cushion");
		} else if (!"unknown".equals(cushion)) {
			max += 20;
			checked++;
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

		// 예산 — 상한(2026-11-11 사용자, 작업 3-2): low 20만원까지 · mid 30만원까지. high(전 "30만원 이상도 괜찮아요")는 화면에서 뺐고
		// unknown 과 같게 조건으로 보지 않는다(옛 값이라 받기는 한다). 상한 안의 신발은 모두 같게 본다 — 원하는 가격대가 아니라 넘으면 안 되는 선
		String price = answers.get("price");
		Double cap = "low".equals(price) ? Double.valueOf(200000) : "mid".equals(price) ? Double.valueOf(300000) : null;
		if (cap != null && shoe.price() == null) {
			skipped.add("price");
		} else if (cap != null) {
			max += 20;
			checked++;
			double p = shoe.price();
			if (p <= cap) {
				score += 20;
				reasons.add(new Reason(true, "예산에 맞아요 (" + JsText.locale(p) + "원)"));
			} else {
				reasons.add(new Reason(false, "예산보다 높지만 조건이 잘 맞아 함께 담았어요"));
			}
		} else if (shoe.price() != null) {
			reasons.add(new Reason(false, JsText.locale(shoe.price()) + "원이에요"));
		}
		List<String> notes = skipped.isEmpty() ? List.of() : List.of(skippedNote(skipped, shoe));
		return new Scored(shoe, score, max, checked, List.copyOf(skipped), List.copyOf(reasons), notes);
	}

	/** 점수가 같으면 평점/리뷰/좋아요가 높은 쪽이 위로 — JS 와 같은 식 · 같은 순서(정수 나눗셈이 되지 않게 double). all 은 id 순, 정렬은 안정 정렬 */
	static double tie(Spec s) {
		double rating = s.rating() == null ? 0 : s.rating();          // JS: null * 20 = 0
		double rc = s.reviewCount() == null ? 0 : s.reviewCount();
		double like = s.likeCount() == null ? 0 : s.likeCount();
		return rating * 20 * (rc / (rc + 3)) + like * 0.5;
	}

	/**
	 * 비율(score / max) 높은 순 → 같으면 판단한 조건이 많은 쪽(max 큰 쪽) → 평점 · 리뷰 · 찜. 물어본 조건 중 못 본 것이 둘 이상이면 뺀다(하한선).
	 * JS 와 같게: 비율은 double 나눗셈, 차가 0 이면(같은 비율 — 120/140 과 60/70 도 같은 double) 다음 기준으로
	 */
	static List<Scored> top3(List<Spec> all, Map<String, String> answers) {
		List<Scored> scored = new ArrayList<>();
		for (Spec s : all) {
			Scored r = evaluate(s, answers);
			if (r.skipped().size() <= 1) scored.add(r);
		}
		scored.sort((a, b) -> {
			double r = b.ratio() - a.ratio();
			if (r != 0) return r > 0 ? 1 : -1;
			if (b.max() != a.max()) return b.max() - a.max();
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
			m.put("max", r.max());
			m.put("checked", r.checked());
			m.put("reasons", r.reasons().stream().map(x -> Map.of("hit", x.hit(), "text", x.text())).toList());
			m.put("notes", r.notes());
			results.add(m);
		}
		return Map.of("results", results);
	}

	private static boolean eq(String a, String b) {
		return a != null && a.equals(b);
	}
}
