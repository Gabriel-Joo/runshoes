package com.kopo17.runshoes.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;

/** 관리 목록의 쪽 나누기 · 한국 날짜 필터 · LIKE 글(api/AdminPage) */
class AdminPageTest {

	@Test
	void 쪽은_비면_1쪽_20건_범위_밖은_400() {
		AdminPage p = AdminPage.of(null, "");
		assertEquals(1, p.page());
		assertEquals(20, p.size());
		assertEquals(40, AdminPage.of("3", "20").offset());
		assertThrows(ApiException.class, () -> AdminPage.of("0", null));
		assertThrows(ApiException.class, () -> AdminPage.of("1", "101"));
		assertThrows(ApiException.class, () -> AdminPage.of("x", null));
	}

	@Test
	void 날짜는_한국_날짜의_하루를_UTC_로() {
		// 2026-11-14 00:00 KST = 2026-11-13 15:00 UTC, 끝은 다음 날 00:00 KST(미만)
		assertEquals(LocalDateTime.of(2026, 11, 13, 15, 0), AdminPage.fromKst("2026-11-14"));
		assertEquals(LocalDateTime.of(2026, 11, 14, 15, 0), AdminPage.toKstExclusive("2026-11-14"));
		assertNull(AdminPage.fromKst(" "));
		assertThrows(ApiException.class, () -> AdminPage.fromKst("11/14"));
	}

	@Test
	void LIKE_글은_와일드카드를_글자로() {
		assertEquals("%50\\%\\_a\\\\%", AdminPage.like(" 50%_a\\ "));
		assertNull(AdminPage.like(""));
	}

	@Test
	void 필터_id_는_양의_정수만() {
		assertEquals(8, AdminPage.id("shoeId", "8"));
		assertThrows(ApiException.class, () -> AdminPage.id("shoeId", "0"));
		assertThrows(ApiException.class, () -> AdminPage.id("shoeId", "a"));
	}
}
