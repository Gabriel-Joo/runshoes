package com.kopo17.runshoes.activity;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * app.activity — 보관 기간 · 정리 시각 · 크기 경고(docs/04_auth.md).
 * 인증(auth.* · user.*) 90일, 쓰기 · 조회 180일. 남은 행이 warnRows 를 넘으면 정리 job 이 WARN — 100만에 닿기 전에 사람이 보게 50만.
 * retentionChatbotText — chatbot_turns(V19)의 질문 · 답 글을 빈 글로 바꾸기까지(90일). 행과 숫자 칸은 남긴다(사용자 2026-11-14 · 11-17).
 *   사람이 쓴 글이 통째로 들어 있어 개인정보에 가깝다 — 글이 없는 행동 기록(180일)보다 짧게 둔다.
 */
@ConfigurationProperties("app.activity")
public record ActivityProperties(Duration retentionAuth, Duration retentionOther, Duration retentionChatbotText, String cleanupCron,
		long warnRows) {
}
