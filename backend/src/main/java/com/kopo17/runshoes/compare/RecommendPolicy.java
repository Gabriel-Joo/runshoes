package com.kopo17.runshoes.compare;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 추천받기 점수(docs/10_recommend.md) — 이관 전 src/pages/Recommend.tsx 의 evaluate · 정렬을 옮기고(2026-11-10, 작업 3),
 * 데이터 없음을 중립으로 바꿨다(작업 3-1): 판단할 수 없는 조건은 점수 · 만점에서 함께 빼고 비율로 줄 세운다,
 * 비율이 같으면 판단한 조건이 많은 쪽 먼저, 물어본 조건 중 못 본 것이 둘 이상이면 후보에서 뺀다, "보통" 발볼은 보지 않는다.
 * 결과(상위 3의 id · 순서 · score · max · checked · reasons · notes)는 scripts/parity/reference/recommend.mjs 와 === 로 같아야 한다.
 * 작업 3-3(2026-11-11 사용자)에서 문구만 고쳤다 — 발매가 표기, 쿠션 방향, 맞은 조건의 이름, 조사(Josa), 옛 세대 notes. 점수 · 순위는 그대로.
 * 배점 · 경계는 이관 전 그대로.
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

	/** 조건 이름 — 맞은 조건을 댈 때(용도 · 발볼 · 안정성 · 쿠션 · 예산 순) */
	private static final Map<String, String> COND = Map.of("purpose", "용도", "width", "발볼", "stability", "안정성", "cushion", "쿠션", "price", "예산");

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
		return String.join(" · ", data) + " 정보가 없어 " + Josa.of(String.join(" · ", cond), "은", "는") + " 보지 않았어요" + tail;
	}

	/** 라인마다 현행 신발 — 보이는 신발(숨긴 신발은 엔티티로 읽히지 않는다)에서만. 라인당 현행은 하나 */
	static Map<String, Spec> currentByLine(List<Spec> all) {
		Map<String, Spec> m = new HashMap<>();
		for (Spec s : all) if (Boolean.TRUE.equals(s.isCurrent()) && s.lineKey() != null) m.put(s.lineKey(), s);
		return m;
	}

	static Scored evaluate(Spec shoe, Map<String, String> answers) {
		return evaluate(shoe, answers, Map.of());
	}

	/** current — currentByLine(보이는 신발 전부). 같은 라인의 현행이 없으면 세대 줄을 내지 않는다 */
	static Scored evaluate(Spec shoe, Map<String, String> answers, Map<String, Spec> current) {
		int score = 0, max = 0, checked = 0;
		List<Reason> reasons = new ArrayList<>();
		List<String> skipped = new ArrayList<>();
		List<String> hits = new ArrayList<>(), misses = new ArrayList<>();   // 판단한 조건의 맞음 · 안 맞음 — 꼬리 문구가 쓴다
		List<Integer> tails = new ArrayList<>();                             // 용도 · 안정성이 안 맞은 줄의 자리(아래에서 채운다)
		List<String> tailKeys = new ArrayList<>();

		// 용도 — 빈 칸 없음
		max += 40;
		checked++;
		if (eq(shoe.purpose(), answers.get("purpose"))) {
			score += 40;
			hits.add("purpose");
			reasons.add(new Reason(true, shoe.purpose() + "에 맞는 신발이에요"));
		} else {
			misses.add("purpose");
			tails.add(reasons.size());
			tailKeys.add("purpose");
			reasons.add(null);
		}

		// 발볼 — "넓음"만 조건이다
		String width = answers.get("width");
		if ("넓음".equals(width)) {
			if ("넓음".equals(shoe.width())) {
				max += 30;
				checked++;
				score += 30;
				hits.add("width");
				reasons.add(new Reason(true, "발볼이 넓게 나온 모델이에요"));
			} else if (Boolean.TRUE.equals(shoe.wideAvailable())) {
				max += 30;
				checked++;
				score += 20;
				hits.add("width");
				reasons.add(new Reason(true, "overseas".equals(shoe.wideScope()) ? "와이드 모델이 해외에만 있어요" : "와이드 모델이 따로 있어요"));
			} else if (shoe.width() != null) {
				max += 30;
				checked++;
				misses.add("width");
				String wide = Boolean.FALSE.equals(shoe.wideAvailable()) ? "와이드 모델은 없어요" : "와이드 정보는 없어요";
				reasons.add(new Reason(false, "발볼은 " + Josa.of(shoe.width(), "이고", "고") + " " + wide));
			} else {
				skipped.add("width");   // 발볼도 모르고 와이드도 없거나 모른다 — notes
			}
		} else {
			// "보통" · "잘 모르겠어요" — 발볼을 보지 않는다. 이 칸은 넓다 · 좁다는 평이 있었는지를 담아 "보통"을 가릴 수 없다(10_recommend.md)
			boolean wide = Boolean.TRUE.equals(shoe.wideAvailable());
			reasons.add(new Reason(false, shoe.width() == null
					? wide ? "발볼 정보는 없지만 와이드 모델이 있어요" : "발볼 정보가 없어요"
					: wide ? "발볼은 " + shoe.width() + ", 와이드 모델도 있어요" : "발볼은 " + Josa.euro(shoe.width()) + " 나왔어요"));
		}

		// 안정성
		String stability = answers.get("stability");
		if ("안정화".equals(stability) || "중립화".equals(stability) || "중립화-outer".equals(stability)) {
			max += 30;
			checked++;
			String want = "안정화".equals(stability) ? "안정화" : "중립화";
			if (want.equals(shoe.stability())) {
				score += 30;
				hits.add("stability");
				reasons.add(new Reason(true, want.equals("안정화") ? "발이 안쪽으로 무너지는 걸 잡아줘요" : "교정 장치가 없는 중립화예요"));
			} else {
				misses.add("stability");
				tails.add(reasons.size());
				tailKeys.add("stability");
				reasons.add(null);
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
				hits.add("cushion");
				reasons.add(new Reason(true, "쿠션 두께가 원하시는 정도예요 (" + JsText.num(h) + "mm)"));
			} else {
				// 원한 범위와 견줘 방향을 정한다 — low(35 미만)를 원했으면 늘 두껍고, high(40 이상)면 늘 얇다
				misses.add("cushion");
				boolean thick = "low".equals(cushion) || ("mid".equals(cushion) && h >= 40);
				reasons.add(new Reason(false, thick ? "쿠션이 원하시는 것보다 두꺼워요 (" + JsText.num(h) + "mm)" : "쿠션이 원하시는 것보다 얇아요 (" + JsText.num(h) + "mm)"));
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
			// 가격 칸은 발매가(정가)만 담는다(01a 1-5) — 상세 모달 · 비교하기처럼 "발매가"로 부른다
			if (p <= cap) {
				score += 20;
				hits.add("price");
				reasons.add(new Reason(true, "예산에 맞아요 (발매가 " + JsText.locale(p) + "원)"));
			} else {
				misses.add("price");
				reasons.add(new Reason(false, "발매가가 예산보다 높아요 (" + JsText.locale(p) + "원) — 지금 파는 값은 더 낮을 수 있어요"));
			}
		} else if (shoe.price() != null) {
			reasons.add(new Reason(false, "발매가 " + JsText.locale(shoe.price()) + "원이에요"));
		}

		// 용도 · 안정성이 안 맞은 줄 — 첫 줄에만 실제로 맞은 조건을 댄다. 판단한 조건만 센다(못 본 조건 · 묻지 않은 조건은 빠진다)
		boolean told = false;
		for (int i = 0; i < tails.size(); i++) {
			String head = "purpose".equals(tailKeys.get(i)) ? shoe.purpose() + "용" : shoe.stability();
			int others = hits.size() + misses.size() - 1;
			String text;
			if (!told && !hits.isEmpty()) {
				String what = hits.size() == others && others >= 2 ? "다른 조건은 모두 맞아요"
						: Josa.of(String.join(" · ", hits.stream().map(COND::get).toList()), "이", "가") + " 맞아요";
				text = Josa.of(head, "이지만", "지만") + " " + what;
				told = true;
			} else {
				text = head + " 신발이에요";
			}
			reasons.set(tails.get(i), new Reason(false, text));
		}

		List<String> notes = new ArrayList<>();
		if (!skipped.isEmpty()) notes.add(skippedNote(skipped, shoe));
		// 옛 세대 — 점수에 넣지 않는다(10_recommend.md 2-4). 같은 라인의 현행이 사이트에 있을 때만, 그 이름으로
		Spec now = Boolean.FALSE.equals(shoe.isCurrent()) && shoe.lineKey() != null ? current.get(shoe.lineKey()) : null;
		if (now != null && now.id() != shoe.id()) notes.add("지금은 다음 세대(" + now.model() + ")가 나와 있어요");
		return new Scored(shoe, score, max, checked, List.copyOf(skipped), List.copyOf(reasons), List.copyOf(notes));
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
		Map<String, Spec> current = currentByLine(all);
		for (Spec s : all) {
			Scored r = evaluate(s, answers, current);
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
