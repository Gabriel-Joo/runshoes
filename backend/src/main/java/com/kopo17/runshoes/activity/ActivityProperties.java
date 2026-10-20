package com.kopo17.runshoes.activity;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * app.activity — 보관 기간 · 정리 시각 · 크기 경고(docs/AUTH_RATELIMIT_DESIGN.md 3 · 6절).
 * 인증(auth.* · user.*) 90일, 쓰기 · 조회 180일. 남은 행이 warnRows 를 넘으면 정리 job 이 WARN — 100만에 닿기 전에 사람이 보게 50만
 */
@ConfigurationProperties("app.activity")
public record ActivityProperties(Duration retentionAuth, Duration retentionOther, String cleanupCron, long warnRows) {
}
