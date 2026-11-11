package com.kopo17.runshoes.compare;

/**
 * 값 뒤 조사를 받침으로 고른다(작업 3-3, 2026-11-11 사용자) — "발볼은 보통로" 같은 틀을 막는다.
 * 받침 판단은 화면의 src/utils/compare.ts hasJong 과 같다: 한글은 글자로, 숫자 · 영문은 읽는 소리로 어림.
 * 기준 사본 scripts/parity/reference/recommend.mjs 의 jong · josa 와 같아야 한다(check.mjs).
 */
final class Josa {

	private Josa() {}

	private static final int NONE = 0, RIEUL = 8, OTHER = 1;

	/** 끝 글자의 받침 — 0 없음, 8 ㄹ, 그 밖은 받침 있음 */
	static int jong(String word) {
		String w = word.strip();
		if (w.isEmpty()) return NONE;
		char c = w.charAt(w.length() - 1);
		if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28;
		if (c >= '0' && c <= '9') return "178".indexOf(c) >= 0 ? RIEUL : "036".indexOf(c) >= 0 ? OTHER : NONE;   // 영 일 삼 육 칠 팔 — 이 사 오 구는 받침 없음
		char l = Character.toLowerCase(c);
		return l == 'l' || l == 'r' ? RIEUL : l == 'm' || l == 'n' ? OTHER : NONE;
	}

	/** 받침 있으면 withJong, 없으면 without */
	static String of(String word, String withJong, String without) {
		return word + (jong(word) != NONE ? withJong : without);
	}

	/** 으로/로 — ㄹ 받침도 "로" */
	static String euro(String word) {
		int j = jong(word);
		return word + (j != NONE && j != RIEUL ? "으로" : "로");
	}
}
