package com.kopo17.runshoes.api;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.kopo17.runshoes.domain.Shoe;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** 수정 이력(V11)의 바뀐 칸 — 값은 보지 않고 같은지만, 셈하는 값 · 이력 자신은 넣지 않는다 */
class ChangedFieldsTest {

	private static Shoe shoe() {
		Shoe s = new Shoe();
		s.setId(1L);
		s.setBrand("아식스");
		s.setModel("젤 카야노 32");
		s.setPrice(199000.0);
		s.setImages(List.of("a", "b"));
		s.setSpecSources(Map.of("width", Map.of("code", "MAN")));
		return s;
	}

	@Test
	void namesOnlyTheFieldsThatChanged() {
		Shoe s = shoe();
		Map<String, Object> before = ShoeCollection.toDoc(s, false);
		ShoeCollection.apply(s, Map.of("width", "보통", "price", 199000, "sku", "1011C284-400"));   // 가격은 같은 값
		assertEquals(List.of("width", "sku"), ShoeCollection.changedFields(before, ShoeCollection.toDoc(s, false)));
	}

	@Test
	void listsAndNestedSourcesCompareByValue() {
		Shoe s = shoe();
		Map<String, Object> before = ShoeCollection.toDoc(s, false);
		ShoeCollection.apply(s, Map.of("images", List.of("a", "b"), "specSources", Map.of("width", Map.of("code", "MAN"))));
		assertEquals(List.of(), ShoeCollection.changedFields(before, ShoeCollection.toDoc(s, false)));
		ShoeCollection.apply(s, Map.of("images", List.of("b", "a")));   // 순서만 바꿔도 바뀐 것(대표가 바뀐다)
		assertEquals(List.of("images"), ShoeCollection.changedFields(before, ShoeCollection.toDoc(s, false)));
	}

	@Test
	void countsAndHistoryAreNotEdits() {
		Shoe s = shoe();
		Map<String, Object> before = ShoeCollection.toDoc(s, false);
		s.setRating(4.5);
		s.setLikeCount(3);
		s.setLastChange(List.of("x"));
		assertEquals(List.of(), ShoeCollection.changedFields(before, ShoeCollection.toDoc(s, true)));
	}
}
