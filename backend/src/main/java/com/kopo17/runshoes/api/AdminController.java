package com.kopo17.runshoes.api;

import com.kopo17.runshoes.summary.SummaryStore;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * /api/admin — 관리 화면만 쓰는 길. json-server 계약 밖.
 * GET  /api/admin/shoes?tab=&brand=&search=&gap=&sort=&dir=&page=&size=   신발 관리 탭의 목록, 서버가 쪽을 나눈다(2026-11-15, AdminShoes)
 *                                     {items, total, page, size, counts, gapCounts} — admin · 데모 관리자
 * GET  /api/admin/shoes/hidden        숨긴 신발(V8) — admin · 데모 관리자(보기만). 비로그인 401 · USER 403. 화면은 이제 위 목록(tab=hidden)을 쓴다 — 계약 시나리오가 본다
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
	private final AdminShoes adminShoes;

	AdminController(ShoeCollection shoes, SummaryStore summaries, AdminShoes adminShoes) {
		this.shoes = shoes;
		this.summaries = summaries;
		this.adminShoes = adminShoes;
	}

	/**
	 * 신발 관리 탭의 목록 — 서버가 쪽을 나눈다(AdminShoes). tab = list(기본) · hidden · gaps · purged, sort = updated(기본, gaps 탭은 gaps) · id · brand · model · gaps,
	 * dir = down(기본) · up, gap = 빈 칸 이름(AdminShoes.GAPS). 모르는 값은 400
	 */
	@GetMapping("/shoes")
	Map<String, Object> list(@RequestParam(required = false) String tab, @RequestParam(required = false) String brand,
			@RequestParam(required = false) String search, @RequestParam(required = false) String gap,
			@RequestParam(required = false) String sort, @RequestParam(required = false) String dir,
			@RequestParam(required = false) String page, @RequestParam(required = false) String size) {
		Viewer viewer = Viewer.current();
		viewer.requireAdminView();
		String t = tab == null || tab.isBlank() ? "list" : tab.strip();
		if (!AdminShoes.TABS.contains(t)) throw ApiException.invalid("tab 은 list · hidden · gaps · purged 가운데 하나예요.");
		String s = sort == null || sort.isBlank() ? (t.equals("gaps") ? "gaps" : "updated") : sort.strip();
		if (!AdminShoes.SORTS.contains(s)) throw ApiException.invalid("sort 는 updated · id · brand · model · gaps 가운데 하나예요.");
		String d = dir == null || dir.isBlank() ? "down" : dir.strip();
		if (!d.equals("down") && !d.equals("up")) throw ApiException.invalid("dir 은 down · up 가운데 하나예요.");
		String g = gap == null || gap.isBlank() ? null : gap.strip();
		if (g != null && !AdminShoes.GAPS.containsKey(g)) throw ApiException.invalid("gap 은 " + String.join(" · ", AdminShoes.GAPS.keySet()) + " 가운데 하나예요.");
		AdminPage p = AdminPage.of(page, size);
		return adminShoes.list(new AdminShoes.Query(t, brand, search, g, s, d.equals("down")), p, viewer);
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
