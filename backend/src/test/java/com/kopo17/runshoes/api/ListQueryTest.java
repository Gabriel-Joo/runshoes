package com.kopo17.runshoes.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

/** json-server list() 규칙 — DB 없이. 전체 계약은 contract/diff.mjs 가 본다 */
class ListQueryTest {

	private static Map<String, Object> doc(Object... kv) {
		Map<String, Object> m = new HashMap<>();
		for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
		return m;
	}

	private static MultiValueMap<String, String> q(String... kv) {
		MultiValueMap<String, String> m = new LinkedMultiValueMap<>();
		for (int i = 0; i < kv.length; i += 2) m.add(kv[i], kv[i + 1]);
		return m;
	}

	private static List<Object> ids(ListQuery.Result r) {
		return r.items().stream().map(d -> d.get("id")).toList();
	}

	private final List<Map<String, Object>> shoes = List.of(
			doc("id", 1L, "brand", "아식스", "rating", 4.6, "price", 199000.0),
			doc("id", 2L, "brand", "호카", "rating", 4.8, "price", 159000.0),
			doc("id", 3L, "brand", "호카", "rating", 4.6, "price", null),
			doc("id", 4L, "brand", "나이키", "rating", 4.0, "price", 159000.0));

	@Test
	void 숫자는_JS_문자열로_비교한다() {
		assertEquals("4", Js.toJsString(4.0));
		assertEquals("4.6", Js.toJsString(4.6));
		assertEquals(List.of(4L), ids(ListQuery.apply(shoes, q("rating", "4"))));
		assertEquals(List.of(), ids(ListQuery.apply(shoes, q("rating", "4.0"))));
	}

	@Test
	void 없는_필드는_무시하고_있는_필드는_필터한다() {
		assertEquals(List.of(1L, 2L, 3L, 4L), ids(ListQuery.apply(shoes, q("junk", "1"))));
		assertEquals(List.of(2L, 3L), ids(ListQuery.apply(shoes, q("brand", "호카"))));
		assertEquals(List.of(1L, 2L, 3L), ids(ListQuery.apply(shoes, q("brand", "호카", "brand", "아식스"))));
	}

	@Test
	void 정렬은_stable_이고_null_은_오름차순에서_뒤_내림차순에서_앞() {
		assertEquals(List.of(2L, 1L, 3L, 4L), ids(ListQuery.apply(shoes, q("_sort", "rating", "_order", "desc"))));
		assertEquals(List.of(4L, 1L, 3L, 2L), ids(ListQuery.apply(shoes, q("_sort", "rating"))));
		assertEquals(List.of(2L, 4L, 1L, 3L), ids(ListQuery.apply(shoes, q("_sort", "price", "_order", "asc"))));
		assertEquals(List.of(3L, 1L, 2L, 4L), ids(ListQuery.apply(shoes, q("_sort", "price", "_order", "desc"))));
	}

	@Test
	void limit_은_총개수를_알려준다() {
		ListQuery.Result r = ListQuery.apply(shoes, q("_limit", "2"));
		assertEquals(List.of(1L, 2L), ids(r));
		assertEquals(4, r.totalCount());
		assertNull(ListQuery.apply(shoes, q()).totalCount());
	}

	@Test
	void 범위_부정_like() {
		assertEquals(List.of(1L, 2L, 3L), ids(ListQuery.apply(shoes, q("rating_gte", "4.5"))));
		assertEquals(List.of(1L, 3L, 4L), ids(ListQuery.apply(shoes, q("rating_ne", "4.8"))));
		assertEquals(List.of(1L, 4L), ids(ListQuery.apply(shoes, q("brand_ne", "호카", "brand_ne", "x"))));
		assertEquals(List.of(2L, 3L), ids(ListQuery.apply(shoes, q("brand_like", "^호"))));
	}

	@Test
	void 원본_목록을_바꾸지_않는다() {
		List<Map<String, Object>> copy = new ArrayList<>(shoes);
		ListQuery.apply(shoes, q("_sort", "rating", "_order", "desc"));
		assertEquals(copy, shoes);
	}
}
