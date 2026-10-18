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

	static ApiException conflict(String message) {
		return new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, message);   // json-server: Insert failed, duplicate id → 500
	}
}
