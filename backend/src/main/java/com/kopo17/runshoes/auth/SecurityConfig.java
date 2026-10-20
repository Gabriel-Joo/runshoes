package com.kopo17.runshoes.auth;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.nio.charset.StandardCharsets;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;

/**
 * 인증은 Bearer access token(JWT HS256, 15분) 하나 — 세션 · CSRF 토큰 · 폼 로그인은 쓰지 않는다(docs/AUTH_DESIGN.md).
 * refresh 는 쿠키(/api/auth 한정)라 CSRF 대상이 /api/auth 뿐이다 — SameSite=Strict + Origin 확인(AuthController) + CORS 제외(ApiHeadersFilter).
 *
 * 응답 헤더(CORS · Cache-Control)는 계약대로 ApiHeadersFilter 가 Security 보다 먼저 붙인다 — Security 의 Cache-Control 은 끈다
 * (켜 두면 no-cache, no-store, max-age=0 … 으로 덮어 계약 헤더가 바뀐다). OPTIONS 는 ApiHeadersFilter 가 204 로 끝내 여기까지 오지 않는다.
 */
@Configuration
@EnableConfigurationProperties(AuthProperties.class)
class SecurityConfig {

	static final String ISSUER = "runshoes";

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http, AuthEntryPoints entry) throws Exception {
		http.csrf(c -> c.disable())
				.cors(c -> c.disable())
				.httpBasic(b -> b.disable())
				.formLogin(f -> f.disable())
				.logout(l -> l.disable())
				.requestCache(r -> r.disable())
				.sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.headers(h -> h.cacheControl(c -> c.disable()))
				// 읽기는 누구나, /api 쓰기는 로그인 — 대상이 있는지 보기 전에 401. 그 뒤 404 → 403 은 컬렉션(api/Viewer)
				.authorizeHttpRequests(a -> a
						.requestMatchers("/api/auth/**").permitAll()
						.requestMatchers("/api/me", "/api/me/**").authenticated()
						.requestMatchers(HttpMethod.GET, "/**").permitAll()
						.requestMatchers(HttpMethod.HEAD, "/**").permitAll()
						.requestMatchers("/api/**").authenticated()
						.anyRequest().permitAll())
				.oauth2ResourceServer(o -> o.authenticationEntryPoint(entry)
						.jwt(j -> j.jwtAuthenticationConverter(roleConverter())))
				.exceptionHandling(e -> e.authenticationEntryPoint(entry).accessDeniedHandler(entry));
		return http.build();
	}

	/** 클레임 role(USER · ADMIN) → ROLE_USER · ROLE_ADMIN */
	private static JwtAuthenticationConverter roleConverter() {
		JwtGrantedAuthoritiesConverter roles = new JwtGrantedAuthoritiesConverter();
		roles.setAuthoritiesClaimName("role");
		roles.setAuthorityPrefix("ROLE_");
		JwtAuthenticationConverter c = new JwtAuthenticationConverter();
		c.setJwtGrantedAuthoritiesConverter(roles);
		return c;
	}

	@Bean
	SecretKey jwtKey(AuthProperties props) {
		byte[] bytes = props.jwtSecret() == null ? new byte[0] : props.jwtSecret().getBytes(StandardCharsets.UTF_8);
		if (bytes.length < 32) {
			throw new IllegalStateException("JWT_SECRET 이 없거나 32바이트보다 짧다 — Secret runshoes-auth 를 확인(openssl rand -base64 48)");
		}
		return new SecretKeySpec(bytes, "HmacSHA256");
	}

	@Bean
	JwtEncoder jwtEncoder(SecretKey jwtKey) {
		return new NimbusJwtEncoder(new ImmutableSecret<>(jwtKey));
	}

	@Bean
	JwtDecoder jwtDecoder(SecretKey jwtKey) {
		NimbusJwtDecoder d = NimbusJwtDecoder.withSecretKey(jwtKey).macAlgorithm(MacAlgorithm.HS256).build();
		d.setJwtValidator(JwtValidators.createDefaultWithIssuer(ISSUER));
		return d;
	}

	@Bean
	PasswordEncoder passwordEncoder() {
		return new BCryptPasswordEncoder(10);
	}
}
