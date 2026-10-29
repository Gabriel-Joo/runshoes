package com.kopo17.runshoes.domain;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface ReviewRepository extends JpaRepository<Review, Long> {

	@Query("select max(r.id) from Review r")
	Long maxId();

	/** 한 신발에 첫 리뷰 하나 — uk_reviews_user_first_shoe 가 정답이고, 이건 409 를 먼저 알려 주려고 */
	boolean existsByUserIdAndShoeIdAndReviewType(Long userId, Long shoeId, String reviewType);

	/** 신발을 숨길 때(V8) 활동 로그에 남기는 리뷰 수 — 리뷰는 지우지 않는다 */
	long countByShoeId(Long shoeId);

	long countByUserId(Long userId);

	/** 닉네임을 바꾸면 그 사람 리뷰의 author(닉네임 스냅샷)도 — 같은 트랜잭션에서 */
	@Modifying
	@Query(value = "update reviews set author = :nickname where user_id = :userId", nativeQuery = true)
	int renameAuthor(Long userId, String nickname);

	/** 탈퇴 회원의 리뷰(V9) — 남기되 작성자 이름만 */
	String WITHDRAWN_AUTHOR = "탈퇴 회원";
}
