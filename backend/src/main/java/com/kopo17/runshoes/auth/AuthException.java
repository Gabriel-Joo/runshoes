package com.kopo17.runshoes.auth;

import org.springframework.http.HttpStatus;

/** 인증 API 오류 — 본문 {error:{code, field, message}}(AuthErrorHandler). message 는 화면에 그대로 보여 줄 문장 */
class AuthException extends RuntimeException {

	final HttpStatus status;
	final String code;
	final String field;
	/** 429 일 때만 — 몇 초 뒤 다시(Retry-After) */
	final Long retryAfter;

	AuthException(HttpStatus status, String code, String field, String message) {
		this(status, code, field, message, null);
	}

	private AuthException(HttpStatus status, String code, String field, String message, Long retryAfter) {
		super(message);
		this.status = status;
		this.code = code;
		this.field = field;
		this.retryAfter = retryAfter;
	}

	static AuthException tooMany(long retryAfterSeconds, String message) {
		return new AuthException(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED", null, message, retryAfterSeconds);
	}

	static AuthException invalid(String field, String message) {
		return new AuthException(HttpStatus.BAD_REQUEST, "VALIDATION", field, message);
	}

	static AuthException conflict(String code, String field, String message) {
		return new AuthException(HttpStatus.CONFLICT, code, field, message);
	}

	static AuthException unauthorized(String code, String message) {
		return new AuthException(HttpStatus.UNAUTHORIZED, code, null, message);
	}

	static AuthException forbidden(String code, String message) {
		return new AuthException(HttpStatus.FORBIDDEN, code, null, message);
	}
}
