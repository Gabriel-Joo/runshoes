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
}
