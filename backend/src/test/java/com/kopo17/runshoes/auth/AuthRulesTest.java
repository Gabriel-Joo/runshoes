package com.kopo17.runshoes.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;

/** 입력 규칙과 메시지 — docs/AUTH_DESIGN.md 3절 표와 같아야 한다 */
class AuthRulesTest {

	private static String message(Executable e) {
		return assertThrows(AuthException.class, e).getMessage();
	}

	@Test
	void 이메일은_소문자로_다듬고_형식을_본다() {
		assertEquals("runner01@runshoes.test", AuthRules.email("  Runner01@RunShoes.TEST "));
		assertEquals("이메일을 입력해 주세요.", message(() -> AuthRules.email("  ")));
		assertEquals("이메일 형식이 아닙니다.", message(() -> AuthRules.email("runner01@runshoes")));
		assertEquals("이메일 형식이 아닙니다.", message(() -> AuthRules.email("a b@c.d")));
	}

	@Test
	void 비밀번호는_8에서_64자_영문과_숫자() {
		AuthRules.password("abcd1234", "password");
		assertEquals("비밀번호는 8자 이상이어야 합니다.", message(() -> AuthRules.password("abc1234", "password")));
		assertEquals("영문과 숫자를 함께 써 주세요.", message(() -> AuthRules.password("abcdefgh", "password")));
		assertEquals("영문과 숫자를 함께 써 주세요.", message(() -> AuthRules.password("한글비밀번호12", "password")));
		assertEquals("비밀번호는 64자까지 쓸 수 있어요.", message(() -> AuthRules.password("a1".repeat(33), "password")));
	}

	@Test
	void 닉네임은_2에서_12자_한글_영문_숫자_예약어_불가() {
		assertEquals("느긋한LSD", AuthRules.nickname(" 느긋한LSD "));
		assertEquals("닉네임은 2~12자로 써 주세요.", message(() -> AuthRules.nickname("가")));
		assertEquals("닉네임은 2~12자로 써 주세요.", message(() -> AuthRules.nickname("가나다라마바사아자차카타파")));
		assertEquals("한글, 영문, 숫자만 쓸 수 있어요.", message(() -> AuthRules.nickname("ㅁㅁㅁ")));     // 자모는 안 된다
		assertEquals("한글, 영문, 숫자만 쓸 수 있어요.", message(() -> AuthRules.nickname("주말 러너")));
		assertEquals("쓸 수 없는 닉네임입니다.", message(() -> AuthRules.nickname("Admin")));
		assertEquals("쓸 수 없는 닉네임입니다.", message(() -> AuthRules.nickname("관리자")));
	}
}
