package com.kopo17.runshoes.summary;

import com.kopo17.runshoes.domain.Review;
import com.kopo17.runshoes.summary.StaleRule.Action;
import com.kopo17.runshoes.summary.SummaryStore.SaveResult;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.List;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 요약 배치 — 하루 한 번 CronJob(batch 프로필, SummaryBatchRunner)이 한 번 돌리고 끝난다(docs/09_chatbot_rag.md 5절).
 *   1. MySQL GET_LOCK — 정기 Job 과 손으로 띄운 Job 이 겹치면 뒤에 온 쪽은 바로 끝낸다(정상 종료 0 — 겹친 것은 오류가 아니다).
 *      concurrencyPolicy Forbid 는 CronJob 이 만든 Job 끼리만 막는다.
 *   2. 보이는 신발 전체를 다시 판단한다 — 30일 조건 · SQL 로 직접 넣은 리뷰는 쓰기 시점 판단을 거치지 않는다.
 *   3. stale 인 신발만 하나씩 차례로 만든다 — Ollama 에 동시에 보내지 않는다. 신발마다 따로 커밋해, 중간에 죽으면 남은 것은 stale 로 다음 회차가 잇는다.
 * 로그: 시작(쓰기 시점에 서 있던 stale · 재판단으로 새로 선 stale · 지운 행) · 10켤레마다 진행 · 끝(성공 · 실패 · 재비교로 다시 stale · 걸린 시간).
 * 실행 기록(V20, BatchRunLog): 실행마다 한 줄(ran · skipped · error, 숫자 · 걸린 시간)과 실패한 켤레마다 한 줄(까닭). 기록이 실패해도 배치는 끝까지 돈다.
 */
@Component
public class SummaryBatch {

	private static final Logger log = LoggerFactory.getLogger(SummaryBatch.class);
	static final String LOCK = "runshoes.summary_batch";
	private static final int PROGRESS_EVERY = 10;

	/** 끝난 결과 — 종료 코드: 실패가 하나라도 있으면 1 */
	public record Result(boolean ran, int target, int ok, int failed, int restaled, int gone) {
		public int exitCode() { return failed > 0 ? 1 : 0; }
	}

	private final DataSource dataSource;
	private final SummaryStore store;
	private final SummaryService summaries;
	private final BatchRunLog runs;

	SummaryBatch(DataSource dataSource, SummaryStore store, SummaryService summaries, BatchRunLog runs) {
		this.dataSource = dataSource;
		this.store = store;
		this.summaries = summaries;
		this.runs = runs;
	}

	/** 실행 기록(V20)을 앞뒤에 남긴다 — 기록이 실패해도 배치는 그대로(BatchRunLog 는 던지지 않는다) */
	public Result run() throws Exception {
		long t0 = System.nanoTime();
		Long runId = runs.start(BatchRunLog.now());
		try {
			Result r = locked(runId);
			runs.finish(runId, r.ran() ? "ran" : "skipped", r, (System.nanoTime() - t0) / 1_000_000L, null);
			return r;
		} catch (Exception | Error e) {
			runs.finish(runId, "error", null, (System.nanoTime() - t0) / 1_000_000L, BatchRunLog.reason(e));
			throw e;
		}
	}

	private Result locked(Long runId) throws Exception {
		// GET_LOCK 은 연결(세션)에 붙는다 — 배치 내내 이 연결 하나를 쥐고 있다가 같은 연결로 놓는다. 프로세스가 죽으면 연결이 끊겨 MySQL 이 푼다
		try (Connection lockConn = dataSource.getConnection(); Statement st = lockConn.createStatement()) {
			int got;
			try (ResultSet rs = st.executeQuery("SELECT GET_LOCK('" + LOCK + "', 0)")) {
				rs.next();
				got = rs.getInt(1);
			}
			if (got != 1) {
				log.info("[summary-batch] 다른 요약 배치가 돌고 있다(GET_LOCK {}) — 이번 실행은 하지 않고 끝낸다", LOCK);
				return new Result(false, 0, 0, 0, 0, 0);
			}
			try {
				return work(runId);
			} finally {
				st.executeQuery("SELECT RELEASE_LOCK('" + LOCK + "')").close();
			}
		}
	}

	private Result work(Long runId) {
		long started = System.nanoTime();

		// 2. 전체 재판단 — 이미 서 있던 것과 새로 선 것을 나눠 센다(새로 선 것이 계속 많으면 쓰기 시점 판단이 빠진 경로가 있다)
		int staleBefore = store.staleShoeIds().size();
		int created = 0, marked = 0, deleted = 0;
		for (long id : store.visibleShoeIds()) {
			Action a = store.judge(id).action();
			if (a == Action.CREATE) created++;
			else if (a == Action.MARK_STALE) marked++;
			else if (a == Action.DELETE) deleted++;
		}
		List<Long> ids = store.staleShoeIds();
		log.info("[summary-batch] 시작 — 만들 신발 {}켤레: 쓰기 시점에 이미 서 있던 stale {} · 재판단으로 새로 선 stale {}(새 행 {} · 조건 {}) · 3건 미만이라 지운 행 {}",
				ids.size(), staleBefore, created + marked, created, marked, deleted);

		// 3. 하나씩 차례로
		int ok = 0, failed = 0, restaled = 0, gone = 0, done = 0;
		for (long id : ids) {
			List<Review> input = summaries.reviewsOf(id);
			if (input.size() < StaleRule.MIN_REVIEWS) {
				store.judge(id);                                   // 그 사이 줄었다 — 행을 지운다
				gone++;
			} else {
				double avg = input.stream().mapToInt(r -> r.getRating() == null ? 0 : r.getRating()).sum() / (double) input.size();
				try {
					SummaryService.Generated g = summaries.generate(input);
					SaveResult r = store.save(id, g.positive(), g.negative(), input.size(), avg);
					if (r == SaveResult.SAVED) ok++;
					else if (r == SaveResult.RESTALED) {
						ok++;
						restaled++;
						log.info("[summary-batch] shoeId={} 저장 직후 재비교로 다시 stale — 만드는 사이 리뷰가 바뀌었다", id);
					} else gone++;
				} catch (Exception e) {
					failed++;
					log.warn("[summary-batch] shoeId={} 실패 — stale 로 남긴다: {}", id, e.getMessage());
					runs.failure(runId, id, e);
				}
			}
			done++;
			if (done % PROGRESS_EVERY == 0 && done < ids.size()) {
				log.info("[summary-batch] 진행 {}/{} — 실패 {} · {}초", done, ids.size(), failed, (System.nanoTime() - started) / 1_000_000_000L);
			}
		}
		long secs = (System.nanoTime() - started) / 1_000_000_000L;
		if (restaled > 0) log.warn("[summary-batch] 재비교로 다시 stale {}건 — 자주 나오면 배치 시각에 리뷰 쓰기가 몰린다", restaled);
		log.info("[summary-batch] 끝 — 대상 {} · 성공 {} · 실패 {} · 재비교로 다시 stale {} · 그 사이 3건 미만 {} · {}분 {}초",
				ids.size(), ok, failed, restaled, gone, secs / 60, secs % 60);
		return new Result(true, ids.size(), ok, failed, restaled, gone);
	}
}
