package com.kopo17.runshoes.domain;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface ShoeRepository extends JpaRepository<Shoe, Long> {

	/** 새 id = 최대값 + 1 — json-server createId. 숨긴 행(V8)도 id 를 가지고 있어 포함한다(native — 엔티티 쿼리는 숨긴 행을 못 본다) */
	@Query(value = "select max(id) from shoes", nativeQuery = true)
	Long maxId();

	/** 숨긴 신발(V8) — 관리 화면의 되살리기 목록. 숨긴 순서 최근 먼저 */
	@Query(value = "select * from shoes where deleted_at is not null order by deleted_at desc, id", nativeQuery = true)
	java.util.List<Shoe> findHidden();

	@Query(value = "select count(*) from shoes where id = :id and deleted_at is not null", nativeQuery = true)
	long countHidden(Long id);

	@Query(value = "select id from shoes where deleted_at is not null", nativeQuery = true)
	java.util.List<Long> hiddenIds();

	@Modifying
	@Query(value = "update shoes set deleted_at = :at where id = :id and deleted_at is null", nativeQuery = true)
	int hide(Long id, java.time.LocalDateTime at);

	@Modifying
	@Query(value = "update shoes set deleted_at = null where id = :id and deleted_at is not null", nativeQuery = true)
	int unhide(Long id);

	/** 숨긴 행까지 — 같은 라인 · 세대 · 성별의 숨긴 신발이 있으면 새로 넣지 않고 되살리게(409). DB UNIQUE 는 숨긴 행에도 걸린다 */
	@Query(value = "select id from shoes where line_key = :lineKey and generation = :generation and gender = :gender and deleted_at is not null", nativeQuery = true)
	java.util.List<Long> hiddenGeneration(String lineKey, Integer generation, String gender);

	long countByIdIn(java.util.Collection<Long> ids);

	/** 한 라인 · 세대 · 성별은 한 행(V4 uk_shoes_line_generation_gender) — 쓰기 전에 겹치는 행을 찾아 409 로 돌려준다 */
	java.util.List<Shoe> findByLineKeyAndGenerationAndGender(String lineKey, Integer generation, String gender);
}
