package com.kopo17.runshoes.api;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

/**
 * GET /api/{collection} 의 쿼리 — json-server 0.17.4 router/plural.js list() 를 같은 순서로:
 * 특수 파라미터 빼기 → 컬렉션에 없는 필드 버리기 → q 전문 검색 → 필드 필터(=, _ne, _lte, _gte, _like) → _sort/_order → _start/_end/_limit.
 * 데이터가 수십~백여 행이라 메모리에서 한다 — SQL 로 흉내 내는 것보다 비교·정렬 규칙(JS 문자열 비교, lodash stable sort)을 정확히 지킨다.
 * 안 하는 것: _page(Link 헤더), _embed/_expand — 프런트가 쓰지 않는다(contract/README.md).
 *
 * search(json-server 에 없는 것): 컬렉션이 정한 필드(shoes 는 brand · model)에서 찾는다 — 띄어쓰기로 나눈 낱말이 전부 들어 있어야 한다(AND).
 * 대소문자 무시, 공백을 뺀 글자로도 맞춘다("젤카야노" → "젤 카야노 32"). 다른 필터 · 정렬 · _limit 과 함께 돈다(docs/API_CONTRACT.md).
 */
final class ListQuery {

	private static final Set<String> SPECIAL = Set.of("q", "search", "_start", "_end", "_sort", "_order", "_limit", "_embed", "_expand");
	private static final Pattern OP = Pattern.compile("(_lte|_gte|_ne|_like)$");

	record Result(List<Map<String, Object>> items, Integer totalCount) {}

	private ListQuery() {}

	static Result apply(List<Map<String, Object>> all, MultiValueMap<String, String> query) {
		return apply(all, query, List.of());
	}

	/** searchFields — search 가 볼 필드. 비어 있으면 search 를 무시한다 */
	static Result apply(List<Map<String, Object>> all, MultiValueMap<String, String> query, List<String> searchFields) {
		MultiValueMap<String, String> filters = new LinkedMultiValueMap<>(query);
		SPECIAL.forEach(filters::remove);
		// 컬렉션의 어느 문서에도 없는 필드는 버린다(junk=1 무시, brand=호카 는 필터)
		filters.keySet().removeIf(k -> !(k.equals("callback") || k.equals("_") || OP.matcher(k).find()
				|| all.stream().anyMatch(d -> d.containsKey(k))));

		List<Map<String, Object>> chain = new ArrayList<>(all);

		String q = first(query, "q");
		if (q != null) {
			String lq = q.toLowerCase();
			chain.removeIf(doc -> doc.values().stream().noneMatch(v -> Js.deepQuery(v, lq)));
		}

		String search = first(query, "search");
		if (search != null && !searchFields.isEmpty()) {
			List<String> terms = Arrays.stream(normalize(search).split("\\s+")).filter(t -> !t.isEmpty()).toList();
			if (!terms.isEmpty()) chain.removeIf(doc -> !matchesAll(doc, searchFields, terms));
		}

		for (Map.Entry<String, List<String>> e : filters.entrySet()) {
			String key = e.getKey();
			if (key.equals("callback") || key.equals("_")) continue;
			List<String> values = e.getValue();
			boolean ne = key.endsWith("_ne"), lte = key.endsWith("_lte"), gte = key.endsWith("_gte"), like = key.endsWith("_like");
			String path = OP.matcher(key).replaceAll("");
			chain.removeIf(doc -> {
				Object ev = doc.get(path);                     // 키 없음 · null 은 비교에서 빠진다(undefined)
				if (ev == null) return true;
				String es = Js.toJsString(ev);
				if (ne) return !values.stream().allMatch(v -> !v.equals(es));
				return values.stream().noneMatch(v -> {
					if (lte || gte) return range(ev, es, v, gte);
					if (like) return Pattern.compile(v, Pattern.CASE_INSENSITIVE).matcher(es).find();
					return v.equals(es);
				});
			});
		}

		String sort = first(query, "_sort");
		if (sort != null) {
			String[] keys = sort.split(",", -1);
			String[] orders = (first(query, "_order") == null ? "" : first(query, "_order")).split(",", -1);
			Comparator<Map<String, Object>> cmp = null;
			for (int i = 0; i < keys.length; i++) {
				String k = keys[i];
				boolean desc = i < orders.length && orders[i].toLowerCase().equals("desc");
				Comparator<Map<String, Object>> c = (x, y) -> Js.compareAscending(Js.get(x, k), Js.get(y, k));
				if (desc) c = c.reversed();
				cmp = cmp == null ? c : cmp.thenComparing(c);
			}
			chain.sort(cmp);                                    // List.sort 는 stable — lodash orderBy 와 같다
		}

		Integer total = null;
		String start = first(query, "_start"), end = first(query, "_end"), limit = first(query, "_limit");
		if (end != null || limit != null) total = chain.size();
		if (end != null) chain = slice(chain, parseIntOr(start, 0), parseIntOr(end, chain.size()));
		else if (limit != null) {
			int s = parseIntOr(start, 0);
			chain = slice(chain, s, s + parseIntOr(limit, 0));
		}
		return new Result(chain, total);
	}

	/** JS: gte 는 value <= elementValue, lte 는 value >= elementValue. 숫자 필드면 숫자로 비교 */
	private static boolean range(Object ev, String es, String v, boolean gte) {
		int c;
		if (ev instanceof Number n) {
			double qv;
			try { qv = Double.parseDouble(v.trim()); } catch (NumberFormatException ex) { return false; }
			c = Double.compare(qv, n.doubleValue());
		} else c = v.compareTo(es);
		return gte ? c <= 0 : c >= 0;
	}

	private static boolean matchesAll(Map<String, Object> doc, List<String> fields, List<String> terms) {
		StringBuilder sb = new StringBuilder();
		for (String f : fields) {
			Object v = doc.get(f);
			if (v != null) sb.append(' ').append(normalize(Js.toJsString(v)));
		}
		String hay = sb.toString(), compact = hay.replaceAll("\\s+", "");
		return terms.stream().allMatch(t -> hay.contains(t) || compact.contains(t));
	}

	/** NFC · 소문자 — 한글 자모가 따로 들어와도(NFD) 같은 글자로 본다 */
	private static String normalize(String s) {
		return Normalizer.normalize(s, Normalizer.Form.NFC).toLowerCase(Locale.ROOT).strip();
	}

	private static List<Map<String, Object>> slice(List<Map<String, Object>> l, int from, int to) {
		int n = l.size();
		int f = from < 0 ? Math.max(n + from, 0) : Math.min(from, n);
		int t = to < 0 ? Math.max(n + to, 0) : Math.min(to, n);
		return f >= t ? List.of() : new ArrayList<>(l.subList(f, t));
	}

	private static int parseIntOr(String s, int dflt) {
		if (s == null) return dflt;
		try { return Integer.parseInt(s.trim().replaceAll("^([+-]?\\d+).*$", "$1")); } catch (NumberFormatException e) { return dflt; }
	}

	private static String first(MultiValueMap<String, String> q, String k) {
		List<String> v = q.get(k);
		return v == null || v.isEmpty() ? null : v.get(0);
	}
}
