package com.kopo17.runshoes.api;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 챗봇 카탈로그 캐시의 「판」(docs/09_chatbot_rag.md 19절).
 * GET /api/internal/catalog-version  챗봇 사이드카만 — 같은 Pod 안에서 127.0.0.1:3000 으로 들어온 연결만(그 밖은 404 {}, V18 · V19 와 같다).
 *                                    → {"version": "<shoes 체크섬>-<terms 체크섬>"}
 * 챗봇은 턴마다 이것만 묻고, 지난번과 다르면 /api/shoes · /api/terms 를 다시 읽는다.
 *
 * 판을 DB 내용으로 만드는 까닭 — 신발이 바뀌는 길이 관리 화면만이 아니다. 적재기(X-Runshoes-Client: loader)의 등록 · 수정은
 * updated_at 을 찍지 않고, 리뷰 · 찜은 rating · reviewCount · likeCount 를 바꾸며, 사람이 SQL 로 고칠 수도 있다. 어느 길이든
 * 행이 바뀌면 체크섬이 바뀐다. 웹 Pod 가 둘이어도 같은 DB 를 보므로 판이 같다 — 관리 요청이 어느 Pod 에 닿았는지와 상관없다.
 * CHECKSUM TABLE 은 310켤레에서 약 4ms, 열린 쓰기 트랜잭션을 기다리지 않는다(2026-11-14 로컬 확인).
 */
@RestController
class CatalogVersionController {

	private final JdbcTemplate jdbc;

	CatalogVersionController(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	@GetMapping("/api/internal/catalog-version")
	Map<String, Object> version(HttpServletRequest req) {
		if (!ChatbotMissController.isLoopback(req.getLocalAddr())) throw ApiException.notFound();
		// 결과 행: (Table, Checksum) — 표 순서대로
		List<String> sums = jdbc.query("CHECKSUM TABLE shoes, terms", (rs, i) -> String.valueOf(rs.getLong(2)));
		return Map.of("version", String.join("-", sums));
	}
}
