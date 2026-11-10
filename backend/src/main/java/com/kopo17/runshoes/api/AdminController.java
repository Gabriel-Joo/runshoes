package com.kopo17.runshoes.api;

import com.kopo17.runshoes.summary.SummaryStore;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * /api/admin — 관리 화면만 쓰는 길. json-server 계약 밖.
 * GET  /api/admin/shoes/hidden        숨긴 신발(V8) — admin · 데모 관리자(보기만). 비로그인 401 · USER 403
 * POST /api/admin/shoes/{id}/restore  되살리기 — admin 만(데모 관리자 403 demo_admin). 숨기지 않은 · 없는 신발 404
 * DELETE /api/admin/shoes/{id}        영구 삭제(V11) — admin 만. 숨긴 신발만(보이는 신발 409 not_hidden, 없는 신발 404)
 * GET  /api/admin/shoes/purged        영구 삭제 기록(V11) — pull-admin 이 카탈로그 제외로 옮긴다. admin · 데모 관리자
 * GET  /api/admin/summaries          리뷰 요약(V14) 건수 {stale, pending, generated, total} — admin · 데모 관리자, 읽기만(만드는 것은 CronJob)
 * GET 은 SecurityConfig 가 누구에게나 열어 두므로 401 도 여기서(Viewer) 낸다.
 */
@RestController
@RequestMapping("/api/admin")
class AdminController {

	private final ShoeCollection shoes;
	private final SummaryStore summaries;

	AdminController(ShoeCollection shoes, SummaryStore summaries) {
		this.shoes = shoes;
		this.summaries = summaries;
	}

	@GetMapping("/shoes/hidden")
	List<Map<String, Object>> hidden() {
		return shoes.hidden(Viewer.current());
	}

	@PostMapping("/shoes/{id}/restore")
	Map<String, Object> restore(@PathVariable String id) {
		return shoes.restore(JsonServerController.id(id), Viewer.current());
	}

	@DeleteMapping("/shoes/{id}")
	Map<String, Object> purge(@PathVariable String id) {
		return shoes.purge(JsonServerController.id(id), Viewer.current());
	}

	@GetMapping("/summaries")
	Map<String, Object> summaries() {
		Viewer.current().requireAdminView();
		return summaries.counts();
	}

	@GetMapping("/shoes/purged")
	List<Map<String, Object>> purged() {
		return shoes.purged(Viewer.current());
	}
}
