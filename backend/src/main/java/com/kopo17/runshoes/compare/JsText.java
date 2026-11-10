package com.kopo17.runshoes.compare;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Locale;

/**
 * 추천 이유 문장 안의 숫자를 브라우저가 쓰던 모양 그대로 — 이관 전 문장과 글자까지 같아야 한다(scripts/parity).
 * Java 의 Double.toString(40.0) 은 "40.0" 이라 그대로 쓰면 "쿠션 두께는 40.0mm예요"가 된다.
 */
final class JsText {

	private JsText() {}

	/** JS 템플릿 문자열 `${n}` — 정수 값은 ".0" 없이(40), 아니면 가장 짧은 표기(41.5). Java 19+ Double.toString 이 가장 짧은 표기다 */
	static String num(double v) {
		if (v == Math.rint(v) && Math.abs(v) < 1e21) return Long.toString((long) v);
		return Double.toString(v);
	}

	/**
	 * JS n.toLocaleString() 을 ko-KR 로 — 세 자리 쉼표, 소수는 세 자리까지(반올림).
	 * 이관 전에는 브라우저 언어를 따랐다(로케일 미지정) — 서버로 옮기며 한국 표기로 고정(2026-11-10 사용자, 이관으로 달라지는 점).
	 */
	static String locale(double v) {
		DecimalFormat f = new DecimalFormat("#,##0.###", DecimalFormatSymbols.getInstance(Locale.KOREA));
		f.setRoundingMode(RoundingMode.HALF_EVEN);
		return f.format(new BigDecimal(Double.toString(v)));
	}
}
