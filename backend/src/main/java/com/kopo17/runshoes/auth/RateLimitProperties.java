package com.kopo17.runshoes.auth;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** app.ratelimit — 로그인: 같은 계정 15분 5번 · 같은 IP 15분 20번, 가입: 같은 IP 1시간 10건(docs/AUTH_RATELIMIT_DESIGN.md 1절) */
@ConfigurationProperties("app.ratelimit")
record RateLimitProperties(int loginAccount, int loginIp, Duration loginWindow, int signupIp, Duration signupWindow) {
}
