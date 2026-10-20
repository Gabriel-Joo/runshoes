package com.kopo17.runshoes.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/** refresh_tokens(V3) — 원문은 쿠키에만, 여기는 SHA-256(token_hash). family 하나 = 로그인 한 번 */
@Entity
@Table(name = "refresh_tokens")
public class RefreshToken {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "user_id")
	private Long userId;

	@Column(name = "token_hash", columnDefinition = "char(64)")
	private String tokenHash;

	@Column(name = "family_id", columnDefinition = "char(36)")
	private String familyId;

	@Column(name = "issued_at")
	private LocalDateTime issuedAt;

	@Column(name = "expires_at")
	private LocalDateTime expiresAt;

	@Column(name = "revoked_at")
	private LocalDateTime revokedAt;

	@Column(name = "replaced_by")
	private Long replacedBy;

	private String ip;

	@Column(name = "user_agent")
	private String userAgent;

	public Long getId() { return id; }
	public Long getUserId() { return userId; }
	public void setUserId(Long userId) { this.userId = userId; }
	public String getTokenHash() { return tokenHash; }
	public void setTokenHash(String tokenHash) { this.tokenHash = tokenHash; }
	public String getFamilyId() { return familyId; }
	public void setFamilyId(String familyId) { this.familyId = familyId; }
	public LocalDateTime getIssuedAt() { return issuedAt; }
	public void setIssuedAt(LocalDateTime issuedAt) { this.issuedAt = issuedAt; }
	public LocalDateTime getExpiresAt() { return expiresAt; }
	public void setExpiresAt(LocalDateTime expiresAt) { this.expiresAt = expiresAt; }
	public LocalDateTime getRevokedAt() { return revokedAt; }
	public void setRevokedAt(LocalDateTime revokedAt) { this.revokedAt = revokedAt; }
	public Long getReplacedBy() { return replacedBy; }
	public void setReplacedBy(Long replacedBy) { this.replacedBy = replacedBy; }
	public String getIp() { return ip; }
	public void setIp(String ip) { this.ip = ip; }
	public String getUserAgent() { return userAgent; }
	public void setUserAgent(String userAgent) { this.userAgent = userAgent; }
}
