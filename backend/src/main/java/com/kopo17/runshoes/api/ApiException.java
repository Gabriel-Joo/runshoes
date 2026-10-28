package com.kopo17.runshoes.api;

import org.springframework.http.HttpStatus;

/** /api 에서 상태코드만 정해 던진다 — 본문은 언제나 {}(json-server 와 같다, ApiErrorHandler) */
class ApiException extends RuntimeException {

	final HttpStatus status;

	ApiException(HttpStatus status, String message) {
		super(message);
		this.status = status;
	}

	static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "not found");
	}

	static ApiException badRequest(String message) {
		return new ApiException(HttpStatus.BAD_REQUEST, message);
	}

	static ApiException unauthorized() {
		return new ApiException(HttpStatus.UNAUTHORIZED, "로그인이 필요하다");
	}

	static ApiException forbidden(String message) {
		return new ApiException(HttpStatus.FORBIDDEN, message);
	}

	/** 한 신발에 첫 리뷰 하나(uk_reviews_user_first_shoe) */
	static ApiException reviewExists() {
		return new ApiException(HttpStatus.CONFLICT, "이 신발에는 이미 리뷰를 썼다");
	}

	/** 한 라인 · 세대 · 성별은 한 행(V4 uk_shoes_line_generation_gender) — 새 동작이라 json-server 호환(500)이 아니라 409 */
	static ApiException duplicateGeneration(String message) {
		return new ApiException(HttpStatus.CONFLICT, message);
	}

	static ApiException methodNotAllowed(String message) {
		return new ApiException(HttpStatus.METHOD_NOT_ALLOWED, message);
	}

	static ApiException conflict(String message) {
		return new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, message);   // json-server: Insert failed, duplicate id → 500
	}
}
