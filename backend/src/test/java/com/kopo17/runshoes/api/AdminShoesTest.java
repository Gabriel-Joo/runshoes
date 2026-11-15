package com.kopo17.runshoes.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * 신발 관리 목록(2026-11-15) — 거르기 · 정렬은 SQL 이 한다. 여기서는 요청의 글이 SQL 에 이어 붙지 않는지(바인딩), 정렬 조각이 정해진 것인지를 본다.
 * 결과가 메모리 방식과 같은지는 310켤레 사본에서 기준을 떠 견줬다(docs/03_admin.md 1-1). 쿼리 자체는 계약 시나리오(X233 ~ X242)가 돌린다
 */
class AdminShoesTest {

	@Test
	void userTextIsBoundNotConcatenated() {
		String evil = "x' OR 1=1 --";
		AdminShoes.Where w = AdminShoes.where(evil, evil + " 나이키");
		assertFalse(w.sql().contains("OR 1=1"));
		assertEquals(evil, w.args().get(0));                          // 브랜드는 그대로(앞뒤 공백만 뺀다)
		assertTrue(w.args().contains("x'"));                          // 검색은 낱말로 나뉘어 바인딩
		assertTrue(w.args().contains("나이키"));
		assertEquals(w.sql().chars().filter(ch -> ch == '?').count(), w.args().size());
	}

	@Test
	void searchIsNfcLowercaseWords() {
		AdminShoes.Where w = AdminShoes.where(null, "  NIKE   Pegasus ");
		assertTrue(w.args().contains("nike"));
		assertTrue(w.args().contains("pegasus"));
		assertEquals(2, w.sql().split("LOCATE", -1).length - 1);       // 낱말마다 하나(AND)
		assertEquals("s.deleted_at IS NULL", AdminShoes.where(" ", "   ").sql());
	}

	@Test
	void ordersAreFixedFragmentsWithIdAsTieBreak() {
		for (String s : List.of("updated", "id", "brand", "model", "gaps")) {
			for (boolean down : List.of(true, false)) {
				String sql = AdminShoes.order(s, down).sql();
				assertTrue(sql.contains("s.id"), s);                    // 같은 값이면 id — 쪽 사이 순서가 흔들리지 않게
				assertEquals(sql.chars().filter(ch -> ch == '?').count(), AdminShoes.order(s, down).koArgs());
			}
		}
		assertTrue(AdminShoes.order("updated", true).sql().startsWith("s.updated_at IS NULL"));   // 고친 적 없는 것은 방향과 상관없이 뒤
		assertTrue(AdminShoes.order("updated", false).sql().startsWith("s.updated_at IS NULL"));
		assertTrue(AdminShoes.order("model", true).sql().contains("utf8mb4_0900_ai_ci ASC"));
	}

	@Test
	void gapOrderIsTheScreenChipOrder() {
		assertEquals(List.of("price", "width", "wideAvailable", "stackHeight", "midsole", "carbon", "weight", "drop", "weightSize", "sku"),
				List.copyOf(AdminShoes.GAPS.keySet()));
	}
}
