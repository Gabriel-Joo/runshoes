package com.kopo17.runshoes.api;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 신발의 rating · reviewCount 를 서버가 센다 — 리뷰를 쓰고 · 고치고 · 지울 때마다(예전에는 프런트가 계산해 PATCH 했다).
 * 첫 리뷰(FIRST)만. 소수 한 자리 반올림: AVG(INT) 는 DECIMAL 이라 ROUND 가 0.5 를 올린다 — 프런트의 Math.round(x*10)/10 과 같고,
 * V3__auth.sql 이 8번 신발을 다시 셀 때와 같은 식이다. 리뷰가 없으면 0(프런트가 하던 것과 같다).
 * 실사용 후기(FOLLOWUP)를 평점에 넣을지는 UI 때 정한다 — 여기 WHERE 만 바꾼다.
 * lock: 리뷰를 쓰기 · 고치기 · 지우기 전에 신발 행을 먼저 잠근다(2026-11-01). 리뷰 INSERT 의 FK 검사가 신발 행에 공유 잠금을 걸고
 * 다시 세기(UPDATE shoes)가 배타 잠금을 원하면, 같은 신발에 두 요청이 겹칠 때(Pod 둘이 겹치는 배포 중) 서로 기다리다 데드락이 난다.
 */
@Component
class Ratings {

	private final JdbcTemplate jdbc;

	Ratings(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	void lock(long shoeId) {
		jdbc.queryForList("SELECT id FROM shoes WHERE id = ? FOR UPDATE", Long.class, shoeId);
	}

	void recompute(long shoeId) {
		jdbc.update("""
				UPDATE shoes s SET
				  s.review_count = (SELECT COUNT(*) FROM reviews r WHERE r.shoe_id = s.id AND r.review_type = 'FIRST'),
				  s.rating = COALESCE((SELECT ROUND(AVG(r.rating), 1) FROM reviews r WHERE r.shoe_id = s.id AND r.review_type = 'FIRST'), 0)
				WHERE s.id = ?""", shoeId);
	}
}
