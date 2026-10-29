package com.kopo17.runshoes.api;

import org.springframework.http.HttpStatus;

/** /api 에서 상태코드만 정해 던진다 — 본문은 언제나 {}(json-server 와 같다, ApiErrorHandler) */
class ApiException extends RuntimeException {

	final HttpStatus status;
	/** 있으면 본문이 {code, message} — 화면이 그 문구를 그대로 띄운다(데모 관리자 · 숨긴 세대). 없으면 {}(json-server) */
	final String code;

	ApiException(HttpStatus status, String message) {
		this(status, null, message);
	}

	private ApiException(HttpStatus status, String code, String message) {
		super(message);
		this.status = status;
		this.code = code;
	}

	static final String DEMO_ADMIN_MESSAGE = "데모 관리자 계정은 할 수 없습니다";

	/** 데모 관리자의 쓰기 · 리뷰 · 찜(V7) */
	static ApiException demoAdmin() {
		return new ApiException(HttpStatus.FORBIDDEN, "demo_admin", DEMO_ADMIN_MESSAGE);
	}

	/** 같은 라인 · 세대 · 성별의 숨긴 신발이 있다(V8) — 새로 넣지 말고 되살린다 */
	static ApiException hiddenGeneration(long hiddenId) {
		return new ApiException(HttpStatus.CONFLICT, "hidden_generation", "숨긴 신발(NO." + hiddenId + ")과 라인 · 세대 · 성별이 같습니다. 숨긴 신발 목록에서 되살려 주세요.");
	}

	/** 스펙 출처 형식(V6) — 관리 폼이 문구를 보여 준다 */
	static ApiException invalid(String message) {
		return new ApiException(HttpStatus.BAD_REQUEST, "invalid", message);
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
