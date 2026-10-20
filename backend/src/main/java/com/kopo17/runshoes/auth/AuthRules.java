package com.kopo17.runshoes.auth;

import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 가입 · 로그인 · 회원 정보 수정의 입력 규칙과 메시지(docs/AUTH_DESIGN.md 3절). 프런트도 같은 규칙으로 먼저 본다 — 정답은 여기.
 */
final class AuthRules {

	private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
	private static final Pattern LETTER = Pattern.compile("[A-Za-z]");
	private static final Pattern DIGIT = Pattern.compile("[0-9]");
	private static final Pattern NICK_CHARS = Pattern.compile("^[가-힣A-Za-z0-9]+$");
	private static final Set<String> RESERVED = Set.of("관리자", "운영자", "admin", "runshoes");

	private AuthRules() {}

	/** 앞뒤 공백을 빼고 소문자로 */
	static String email(String raw) {
		String e = raw == null ? "" : raw.strip().toLowerCase(Locale.ROOT);
		if (e.isEmpty()) throw AuthException.invalid("email", "이메일을 입력해 주세요.");
		if (e.length() > 254 || !EMAIL.matcher(e).matches()) throw AuthException.invalid("email", "이메일 형식이 아닙니다.");
		return e;
	}

	/** 8~64자, 영문과 숫자를 각각 하나 이상 */
	static void password(String raw, String field) {
		if (raw == null || raw.length() < 8) throw AuthException.invalid(field, "비밀번호는 8자 이상이어야 합니다.");
		if (raw.length() > 64) throw AuthException.invalid(field, "비밀번호는 64자까지 쓸 수 있어요.");
		if (!LETTER.matcher(raw).find() || !DIGIT.matcher(raw).find()) throw AuthException.invalid(field, "영문과 숫자를 함께 써 주세요.");
	}

	/** 2~12자, 한글(완성형) · 영문 · 숫자. 예약어는 대소문자 없이 */
	static String nickname(String raw) {
		String n = raw == null ? "" : raw.strip();
		if (n.codePointCount(0, n.length()) < 2 || n.codePointCount(0, n.length()) > 12) {
			throw AuthException.invalid("nickname", "닉네임은 2~12자로 써 주세요.");
		}
		if (!NICK_CHARS.matcher(n).matches()) throw AuthException.invalid("nickname", "한글, 영문, 숫자만 쓸 수 있어요.");
		if (RESERVED.contains(n.toLowerCase(Locale.ROOT))) throw AuthException.invalid("nickname", "쓸 수 없는 닉네임입니다.");
		return n;
	}
}
