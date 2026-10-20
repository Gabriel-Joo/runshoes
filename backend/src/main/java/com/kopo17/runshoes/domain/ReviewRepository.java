package com.kopo17.runshoes.domain;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface ReviewRepository extends JpaRepository<Review, Long> {

	@Query("select max(r.id) from Review r")
	Long maxId();

	/** shoe 를 지울 때 먼저 — FK ON DELETE CASCADE 와 이중으로(json-server getRemovable) */
	@Modifying
	@Query("delete from Review r where r.shoeId = :shoeId")
	void deleteByShoeId(Long shoeId);

	/** 닉네임을 바꾸면 그 사람 리뷰의 author(닉네임 스냅샷)도 — 같은 트랜잭션에서 */
	@Modifying
	@Query(value = "update reviews set author = :nickname where user_id = :userId", nativeQuery = true)
	int renameAuthor(Long userId, String nickname);
}
