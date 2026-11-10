package com.kopo17.runshoes.compare;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Predicate;

/**
 * 비교하기 계산(docs/08_compare.md 1-3 · 1-7) — 이관 전 src/utils/compare.ts 를 그대로 옮긴 것(2026-11-10, 작업 3).
 * 결과는 scripts/parity/reference/compare.mjs(얼린 사본)와 === 로 같아야 한다 — 더하기 · 나누기 순서까지 JS 와 같게 둔다.
 * 점수는 매기지 않는다 — 자동 채우기의 "가까움"은 후보를 고르는 데만 쓰고 응답에 내지 않는다.
 */
final class ComparePolicy {

	private ComparePolicy() {}

	static final int MAX_COLS = 5;
	static final int AUTO_COLS = 4;
	static final String BASE_SIZE = "M9";

	/** 등수를 말하는 네 칸 — 응답의 순서 */
	static final List<String> NUM_KEYS = List.of("weight", "stackHeight", "drop", "price");

	/** 위치 말 — 하위 25% · 가운데 · 상위 25%. 화면과 챗봇이 같은 말을 쓴다 */
	static final Map<String, Map<String, String>> BAND_WORD = Map.of(
			"weight", Map.of("low", "가벼운 편", "mid", "중간", "high", "무거운 편"),
			"stackHeight", Map.of("low", "낮은 편", "mid", "중간", "high", "높은 편"),
			"drop", Map.of("low", "낮은 편", "mid", "중간", "high", "높은 편"),
			"price", Map.of("low", "낮은 편", "mid", "중간", "high", "높은 편"));

	record Col(long id, String why) {}

	record Rank(int less, int same, int more, int order, String band) {}

	/** 그 칸의 "자리를 말할 수 있는" 값 — 무게는 270mm 로 맞춘 값(기준 모름이면 null) */
	static Double numValue(Spec s, String key) {
		return switch (key) {
			case "weight" -> s.weightNorm270();
			case "stackHeight" -> s.stackHeight();
			case "drop" -> s.drop();
			case "price" -> s.price();
			default -> throw new IllegalArgumentException(key);
		};
	}

	/** 환산한 무게인가 — 270mm 로 맞춘 값이 있고 기준이 M9 가 아니다 */
	static boolean isConverted(Spec s) {
		return s.weightNorm270() != null && !BASE_SIZE.equals(s.weightSize());
	}

	/** 모집단 — 그 칸의 값이 있는 신발(all 순서 그대로) */
	static double[] population(List<Spec> all, String key) {
		return all.stream().map(s -> numValue(s, key)).filter(Objects::nonNull).mapToDouble(Double::doubleValue).toArray();
	}

	/** rankIn — 동점은 가운데 순위로. p = (less + same / 2) / n */
	static Rank rankIn(double[] arr, double v) {
		int less = 0, same = 0;
		for (double a : arr) {
			if (a < v) less++;
			else if (a == v) same++;
		}
		int more = arr.length - less - same;
		double p = arr.length > 0 ? (less + same / 2.0) / arr.length : 0.5;
		return new Rank(less, same, more, less + 1, p < 0.25 ? "low" : p > 0.75 ? "high" : "mid");
	}

	/** JS stdev — 0 개면 1, 표준편차가 0(또는 NaN)이면 1. 더하는 순서는 reduce 와 같게 앞에서부터 */
	static double stdev(double[] xs) {
		if (xs.length == 0) return 1;
		double sum = 0;
		for (double x : xs) sum = sum + x;
		double m = sum / xs.length;
		double sq = 0;
		for (double x : xs) sq = sq + (x - m) * (x - m);
		double sd = Math.sqrt(sq / xs.length);
		return sd == 0 || Double.isNaN(sd) ? 1 : sd;
	}

	/**
	 * 비슷한 신발 거리에만 쓰는 무게 — 270mm 로 맞춘 값, 기준 모름(weightNorm270 null)이면 원값.
	 * 일부러 여기만 원값을 쓴다(2026-11-10 사용자, 08 1-3): 기준 모름 29켤레를 "무게 모름"으로 두면 거리가 스택 · 드롭으로만 갈려
	 * 247g 신발 옆에 311g 을 "비슷한 신발"로 내놓았다. 대표 사이즈는 거의 265~285mm 라 원값의 오차(많아야 약 ±7.4%)가 무게를 버리는 것보다 작다.
	 * 이 값은 저장하지도 응답에 내지도 않는다 — 등수 · 그래프의 무게는 numValue(기준 모름이면 null)만 쓴다.
	 */
	static Double distWeight(Spec s) {
		return s.weightNorm270() != null ? s.weightNorm270() : s.weight();
	}

	interface Distance {
		double between(Spec a, Spec b);
	}

	/** 스펙이 얼마나 가까운가 — 스택 + 드롭 × 0.7 + 무게(distWeight)(각각 전체 표준편차로 나눔), 카본이 서로 다르면 +2, 한쪽이 비면 그 칸은 1 */
	static Distance makeDistance(List<Spec> all) {
		double sdStack = stdev(all.stream().map(Spec::stackHeight).filter(Objects::nonNull).mapToDouble(Double::doubleValue).toArray());
		double sdDrop = stdev(all.stream().map(Spec::drop).filter(Objects::nonNull).mapToDouble(Double::doubleValue).toArray());
		double sdWeight = stdev(all.stream().map(ComparePolicy::distWeight).filter(Objects::nonNull).mapToDouble(Double::doubleValue).toArray());
		return (a, b) -> {
			double d = 0;
			d = d + 1 * part(a.stackHeight(), b.stackHeight(), sdStack);
			d = d + 0.7 * part(a.drop(), b.drop(), sdDrop);
			d = d + 1 * part(distWeight(a), distWeight(b), sdWeight);
			if (a.carbon() != null && b.carbon() != null && !a.carbon().equals(b.carbon())) d += 2;
			return d;
		};
	}

	private static double part(Double x, Double y, double sd) {
		return x == null || y == null ? 1 : Math.abs(x - y) / sd;
	}

	private static boolean truthy(String s) {
		return s != null && !s.isEmpty();
	}

	/**
	 * 하나를 고르면 네 켤레까지(08 1-3): 고른 신발 → 같은 라인의 다른 세대 → 같은 브랜드 · 같은 안정성 1 →
	 * 다른 브랜드 · 안정성이 다른 신발 1 → 다른 브랜드 · 같은 안정성 → (모자라면) 다른 브랜드 아무거나 → 아무거나.
	 * 후보는 같은 용도 · 다른 라인 · 현행만. 다른 브랜드는 브랜드마다 하나. all 은 id 순.
	 */
	static List<Col> autofill(long pickId, List<Spec> all) {
		Spec pick = all.stream().filter(s -> s.id() == pickId).findFirst().orElse(null);
		if (pick == null) return List.of();
		List<Col> out = new ArrayList<>();
		out.add(new Col(pick.id(), "pick"));
		if (truthy(pick.lineKey())) {
			for (Spec s : all) if (Objects.equals(s.lineKey(), pick.lineKey()) && s.id() != pick.id()) out.add(new Col(s.id(), "line"));
		}
		Distance dist = makeDistance(all);
		List<Spec> pool = new ArrayList<>();
		for (Spec s : all) {
			if (s.id() != pick.id() && (!truthy(pick.lineKey()) || !Objects.equals(s.lineKey(), pick.lineKey()))
					&& Boolean.TRUE.equals(s.isCurrent()) && Objects.equals(s.purpose(), pick.purpose())) pool.add(s);
		}
		// JS: dist(pick, a) - dist(pick, b) || a.id - b.id — 차가 0 이면(-0 포함) id 순. Double.compare 는 0.0 과 -0.0 을 가르니 쓰지 않는다
		pool.sort((a, b) -> {
			double da = dist.between(pick, a), db = dist.between(pick, b);
			double diff = da - db;
			if (diff < 0) return -1;
			if (diff > 0) return 1;
			return Long.compare(a.id(), b.id());
		});
		Set<Long> used = new HashSet<>();
		out.forEach(c -> used.add(c.id()));
		Set<String> brands = new HashSet<>();
		brands.add(pick.brand());
		class Taker {
			boolean take(Predicate<Spec> ok, String why) {
				if (out.size() >= AUTO_COLS) return false;
				Spec s = pool.stream().filter(x -> !used.contains(x.id()) && ok.test(x)).findFirst().orElse(null);
				if (s == null) return false;
				used.add(s.id());
				brands.add(s.brand());
				out.add(new Col(s.id(), why));
				return true;
			}
		}
		Taker t = new Taker();
		t.take(s -> Objects.equals(s.brand(), pick.brand()) && Objects.equals(s.stability(), pick.stability()), "brand");
		t.take(s -> !brands.contains(s.brand()) && !Objects.equals(s.stability(), pick.stability()), "stability");
		while (t.take(s -> !brands.contains(s.brand()) && Objects.equals(s.stability(), pick.stability()), "similar"));
		while (t.take(s -> !brands.contains(s.brand()), "similar"));
		while (t.take(s -> true, "similar"));
		return List.copyOf(out.subList(0, Math.min(out.size(), AUTO_COLS)));
	}

	/** ?ids=1,2,3 — 숫자 아님 · 모르는 id · 겹침은 버리고 다섯 개까지(이관 전 parseCols 의 id 규칙) */
	static List<Long> parseIds(String ids, Set<Long> known) {
		List<Long> out = new ArrayList<>();
		if (ids == null) return out;
		for (String raw : ids.split(",", -1)) {
			Long id = jsInteger(raw.trim());
			if (id == null || id <= 0 || !known.contains(id) || out.contains(id) || out.size() >= MAX_COLS) continue;
			out.add(id);
		}
		return out;
	}

	/** JS Number(raw) 이 양의 정수인가 — "" 은 0, "1e2" 는 100, "01" 은 1, "1.0" 은 1 */
	static Long jsInteger(String raw) {
		if (raw.isEmpty()) return 0L;
		try {
			double d = Double.parseDouble(raw);
			if (raw.endsWith("d") || raw.endsWith("D") || raw.endsWith("f") || raw.endsWith("F")) return null;   // Java 만 받는 꼬리
			if (Double.isNaN(d) || Double.isInfinite(d) || d != Math.rint(d) || Math.abs(d) > 9007199254740991.0) return null;
			return (long) d;
		} catch (NumberFormatException e) {
			return null;
		}
	}

	/** 응답 — fields(모집단, 오름차순) · shoes(칸마다 값 · 등수 · 밴드 · 말 · 무게는 환산 여부) · pick 이면 cols */
	static Map<String, Object> result(List<Long> ids, List<Col> cols, List<Spec> all) {
		Map<Long, Spec> byId = new LinkedHashMap<>();
		all.forEach(s -> byId.put(s.id(), s));
		Map<String, Object> fields = new LinkedHashMap<>();
		Map<String, double[]> pops = new LinkedHashMap<>();
		for (String k : NUM_KEYS) {
			double[] pop = population(all, k);
			pops.put(k, pop);
			double[] sorted = pop.clone();
			Arrays.sort(sorted);
			fields.put(k, Map.of("n", pop.length, "values", sorted));
		}
		List<Map<String, Object>> shoes = new ArrayList<>();
		for (long id : ids) {
			Spec s = byId.get(id);
			Map<String, Object> row = new LinkedHashMap<>();
			row.put("id", id);
			for (String k : NUM_KEYS) {
				Double v = numValue(s, k);
				Map<String, Object> cell = new LinkedHashMap<>();
				cell.put("value", v);
				if (v != null) {
					Rank r = rankIn(pops.get(k), v);
					cell.put("order", r.order());
					cell.put("band", r.band());
					cell.put("word", BAND_WORD.get(k).get(r.band()));
				}
				if (k.equals("weight")) cell.put("converted", isConverted(s));
				row.put(k, cell);
			}
			shoes.add(row);
		}
		Map<String, Object> out = new LinkedHashMap<>();
		if (cols != null) out.put("cols", cols.stream().map(c -> Map.of("id", c.id(), "why", c.why())).toList());
		out.put("fields", fields);
		out.put("shoes", shoes);
		return out;
	}
}
