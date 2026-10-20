package com.kopo17.runshoes.auth;

import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** /api/auth · /api/me 의 오류 본문 — json-server 계약 밖이라 {} 가 아니라 화면이 쓸 수 있는 모양 */
@RestControllerAdvice(assignableTypes = {AuthController.class, MeController.class})
class AuthErrorHandler {

	private static final Logger log = LoggerFactory.getLogger(AuthErrorHandler.class);

	/** 429 는 Retry-After 헤더와 본문 retryAfter(초) — 화면이 남은 시간 동안 버튼을 끈다 */
	@ExceptionHandler(AuthException.class)
	ResponseEntity<Object> auth(AuthException e) {
		if (e.retryAfter == null) return body(e.status, e.code, e.field, e.getMessage());
		Map<String, Object> err = new LinkedHashMap<>();
		err.put("code", e.code);
		err.put("message", e.getMessage());
		err.put("retryAfter", e.retryAfter);
		return ResponseEntity.status(e.status).header("Retry-After", String.valueOf(e.retryAfter)).body(Map.of("error", err));
	}

	@ExceptionHandler(HttpMessageNotReadableException.class)
	ResponseEntity<Object> unreadable(HttpMessageNotReadableException e) {
		return body(HttpStatus.BAD_REQUEST, "VALIDATION", null, "요청을 읽을 수 없어요.");
	}

	@ExceptionHandler(Exception.class)
	ResponseEntity<Object> other(Exception e) {
		log.warn("auth 500", e);
		return body(HttpStatus.INTERNAL_SERVER_ERROR, "SERVER_ERROR", null, "잠시 뒤 다시 해 주세요.");
	}

	private static ResponseEntity<Object> body(HttpStatus status, String code, String field, String message) {
		Map<String, Object> err = new LinkedHashMap<>();
		err.put("code", code);
		if (field != null) err.put("field", field);
		err.put("message", message);
		return ResponseEntity.status(status).body(Map.of("error", err));
	}
}
