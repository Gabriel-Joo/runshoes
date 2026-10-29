package com.kopo17.runshoes.domain;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface UserRepository extends JpaRepository<User, Long> {

	Optional<User> findByEmail(String email);

	/** 닉네임 비교는 DB collation(utf8mb4_unicode_ci)이 한다 — 대소문자를 같게 본다(uk_users_nickname 과 같은 규칙) */
	boolean existsByNickname(String nickname);

	boolean existsByEmail(String email);

	List<User> findByPasswordHashIsNull();

	/** 체험 카드(GET /api/auth/demo-accounts) — 시드 계정(runner01~30@runshoes.test, V3) 전부, id 순(화면이 슬라이드로 돌린다). 탈퇴 · 실제 가입자 · 관리자는 빠진다 */
	@Query(value = "select * from users where role = 'USER' and deleted_at is null and email regexp '^runner[0-9]{2}@runshoes[.]test$' order by id", nativeQuery = true)
	List<User> seedUsers();

	Optional<User> findFirstByRoleAndDeletedAtIsNull(String role);
}
