package com.kopo17.runshoes.api;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * json-server(Node) 가 값을 비교·문자열화하는 방식을 Java 로 옮긴 것 — 목록 필터·정렬이 기준선과 같게.
 * 문서 값은 Long · Integer · Double · Boolean · String · List · null 만 쓴다. "없음"(undefined)은 키가 없는 것으로 나타낸다.
 */
final class Js {

	/** 키가 없을 때(undefined)의 표지 — null 과 다르게 정렬된다 */
	static final Object UNDEFINED = new Object();

	private Js() {}

	/** JS String(value) — 정수 값 숫자는 ".0" 없이, 배열은 쉼표로 잇는다 */
	static String toJsString(Object v) {
		if (v instanceof Double d) {
			if (!d.isInfinite() && !d.isNaN() && d == Math.rint(d) && Math.abs(d) < 1e21) return Long.toString(d.longValue());
			return d.toString();
		}
		if (v instanceof List<?> list) return list.stream().map(x -> x == null ? "" : toJsString(x)).collect(Collectors.joining(","));
		return String.valueOf(v);
	}

	static Object get(Map<String, Object> doc, String key) {
		return doc.containsKey(key) ? doc.get(key) : UNDEFINED;
	}

	/**
	 * lodash compareAscending — orderBy 가 쓰는 비교. 정의된 값 &lt; null &lt; undefined, NaN 은 맨 뒤.
	 * 같은 타입끼리만 크기를 비교한다(시드·프런트가 한 필드에 타입을 섞지 않는다).
	 */
	@SuppressWarnings({"unchecked", "rawtypes"})
	static int compareAscending(Object a, Object b) {
		if (a == b) return 0;
		boolean aUndef = a == UNDEFINED, bUndef = b == UNDEFINED;
		boolean aNull = a == null, bNull = b == null;
		if (aUndef && bUndef) return 0;
		if (aUndef) return 1;
		if (bUndef) return -1;
		if (aNull && bNull) return 0;
		if (aNull) return 1;
		if (bNull) return -1;
		if (a instanceof Number x && b instanceof Number y) return Double.compare(x.doubleValue(), y.doubleValue());
		if (a instanceof Boolean x && b instanceof Boolean y) return Boolean.compare(x, y);
		if (a instanceof Comparable x && a.getClass() == b.getClass()) return Integer.signum(x.compareTo(b));
		return toJsString(a).compareTo(toJsString(b));
	}

	/** json-server mixins.deepQuery — 값(배열·객체 안까지)의 문자열에 q(소문자)가 들어 있는가. 0 · false · "" 는 보지 않는다 */
	static boolean deepQuery(Object v, String q) {
		if (v == null || v == UNDEFINED || q.isEmpty()) return false;
		if (v instanceof Boolean b && !b) return false;
		if (v instanceof Number n && n.doubleValue() == 0) return false;
		if (v instanceof String s && s.isEmpty()) return false;
		if (v instanceof List<?> list) return list.stream().anyMatch(x -> deepQuery(x, q));
		if (v instanceof Map<?, ?> map) return map.values().stream().anyMatch(x -> deepQuery(x, q));
		return toJsString(v).toLowerCase().contains(q);
	}
}
