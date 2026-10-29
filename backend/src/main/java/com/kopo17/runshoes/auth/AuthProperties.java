package com.kopo17.runshoes.auth;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * app.auth — 값은 Secret runshoes-auth(JWT_SECRET · SEED_USER_PASSWORD · ADMIN_PASSWORD)에서 env 로 들어온다. git 에는 없다.
 * jwtSecret 은 32바이트 이상이어야 뜬다(HS256). 비밀번호 둘은 비어 있으면 그 계정들을 채우지 않을 뿐 뜬다(SeedPasswords).
 * demoLoginEnabled — env DEMO_LOGIN_ENABLED(기본 꺼짐). 끄면 체험 카드 API 둘이 404(docs/ADMIN_DEMO_DESIGN.md 8.3).
 */
@ConfigurationProperties("app.auth")
record AuthProperties(String jwtSecret, Duration accessTtl, Duration refreshTtl, boolean cookieSecure,
		String seedUserPassword, String adminPassword, boolean demoLoginEnabled) {
}
