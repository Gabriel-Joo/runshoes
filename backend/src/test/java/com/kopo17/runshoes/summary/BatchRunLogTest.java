package com.kopo17.runshoes.summary;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.net.SocketTimeoutException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.support.KeyHolder;

/** 요약 배치 실행 기록(V20) — 기록이 실패해도 배치로 예외가 새지 않는다(배치는 끝까지 돈다) */
class BatchRunLogTest {

	/** DB 가 꺼졌다 — 모든 쓰기가 실패한다 */
	static class DeadJdbc extends JdbcTemplate {
		final List<String> tried = new ArrayList<>();

		@Override
		public int update(PreparedStatementCreator psc, KeyHolder keys) {
			tried.add("start");
			throw new DataAccessResourceFailureException("DB 꺼짐");
		}

		@Override
		public int update(String sql, Object... args) {
			tried.add(sql.strip().split("\\s+")[0]);
			throw new DataAccessResourceFailureException("DB 꺼짐");
		}
	}

	@Test
	void 쓰기가_실패해도_던지지_않는다() {
		DeadJdbc jdbc = new DeadJdbc();
		BatchRunLog runs = new BatchRunLog(jdbc);
		Long id = assertDoesNotThrow(() -> runs.start(LocalDateTime.now()));
		assertNull(id);
		// 시작 줄이 없으면 실패 줄 · 끝 줄은 쓰지 않는다
		assertDoesNotThrow(() -> runs.failure(id, 7L, new RuntimeException("x")));
		assertDoesNotThrow(() -> runs.finish(id, "ran", new SummaryBatch.Result(true, 1, 1, 0, 0, 0), 10, null));
		assertEquals(List.of("start"), jdbc.tried);
		// 시작 줄은 있는데 그 뒤 DB 가 꺼졌다
		assertDoesNotThrow(() -> runs.failure(5L, 7L, new RuntimeException("x")));
		assertDoesNotThrow(() -> runs.finish(5L, "ran", new SummaryBatch.Result(true, 1, 0, 1, 0, 0), 10, null));
		assertEquals(List.of("start", "INSERT", "UPDATE"), jdbc.tried);
	}

	@Test
	void 까닭은_예외_이름과_메시지() {
		assertEquals("SocketTimeoutException: Read timed out", BatchRunLog.reason(new SocketTimeoutException("Read timed out")));
		assertEquals("IllegalStateException", BatchRunLog.reason(new IllegalStateException()));
		assertEquals("알 수 없음", BatchRunLog.reason(null));
	}
}
