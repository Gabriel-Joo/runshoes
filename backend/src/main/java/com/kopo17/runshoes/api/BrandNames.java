package com.kopo17.runshoes.api;

import java.util.Map;

/**
 * 브랜드 영문 이름 — 검색에서 "nike" · "hoka" 로도 찾게(2026-11-09 사용자). DB 의 brand 는 한글로만 저장돼 있고(카탈로그 규칙),
 * 영어 이름(modelEn) 칸에는 모델명만 있어 영문 브랜드 검색이 0건이었다. 스키마를 바꾸지 않고 여기 표 하나로 — 새 브랜드가 들어오면 더한다.
 */
final class BrandNames {

	private static final Map<String, String> EN = Map.ofEntries(
			Map.entry("아디다스", "adidas"),
			Map.entry("아식스", "asics"),
			Map.entry("나이키", "nike"),
			Map.entry("뉴발란스", "new balance"),
			Map.entry("호카", "hoka"),
			Map.entry("온", "on"),
			Map.entry("브룩스", "brooks"),
			Map.entry("사우코니", "saucony"),
			Map.entry("푸마", "puma"),
			Map.entry("미즈노", "mizuno"),
			Map.entry("살로몬", "salomon"),
			Map.entry("알트라", "altra"),
			Map.entry("언더아머", "under armour"),
			Map.entry("머렐", "merrell"));

	private BrandNames() {}

	/** 한글 브랜드 → 영문(모르면 빈 문자열) */
	static String english(String brand) {
		return brand == null ? "" : EN.getOrDefault(brand.strip(), "");
	}
}
