package com.kopo17.runshoes.api;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * GET /api/brands — 브랜드 이름 목록(등록·관리의 브랜드 칩). json-server 에는 없던 경로다.
 * 신발 목록을 전부 받아 브랜드를 뽑지 않게 — 목록은 검색 · 필터 결과만 받는다(contract/scenarios.mjs SEARCH_SCENARIOS).
 */
@RestController
class BrandController {

	private final ShoeCollection shoes;

	BrandController(ShoeCollection shoes) {
		this.shoes = shoes;
	}

	@GetMapping("/api/brands")
	List<String> brands() {
		return shoes.brands();
	}
}
