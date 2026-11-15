package com.kopo17.runshoes.api;

import java.util.Map;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 리뷰 관리(마이페이지 관리자 메뉴, 2026-11-14 — docs/05_api_contract.md 1-1). 일은 AdminReviews.
 * GET    /api/admin/reviews?hidden=&from=&to=&shoeId=&shoe=&author=&page=&size=
 *        hidden=true 면 숨긴 리뷰(숨긴 순), 아니면 보이는 리뷰(작성 순) — 둘 다 최근 먼저. from · to 는 한국 날짜(YYYY-MM-DD, 포함).
 *        shoe 는 브랜드 · 모델 · 영어 이름, author 는 작성자 닉네임(둘 다 부분 일치). → {items, total, page, size}. admin · 데모 관리자
 * POST   /api/admin/reviews/{id}/hide     숨기기(이미 숨김 409 already_hidden)            — admin 만
 * POST   /api/admin/reviews/{id}/restore  되살리기(숨긴 것이 아니면 409 not_hidden)       — admin 만
 * DELETE /api/admin/reviews/{id}          영구 삭제(숨긴 리뷰만, 아니면 409 not_hidden)   — admin 만
 * POST   /api/admin/reviews/{id}/verify   실사용 인증 켜기 · 끄기 {verified: true|false}   — admin 만
 * GET 은 SecurityConfig 가 누구에게나 열어 두므로 401 도 여기서(Viewer) 낸다. 쓰기의 401 은 SecurityConfig.
 */
@RestController
@RequestMapping("/api/admin/reviews")
class AdminReviewController {

	private final AdminReviews reviews;

	AdminReviewController(AdminReviews reviews) {
		this.reviews = reviews;
	}

	@GetMapping
	Map<String, Object> list(@RequestParam(required = false) String hidden, @RequestParam(required = false) String from,
			@RequestParam(required = false) String to, @RequestParam(required = false) String shoeId,
			@RequestParam(required = false) String shoe, @RequestParam(required = false) String author,
			@RequestParam(required = false) String page, @RequestParam(required = false) String size) {
		Viewer viewer = Viewer.current();
		viewer.requireAdminView();
		Long shoeIdValue = shoeId == null || shoeId.isBlank() ? null : AdminPage.id("shoeId", shoeId);
		var filter = new AdminReviews.Filter("true".equals(hidden), AdminPage.fromKst(from), AdminPage.toKstExclusive(to), shoeIdValue,
				AdminPage.like(shoe), AdminPage.like(author));
		return reviews.list(filter, AdminPage.of(page, size), viewer);
	}

	@PostMapping("/{id}/hide")
	Map<String, Object> hide(@PathVariable String id) {
		return reviews.hide(JsonServerController.id(id), Viewer.current());
	}

	@PostMapping("/{id}/restore")
	Map<String, Object> restore(@PathVariable String id) {
		return reviews.restore(JsonServerController.id(id), Viewer.current());
	}

	@DeleteMapping("/{id}")
	Map<String, Object> purge(@PathVariable String id) {
		return reviews.purge(JsonServerController.id(id), Viewer.current());
	}

	@PostMapping("/{id}/verify")
	Map<String, Object> verify(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body) {
		return reviews.verify(JsonServerController.id(id), body == null ? null : body.get("verified"), Viewer.current());
	}
}
