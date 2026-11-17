package com.kopo17.runshoes.activity;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.List;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 매일(기본 04:00 KST) 한 번 도는 데이터 정리 — 한 잠금 안에서 둘을 차례로 한다.
 *   1. activity_logs — 보관 기간이 지난 행을 5,000건씩 지운다(한 번에 오래 잠그지 않게). 이벤트 앞부분(LIKE 'auth.%' …)마다 따로 —
 *      (event, occurred_at) 인덱스를 탄다.
 *   2. chatbot_turns(V19) — 90일 지난 턴의 질문 · 답 글만 빈 글로 바꾼다. 행과 숫자 칸(시간 · 갈래 · 걸린 시간)은 남긴다 — Grafana 가 읽는다.
 *      5,000건씩, created_at 색인을 탄다. 이미 비운 행(질문이 빈 글)은 다시 건드리지 않는다. 챗봇은 빈 질문을 기록하지 않으므로
 *      (api/ChatbotTurnController 가 400) 질문이 빈 글이면 이 정리가 비운 것이다 — 관리자 화면이 이것으로 「90일이 지나 지웠어요」를 띄운다.
 *
 * 잠금: MySQL GET_LOCK — 웹 Pod 가 둘(replicas 2)이라 @Scheduled 가 Pod 마다 같은 시각에 깬다. 먼저 잡은 Pod 만 정리하고,
 *   뒤에 온 Pod 는 기다리지 않고 넘어간다(GET_LOCK(…, 0)). 요약 배치(summary/SummaryBatch)와 같은 방식이다(2026-11-17 사용자 —
 *   ShedLock 은 테이블(스키마 변경)이 필요해 쓰지 않았다). 앞 Pod 가 아주 빨리 끝나면 뒤 Pod 가 그 뒤에 한 번 더 돌 수 있지만
 *   지우기 · 비우기는 두 번 해도 결과가 같다. 잠금은 연결에 붙어 있어 Pod 가 죽으면 MySQL 이 푼다.
 * 끝나면 지운 수 · 비운 수 · 남은 행 수를 로그 한 줄로, 남은 activity_logs 가 경고선을 넘으면 WARN — Loki 를 붙이면 이 줄에 경보를 건다.
 */
@Component
@Profile("!batch")   // 요약 CronJob(batch) 안에서는 돌지 않는다 — 정리는 웹 Pod 가 한다
class ActivityCleanup {

	private static final Logger log = LoggerFactory.getLogger(ActivityCleanup.class);
	static final String LOCK = "runshoes.activity_cleanup";
	private static final List<String> AUTH = List.of("auth.%", "user.%");
	// admin.% — 관리자 마이페이지의 행동(리뷰 숨기기 · 되살리기 · 영구 삭제 · 인증 · 로그인 잠금 풀기 · 용어 추가 · 챗봇 문의 처리, 2026-11-14).
	//   여기 없으면 지워지지 않고 쌓인다. 잠금 풀기는 15분만 의미가 있어 180일로 충분하다
	private static final List<String> OTHER = List.of("review.%", "like.%", "review_like.%", "shoe.%", "compare.%", "admin.%");
	static final int BATCH = 5000;

	private final DataSource dataSource;
	private final JdbcTemplate jdbc;
	private final ActivityProperties props;

	ActivityCleanup(DataSource dataSource, JdbcTemplate jdbc, ActivityProperties props) {
		this.dataSource = dataSource;
		this.jdbc = jdbc;
		this.props = props;
	}

	@Scheduled(cron = "${app.activity.cleanup-cron}", zone = "Asia/Seoul")
	void run() {
		try {
			if (!locked()) {
				log.info("다른 Pod 가 정리하고 있다(GET_LOCK {}) — 이번에는 넘어간다", LOCK);
			}
		} catch (Exception e) {
			log.error("데이터 정리를 하지 못했다", e);
		}
	}

	/** 잠금을 잡으면 정리하고 true, 다른 Pod 가 쥐고 있으면 아무것도 하지 않고 false */
	boolean locked() throws Exception {
		// GET_LOCK 은 연결(세션)에 붙는다 — 정리 내내 이 연결 하나를 쥐고 있다가 같은 연결로 놓는다
		try (Connection lockConn = dataSource.getConnection(); Statement st = lockConn.createStatement()) {
			int got;
			try (ResultSet rs = st.executeQuery("SELECT GET_LOCK('" + LOCK + "', 0)")) {
				rs.next();
				got = rs.getInt(1);
			}
			if (got != 1) return false;
			try {
				work();
				return true;
			} finally {
				st.executeQuery("SELECT RELEASE_LOCK('" + LOCK + "')").close();
			}
		}
	}

	void work() {
		long deleted = purge(AUTH, props.retentionAuth()) + purge(OTHER, props.retentionOther());
		long cleared = clearChatbotText();
		long rows = jdbc.queryForObject("SELECT COUNT(*) FROM activity_logs", Long.class);
		if (rows > props.warnRows()) {
			log.warn("activity_logs 가 커졌다 — {}행(경고선 {}). 지난 정리에서 {}행 지움. 챗봇 질문 · 답 {}턴 비움. docs/04_auth.md",
					rows, props.warnRows(), deleted, cleared);
		} else {
			log.info("데이터 정리 — activity_logs {}행 지움, {}행 남음 · chatbot_turns 질문 · 답 {}턴 비움", deleted, rows, cleared);
		}
	}

	private long purge(List<String> prefixes, java.time.Duration keep) {
		Timestamp before = Timestamp.valueOf(ActivityLogger.now().minus(keep));
		long total = 0;
		for (String p : prefixes) {
			int n;
			do {
				n = jdbc.update("DELETE FROM activity_logs WHERE event LIKE ? AND occurred_at < ? LIMIT " + BATCH, p, before);
				total += n;
			} while (n == BATCH);
		}
		return total;
	}

	/** 90일 지난 턴의 질문 · 답을 빈 글로 — 행은 지우지 않는다 */
	long clearChatbotText() {
		Timestamp before = Timestamp.valueOf(ActivityLogger.now().minus(props.retentionChatbotText()));
		long total = 0;
		int n;
		do {
			n = jdbc.update("UPDATE chatbot_turns SET question = '', answer = '' WHERE created_at < ? AND question <> '' LIMIT " + BATCH, before);
			total += n;
		} while (n == BATCH);
		return total;
	}
}
