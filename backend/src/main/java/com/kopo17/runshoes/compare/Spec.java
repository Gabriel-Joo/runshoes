package com.kopo17.runshoes.compare;

import com.kopo17.runshoes.domain.Shoe;

/** 비교 · 추천이 읽는 칸만 — 엔티티와 떨어진 순수 계산(시험은 이 레코드로 만든다) */
record Spec(
		long id,
		String brand,
		String model,
		String purpose,
		String stability,
		Double stackHeight,
		Double drop,
		Double weight,
		Double weightNorm270,
		String weightSize,
		Boolean carbon,
		String lineKey,
		Boolean isCurrent,
		Double price,
		String width,
		Boolean wideAvailable,
		String wideScope,
		Double rating,
		Integer reviewCount,
		Integer likeCount) {

	static Spec of(Shoe s) {
		return new Spec(s.getId(), s.getBrand(), s.getModel(), s.getPurpose(), s.getStability(), s.getStackHeight(), s.getDrop(),
				s.getWeight(), s.getWeightNorm270(), s.getWeightSize(), s.getCarbon(), s.getLineKey(), s.getIsCurrent(),
				s.getPrice(), s.getWidth(), s.getWideAvailable(), s.getWideScope(), s.getRating(), s.getReviewCount(), s.getLikeCount());
	}
}
