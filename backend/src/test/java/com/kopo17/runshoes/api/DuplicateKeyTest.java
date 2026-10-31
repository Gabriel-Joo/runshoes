package com.kopo17.runshoes.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.SQLIntegrityConstraintViolationException;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

/** 리뷰 저장 오류 가르기 — 첫 리뷰 UNIQUE 만 409, PK 는 아니다(배포 중 id 충돌이 "이미 리뷰를 썼다"로 보였다). MySQL 8 메시지 모양 그대로 */
class DuplicateKeyTest {

	private static DataIntegrityViolationException dup(String message) {
		return new DataIntegrityViolationException("could not execute statement", new SQLIntegrityConstraintViolationException(message));
	}

	@Test
	void firstReviewUnique() {
		DataIntegrityViolationException e = dup("Duplicate entry '3-300' for key 'reviews.uk_reviews_user_first_shoe'");
		assertEquals("reviews.uk_reviews_user_first_shoe", DuplicateKey.key(e));
		assertTrue(DuplicateKey.is(e, "uk_reviews_user_first_shoe"));
	}

	@Test
	void primaryKeyIsNotFirstReview() {
		DataIntegrityViolationException e = dup("Duplicate entry '106' for key 'reviews.PRIMARY'");
		assertEquals("reviews.PRIMARY", DuplicateKey.key(e));
		assertFalse(DuplicateKey.is(e, "uk_reviews_user_first_shoe"));
	}

	@Test
	void notADuplicate() {
		DataIntegrityViolationException e = dup("Cannot add or update a child row: a foreign key constraint fails");
		assertNull(DuplicateKey.key(e));
		assertFalse(DuplicateKey.is(e, "uk_reviews_user_first_shoe"));
	}
}
