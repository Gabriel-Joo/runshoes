package com.kopo17.runshoes.api;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;

/** 회원 목록 가입 연도(2026-11-15) — 한국 연도를 UTC 경계로. DB 는 UTC 라 1월 1일 00:00 KST 는 전해 12월 31일 15:00 */
class AdminPageTest {

	@Test
	void yearIsKstBoundaryInUtc() {
		assertArrayEquals(new LocalDateTime[] { LocalDateTime.of(2024, 12, 31, 15, 0), LocalDateTime.of(2025, 12, 31, 15, 0) },
				AdminPage.yearKst("2025"));
		assertArrayEquals(AdminPage.yearKst("2025"), AdminPage.yearKst(" 2025 "));
	}

	@Test
	void emptyYearMeansNoFilter() {
		assertNull(AdminPage.yearKst(null));
		assertNull(AdminPage.yearKst(""));
	}

	@Test
	void badYearIs400() {
		assertThrows(ApiException.class, () -> AdminPage.yearKst("abc"));
		assertThrows(ApiException.class, () -> AdminPage.yearKst("1999"));
		assertThrows(ApiException.class, () -> AdminPage.yearKst("2101"));
	}
}
