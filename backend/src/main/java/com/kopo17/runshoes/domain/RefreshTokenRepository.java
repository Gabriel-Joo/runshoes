package com.kopo17.runshoes.domain;

import java.time.LocalDateTime;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

	Optional<RefreshToken> findByTokenHash(String tokenHash);

	boolean existsByFamilyIdAndRevokedAtIsNull(String familyId);

	/** 재사용 감지 · 로그아웃 — 그 family 의 살아 있는 토큰을 전부 */
	@Modifying
	@Query("update RefreshToken t set t.revokedAt = :now where t.familyId = :familyId and t.revokedAt is null")
	int revokeFamily(String familyId, LocalDateTime now);

	/** 비밀번호를 바꾸면 — 지금 기기(keepFamily)를 뺀 그 사용자의 모든 로그인 */
	@Modifying
	@Query("update RefreshToken t set t.revokedAt = :now where t.userId = :userId and t.familyId <> :keepFamily and t.revokedAt is null")
	int revokeOthers(Long userId, String keepFamily, LocalDateTime now);
}
