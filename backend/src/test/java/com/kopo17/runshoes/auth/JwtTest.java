package com.kopo17.runshoes.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Duration;
import java.time.Instant;
import javax.crypto.SecretKey;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;

/** HS256 발급 · 검증 — DB 없이. 키 길이 · issuer · 만료 · 다른 키 */
class JwtTest {

	private final SecurityConfig config = new SecurityConfig();

	private static AuthProperties props(String secret) {
		return new AuthProperties(secret, Duration.ofMinutes(15), Duration.ofDays(14), true, null, null);
	}

	@Test
	void 키가_32바이트보다_짧으면_뜨지_않는다() {
		assertThrows(IllegalStateException.class, () -> config.jwtKey(props("short")));
		assertThrows(IllegalStateException.class, () -> config.jwtKey(props(null)));
	}

	@Test
	void 발급한_토큰을_검증하고_다른_키_issuer_만료는_거절한다() {
		SecretKey key = config.jwtKey(props("test-secret-0123456789-0123456789-abcdef"));
		JwtEncoder enc = config.jwtEncoder(key);
		JwtDecoder dec = config.jwtDecoder(key);

		String token = enc.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), JwtClaimsSet.builder()
				.issuer("runshoes").subject("7").claim("role", "ADMIN").claim("sid", "fam-1")
				.issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(900)).build())).getTokenValue();
		Jwt jwt = dec.decode(token);
		assertEquals("7", jwt.getSubject());
		assertEquals("ADMIN", jwt.getClaimAsString("role"));
		assertEquals("fam-1", jwt.getClaimAsString("sid"));

		JwtDecoder other = config.jwtDecoder(config.jwtKey(props("another-secret-0123456789-0123456789-xyz")));
		assertThrows(JwtException.class, () -> other.decode(token));

		String wrongIssuer = enc.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), JwtClaimsSet.builder()
				.issuer("someone-else").subject("7").issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(900)).build())).getTokenValue();
		assertThrows(JwtException.class, () -> dec.decode(wrongIssuer));

		String expired = enc.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), JwtClaimsSet.builder()
				.issuer("runshoes").subject("7").issuedAt(Instant.now().minusSeconds(3600)).expiresAt(Instant.now().minusSeconds(1800)).build()))
				.getTokenValue();
		assertThrows(JwtException.class, () -> dec.decode(expired));
	}

	@Test
	void refresh_원문은_SHA256_hex_64자로만_남긴다() {
		assertEquals(64, TokenService.sha256("abc").length());
		assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", TokenService.sha256("abc"));
	}
}
