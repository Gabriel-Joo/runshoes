package com.kopo17.runshoes.auth;

import com.kopo17.runshoes.domain.RefreshToken;
import com.kopo17.runshoes.domain.RefreshTokenRepository;
import com.kopo17.runshoes.domain.User;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Component;

/**
 * access token(JWT) 과 refresh token(불투명 256bit) 을 만든다.
 * access 클레임: iss · sub(user id) · role · sid(refresh family — 비밀번호를 바꿀 때 "지금 기기"를 남기는 데 쓴다) · iat · exp · jti
 */
@Component
class TokenService {

	private static final SecureRandom RANDOM = new SecureRandom();

	private final JwtEncoder encoder;
	private final RefreshTokenRepository refreshTokens;
	private final AuthProperties props;

	TokenService(JwtEncoder encoder, RefreshTokenRepository refreshTokens, AuthProperties props) {
		this.encoder = encoder;
		this.refreshTokens = refreshTokens;
		this.props = props;
	}

	String accessToken(User u, String familyId) {
		Instant now = Instant.now();
		JwtClaimsSet claims = JwtClaimsSet.builder()
				.issuer(SecurityConfig.ISSUER)
				.subject(String.valueOf(u.getId()))
				.claim("role", u.getRole())
				.claim("sid", familyId)
				.issuedAt(now)
				.expiresAt(now.plus(props.accessTtl()))
				.id(UUID.randomUUID().toString())
				.build();
		return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
	}

	long accessTtlSeconds() {
		return props.accessTtl().toSeconds();
	}

	/** 새 refresh token 을 DB 에 남기고 원문을 돌려준다(원문은 이때 한 번만 있다) */
	Issued issueRefresh(long userId, String familyId, RequestInfo info) {
		byte[] b = new byte[32];
		RANDOM.nextBytes(b);
		String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(b);
		RefreshToken t = new RefreshToken();
		t.setUserId(userId);
		t.setTokenHash(sha256(raw));
		t.setFamilyId(familyId);
		t.setIssuedAt(Clock.now());
		t.setExpiresAt(t.getIssuedAt().plus(props.refreshTtl()));
		t.setIp(info.ip());
		t.setUserAgent(info.userAgent());
		return new Issued(raw, refreshTokens.save(t));
	}

	static String newFamily() {
		return UUID.randomUUID().toString();
	}

	static String sha256(String raw) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8)));
		} catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

	record Issued(String raw, RefreshToken row) {}
}
