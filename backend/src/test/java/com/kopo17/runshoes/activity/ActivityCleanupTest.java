package com.kopo17.runshoes.activity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

/** 데이터 정리(ActivityCleanup) — 잠금을 못 잡으면 아무것도 하지 않는다, 챗봇 글은 행을 지우지 않고 비운다 */
class ActivityCleanupTest {

	static final ActivityProperties PROPS = new ActivityProperties(Duration.ofDays(90), Duration.ofDays(180), Duration.ofDays(90), "-", 500_000);

	/** 쓰기 SQL 을 남기는 JdbcTemplate — UPDATE chatbot_turns 는 처음 한 번만 BATCH 건, 그다음은 3건 */
	static class RecordingJdbc extends JdbcTemplate {
		final List<String> sql = new ArrayList<>();
		int chatbotCalls;

		@Override
		public int update(String s, Object... args) {
			sql.add(s);
			if (s.startsWith("UPDATE chatbot_turns")) return chatbotCalls++ == 0 ? ActivityCleanup.BATCH : 3;
			return 0;
		}

		@Override
		public <T> T queryForObject(String s, Class<T> type) {
			return type.cast(0L);
		}
	}

	/** GET_LOCK 이 got 을 돌려주는 DataSource */
	static DataSource lockReturning(int got) throws Exception {
		DataSource ds = mock(DataSource.class);
		Connection conn = mock(Connection.class);
		Statement st = mock(Statement.class);
		ResultSet rs = mock(ResultSet.class);
		when(ds.getConnection()).thenReturn(conn);
		when(conn.createStatement()).thenReturn(st);
		when(st.executeQuery(anyString())).thenReturn(rs);
		when(rs.next()).thenReturn(true);
		when(rs.getInt(1)).thenReturn(got);
		return ds;
	}

	@Test
	void 잠금을_못_잡으면_아무것도_하지_않는다() throws Exception {
		RecordingJdbc jdbc = new RecordingJdbc();
		DataSource ds = lockReturning(0);
		assertFalse(new ActivityCleanup(ds, jdbc, PROPS).locked());
		assertEquals(List.of(), jdbc.sql);
		verify(ds.getConnection().createStatement(), never()).executeQuery("SELECT RELEASE_LOCK('" + ActivityCleanup.LOCK + "')");
	}

	@Test
	void 잠금을_잡으면_정리하고_놓는다() throws Exception {
		RecordingJdbc jdbc = new RecordingJdbc();
		DataSource ds = lockReturning(1);
		assertTrue(new ActivityCleanup(ds, jdbc, PROPS).locked());
		assertTrue(jdbc.sql.stream().anyMatch(s -> s.startsWith("DELETE FROM activity_logs")));
		assertTrue(jdbc.sql.stream().anyMatch(s -> s.startsWith("UPDATE chatbot_turns")));
		verify(ds.getConnection().createStatement()).executeQuery("SELECT RELEASE_LOCK('" + ActivityCleanup.LOCK + "')");
	}

	@Test
	void 챗봇_글은_행을_지우지_않고_비운다() throws Exception {
		RecordingJdbc jdbc = new RecordingJdbc();
		long n = new ActivityCleanup(lockReturning(1), jdbc, PROPS).clearChatbotText();
		assertEquals(ActivityCleanup.BATCH + 3, n);                         // BATCH 건이면 한 번 더, 덜 나오면 멈춘다
		assertEquals(2, jdbc.sql.size());
		for (String s : jdbc.sql) {
			assertTrue(s.startsWith("UPDATE chatbot_turns SET question = '', answer = ''"), s);   // DELETE 가 아니다 — 숫자 칸은 남는다
			assertTrue(s.contains("question <> ''"), s);                  // 이미 비운 행은 다시 건드리지 않는다
		}
	}
}
