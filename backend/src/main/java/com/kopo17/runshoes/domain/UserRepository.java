package com.kopo17.runshoes.domain;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {

	Optional<User> findByEmail(String email);

	/** 닉네임 비교는 DB collation(utf8mb4_unicode_ci)이 한다 — 대소문자를 같게 본다(uk_users_nickname 과 같은 규칙) */
	boolean existsByNickname(String nickname);

	boolean existsByEmail(String email);

	List<User> findByPasswordHashIsNull();
}
