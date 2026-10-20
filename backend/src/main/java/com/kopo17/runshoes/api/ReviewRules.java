package com.kopo17.runshoes.api;

/** 리뷰 입력 — 별점 정수 1~5, 내용 앞뒤 공백을 빼고 10~1,000자(docs/AUTH_DESIGN.md 4절). 프런트도 같은 규칙으로 먼저 본다 */
final class ReviewRules {

	private ReviewRules() {}

	static int rating(Object v) {
		Integer r = Values.integer("rating", v);
		if (r == null || r < 1 || r > 5) throw ApiException.badRequest("rating 은 1~5");
		return r;
	}

	static String content(Object v) {
		String c = Values.str("content", v);
		c = c == null ? "" : c.strip();
		int n = c.codePointCount(0, c.length());
		if (n < 10 || n > 1000) throw ApiException.badRequest("content 는 10~1000자");
		return c;
	}
}
