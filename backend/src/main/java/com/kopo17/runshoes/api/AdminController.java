package com.kopo17.runshoes.api;

import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * /api/admin — 관리 화면만 쓰는 길. json-server 계약 밖.
 * GET  /api/admin/shoes/hidden        숨긴 신발(V8) — admin · 데모 관리자(보기만). 비로그인 401 · USER 403
 * POST /api/admin/shoes/{id}/restore  되살리기 — admin 만(데모 관리자 403 demo_admin). 숨기지 않은 · 없는 신발 404
 * GET 은 SecurityConfig 가 누구에게나 열어 두므로 401 도 여기서(Viewer) 낸다.
 */
@RestController
@RequestMapping("/api/admin")
class AdminController {

	private final ShoeCollection shoes;

	AdminController(ShoeCollection shoes) {
		this.shoes = shoes;
	}

	@GetMapping("/shoes/hidden")
	List<Map<String, Object>> hidden() {
		return shoes.hidden(Viewer.current());
	}

	@PostMapping("/shoes/{id}/restore")
	Map<String, Object> restore(@PathVariable String id) {
		return shoes.restore(JsonServerController.id(id), Viewer.current());
	}
}
