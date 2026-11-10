package com.kopo17.runshoes.summary;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.kopo17.runshoes.summary.StaleRule.Action;
import com.kopo17.runshoes.summary.StaleRule.Row;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;

/** 요약 재생성 조건(docs/09_chatbot_rag.md 5절) — 리뷰 수 ±10% · 평균 ±0.3 · 3건 · 30일 */
class StaleRuleTest {

	static final LocalDateTime NOW = LocalDateTime.of(2026, 11, 10, 0, 0);

	static Row made(int count, double avg) {
		return new Row(false, count, avg, NOW.minusDays(1));
	}

	static Action judge(Row row, int count, double avg) {
		return StaleRule.judge(row, count, avg, NOW).action();
	}

	@Test
	void 리뷰_1건_추가는_많은_신발에서_stale_아님() {
		assertEquals(Action.NONE, judge(made(38, 4.0), 39, 4.0));     // +2.6%
		assertEquals(Action.NONE, judge(made(10, 4.0), 10, 4.0));
	}

	@Test
	void 리뷰_수_10퍼센트_변화는_늘거나_줄거나_stale() {
		assertEquals(Action.MARK_STALE, judge(made(10, 4.0), 11, 4.0));   // +10% 경계 포함
		assertEquals(Action.MARK_STALE, judge(made(10, 4.0), 9, 4.0));    // −10%
		assertEquals(Action.NONE, judge(made(11, 4.0), 12, 4.0));         // +9.09%
		assertEquals(Action.MARK_STALE, judge(made(4, 4.0), 7, 4.0));     // 4건에 3건 — 내용이 달라진다
	}

	@Test
	void 평균_별점_0점3_이상_움직이면_stale() {
		assertEquals(Action.MARK_STALE, judge(made(40, 4.0), 40, 4.3));   // 경계 포함(부동소수)
		assertEquals(Action.MARK_STALE, judge(made(40, 4.3), 40, 4.0));
		assertEquals(Action.NONE, judge(made(40, 4.0), 40, 4.29));
		assertEquals(Action.MARK_STALE, judge(made(40, 4.1), 40, 4.4));   // 4.4 − 4.1 = 0.30000000000000027 · 반대쪽 오차도
		assertEquals(Action.MARK_STALE, judge(made(40, 4.0), 40, 3.7));   // 4.0 − 3.7 = 0.2999999999999998
	}

	@Test
	void 처음_3건이면_행을_만들고_3건_미만이면_지운다() {
		assertEquals(Action.NONE, judge(null, 2, 5.0));
		assertEquals(Action.CREATE, judge(null, 3, 5.0));
		assertEquals(Action.DELETE, judge(made(3, 4.0), 2, 4.0));
		assertEquals(Action.DELETE, judge(new Row(true, null, null, null), 0, 0));
	}

	@Test
	void 만든_지_30일이면_stale() {
		assertEquals(Action.MARK_STALE, StaleRule.judge(new Row(false, 10, 4.0, NOW.minusDays(30)), 10, 4.0, NOW).action());
		assertEquals(Action.NONE, StaleRule.judge(new Row(false, 10, 4.0, NOW.minusDays(29)), 10, 4.0, NOW).action());
	}

	@Test
	void 이미_stale_이거나_아직_만들지_않은_행() {
		assertEquals(Action.NONE, judge(new Row(true, 10, 4.0, NOW), 20, 1.0));          // 다시 세우지 않는다
		assertEquals(Action.NONE, judge(new Row(true, null, null, null), 5, 4.0));        // 아직 만들지 않은 행(V14 가 넣은 것)
		assertEquals(Action.MARK_STALE, judge(new Row(false, null, null, null), 5, 4.0)); // 기록 없이 stale 이 꺼진 행
	}
}
