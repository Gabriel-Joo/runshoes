package com.kopo17.runshoes.api;

import java.sql.Timestamp;
import java.util.HashSet;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 찜(likes) · 리뷰 공감(review_likes) — 사용자별 행과 카운터(shoes.like_count · reviews.like_count)를 같은 트랜잭션에서.
 * 카운터는 시드 값이 기준이라 COUNT 로 다시 세지 않는다 — 행이 실제로 생기거나 없어졌을 때만 ±1(V3__auth.sql).
 * 호출하는 쪽의 @Transactional 안에서 돈다(JpaTransactionManager 가 JDBC 도 같은 연결로 묶는다).
 */
@Component
class Likes {

	private final JdbcTemplate jdbc;

	Likes(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	Set<Long> shoesLikedBy(Long userId) {
		if (userId == null) return Set.of();
		return new HashSet<>(jdbc.queryForList("SELECT shoe_id FROM likes WHERE user_id = ?", Long.class, userId));
	}

	Set<Long> reviewsLikedBy(Long userId) {
		if (userId == null) return Set.of();
		return new HashSet<>(jdbc.queryForList("SELECT review_id FROM review_likes WHERE user_id = ?", Long.class, userId));
	}

	/** 이미 찜했으면 그대로(멱등) */
	void likeShoe(long userId, long shoeId) {
		if (jdbc.update("INSERT IGNORE INTO likes (user_id, shoe_id, created_at) VALUES (?, ?, ?)", userId, shoeId, now()) == 1) {
			jdbc.update("UPDATE shoes SET like_count = like_count + 1 WHERE id = ?", shoeId);
		}
	}

	void unlikeShoe(long userId, long shoeId) {
		if (jdbc.update("DELETE FROM likes WHERE user_id = ? AND shoe_id = ?", userId, shoeId) == 1) {
			jdbc.update("UPDATE shoes SET like_count = GREATEST(like_count - 1, 0) WHERE id = ?", shoeId);
		}
	}

	/** 공감 수가 NULL(시드 2건 · 새 리뷰)이면 0 에서 센다 */
	void likeReview(long userId, long reviewId) {
		if (jdbc.update("INSERT IGNORE INTO review_likes (user_id, review_id, created_at) VALUES (?, ?, ?)", userId, reviewId, now()) == 1) {
			jdbc.update("UPDATE reviews SET like_count = COALESCE(like_count, 0) + 1 WHERE id = ?", reviewId);
		}
	}

	void unlikeReview(long userId, long reviewId) {
		if (jdbc.update("DELETE FROM review_likes WHERE user_id = ? AND review_id = ?", userId, reviewId) == 1) {
			jdbc.update("UPDATE reviews SET like_count = GREATEST(COALESCE(like_count, 0) - 1, 0) WHERE id = ?", reviewId);
		}
	}

	boolean likesShoe(long userId, long shoeId) {
		return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM likes WHERE user_id = ? AND shoe_id = ?)", Boolean.class, userId, shoeId));
	}

	boolean likesReview(long userId, long reviewId) {
		return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM review_likes WHERE user_id = ? AND review_id = ?)", Boolean.class, userId, reviewId));
	}

	int shoeLikeCount(long shoeId) {
		return jdbc.queryForObject("SELECT like_count FROM shoes WHERE id = ?", Integer.class, shoeId);
	}

	int reviewLikeCount(long reviewId) {
		Integer n = jdbc.queryForObject("SELECT like_count FROM reviews WHERE id = ?", Integer.class, reviewId);
		return n == null ? 0 : n;
	}

	private static Timestamp now() {
		return Timestamp.valueOf(Values.nowUtc());
	}
}
