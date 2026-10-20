package com.kopo17.runshoes.domain;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ShoeRepository extends JpaRepository<Shoe, Long> {

	/** 새 id = 남은 최대값 + 1 — json-server createId(지운 마지막 id 를 다시 쓴다) */
	@Query("select max(s.id) from Shoe s")
	Long maxId();

	long countByIdIn(java.util.Collection<Long> ids);
}
