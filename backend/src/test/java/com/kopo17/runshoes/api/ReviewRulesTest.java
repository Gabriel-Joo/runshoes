package com.kopo17.runshoes.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

/** 리뷰 입력 — 별점 1~5 정수, 내용 10~1,000자(공백 제외 · 코드포인트) */
class ReviewRulesTest {

	@Test
	void 별점은_1에서_5_정수() {
		assertEquals(5, ReviewRules.rating(5));
		assertEquals(1, ReviewRules.rating(1.0));
		assertThrows(ApiException.class, () -> ReviewRules.rating(0));
		assertThrows(ApiException.class, () -> ReviewRules.rating(6));
		assertThrows(ApiException.class, () -> ReviewRules.rating(4.5));
		assertThrows(ApiException.class, () -> ReviewRules.rating("5"));
		assertThrows(ApiException.class, () -> ReviewRules.rating(null));
	}

	@Test
	void 내용은_앞뒤_공백을_빼고_10에서_1000자() {
		assertEquals("신발이 너무 좋아요!", ReviewRules.content("  신발이 너무 좋아요!  "));   // 시드의 가장 짧은 리뷰가 10자
		assertThrows(ApiException.class, () -> ReviewRules.content("너무 좋아요!"));
		assertThrows(ApiException.class, () -> ReviewRules.content("          가나다"));
		assertEquals(1000, ReviewRules.content("가".repeat(1000)).length());
		assertThrows(ApiException.class, () -> ReviewRules.content("가".repeat(1001)));
		assertThrows(ApiException.class, () -> ReviewRules.content(null));
		assertThrows(ApiException.class, () -> ReviewRules.content(10));
	}
}
