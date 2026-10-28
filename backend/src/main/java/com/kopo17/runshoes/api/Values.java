package com.kopo17.runshoes.api;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;

/**
 * JSON 본문 값 → 컬럼 값. json-server 는 받은 값을 그대로 저장하지만 여기는 컬럼에 타입이 있다 —
 * 타입이 다른 값(숫자 칸에 문자열 등)은 400 으로 돌려보낸다. 프런트는 늘 맞는 타입을 보낸다.
 */
final class Values {

	/** createdAt 응답 형식 — 항상 UTC, ms 까지(프런트 toISOString 과 같은 모양) */
	static final DateTimeFormatter ISO_MS = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");

	private Values() {}

	static String str(String field, Object v) {
		if (v == null || v instanceof String) return (String) v;
		throw ApiException.badRequest(field + " 은 문자열이어야 한다");
	}

	static Double dbl(String field, Object v) {
		if (v == null) return null;
		if (v instanceof Number n) return n.doubleValue();
		throw ApiException.badRequest(field + " 은 숫자여야 한다");
	}

	static Integer integer(String field, Object v) {
		if (v == null) return null;
		if (v instanceof Number n && n.doubleValue() == Math.rint(n.doubleValue())) return n.intValue();
		throw ApiException.badRequest(field + " 은 정수여야 한다");
	}

	static Long id(String field, Object v) {
		if (v == null) return null;
		if (v instanceof Number n && n.doubleValue() == Math.rint(n.doubleValue())) return n.longValue();
		throw ApiException.badRequest(field + " 은 정수 id 여야 한다");
	}

	static Boolean bool(String field, Object v) {
		if (v == null || v instanceof Boolean) return (Boolean) v;
		throw ApiException.badRequest(field + " 은 true/false 여야 한다");
	}

	static List<String> strings(String field, Object v) {
		if (v == null) return null;
		if (v instanceof List<?> l && l.stream().allMatch(x -> x instanceof String)) {
			@SuppressWarnings("unchecked") List<String> s = (List<String>) l;
			return List.copyOf(s);
		}
		throw ApiException.badRequest(field + " 은 문자열 배열이어야 한다");
	}

	/** "YYYY-MM-DD" → 날짜(가격 조회일 · V5). 다른 모양은 400 */
	static LocalDate date(String field, Object v) {
		if (v == null) return null;
		if (v instanceof String s && s.matches("\\d{4}-\\d{2}-\\d{2}")) {
			try { return LocalDate.parse(s); } catch (DateTimeParseException e) { /* 아래 400 */ }
		}
		throw ApiException.badRequest(field + " 은 YYYY-MM-DD 날짜여야 한다");
	}

	/** "YYYY-MM-DD"(시드) → 그날 UTC 자정, ISO(오프셋 · Z) → UTC, 오프셋 없는 ISO → UTC 로 읽는다 */
	static LocalDateTime createdAt(Object v) {
		if (v == null) return null;
		if (!(v instanceof String s)) throw ApiException.badRequest("createdAt 은 날짜 문자열이어야 한다");
		try {
			if (s.matches("\\d{4}-\\d{2}-\\d{2}")) return LocalDate.parse(s).atStartOfDay();
			try {
				return OffsetDateTime.parse(s).withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime();
			} catch (DateTimeParseException e) {
				return LocalDateTime.parse(s);
			}
		} catch (DateTimeParseException e) {
			throw ApiException.badRequest("createdAt 을 읽을 수 없다: " + s);
		}
	}

	static String formatCreatedAt(LocalDateTime t) {
		return t == null ? null : ISO_MS.format(t);
	}

	static LocalDateTime nowUtc() {
		return LocalDateTime.ofInstant(Instant.now(), ZoneOffset.UTC);
	}
}
