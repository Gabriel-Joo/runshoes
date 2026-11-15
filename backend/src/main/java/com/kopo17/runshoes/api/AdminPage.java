package com.kopo17.runshoes.api;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 관리 화면(마이페이지 관리자 메뉴, 2026-11-14)의 목록 API 가 같이 쓰는 것 — 서버 페이지 나누기 · 날짜 필터 · LIKE 글.
 * json-server 꼴 컬렉션(ListQuery — 전부 읽어 메모리에서 거른다)과 달리 SQL 에서 LIMIT · OFFSET 으로 자른다. 리뷰 1,800건 · 대화 기록은 계속 쌓인다.
 * 응답 {items, total, page, size} — total 은 조건에 맞는 전체 수.
 */
record AdminPage(int page, int size) {

	static final int DEFAULT_SIZE = 20, MAX_SIZE = 100;
	/** 날짜 필터는 한국 날짜로 받는다(화면의 날짜 칸) — DB 는 UTC 라 그날 00:00 KST 를 UTC 로 바꾼다 */
	static final ZoneId KST = ZoneId.of("Asia/Seoul");

	/** ?page=1&size=20 — 비면 기본, 숫자가 아니거나 범위 밖이면 400 */
	static AdminPage of(String page, String size) {
		int p = number("page", page, 1, 1, 1_000_000);
		int s = number("size", size, DEFAULT_SIZE, 1, MAX_SIZE);
		return new AdminPage(p, s);
	}

	int offset() {
		return (page - 1) * size;
	}

	Map<String, Object> body(List<?> items, long total) {
		Map<String, Object> d = new LinkedHashMap<>();
		d.put("items", items);
		d.put("total", total);
		d.put("page", page);
		d.put("size", size);
		return d;
	}

	/** from(포함) — 한국 날짜 YYYY-MM-DD 의 00:00 KST 를 UTC 로. 비면 null */
	static LocalDateTime fromKst(String v) {
		LocalDate d = date("from", v);
		return d == null ? null : d.atStartOfDay(KST).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
	}

	/** to(포함) — 그다음 날 00:00 KST 를 UTC 로(그 시각 미만). 비면 null */
	static LocalDateTime toKstExclusive(String v) {
		LocalDate d = date("to", v);
		return d == null ? null : d.plusDays(1).atStartOfDay(KST).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
	}

	/** LIKE '%…%' 의 글 — % _ \ 를 글자 그대로. 비면 null */
	static String like(String v) {
		if (v == null || v.isBlank()) return null;
		return "%" + v.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
	}

	/** 필터의 id(?shoeId= · ?userId=) — 양의 정수가 아니면 400(경로의 id 는 404 — JsonServerController.id) */
	static long id(String field, String v) {
		try {
			long n = Long.parseLong(v.strip());
			if (n > 0) return n;
		} catch (NumberFormatException ignored) { }
		throw ApiException.invalid(field + " 값은 양의 정수로 적어 주세요.");
	}

	private static LocalDate date(String field, String v) {
		if (v == null || v.isBlank()) return null;
		try {
			return LocalDate.parse(v.strip());
		} catch (DateTimeParseException e) {
			throw ApiException.invalid(field + " 값은 YYYY-MM-DD 로 적어 주세요.");
		}
	}

	private static int number(String field, String v, int fallback, int min, int max) {
		if (v == null || v.isBlank()) return fallback;
		try {
			int n = Integer.parseInt(v.strip());
			if (n < min || n > max) throw ApiException.invalid(field + " 값은 " + min + "~" + max + " 사이로 적어 주세요.");
			return n;
		} catch (NumberFormatException e) {
			throw ApiException.invalid(field + " 값은 숫자로 적어 주세요.");
		}
	}
}
