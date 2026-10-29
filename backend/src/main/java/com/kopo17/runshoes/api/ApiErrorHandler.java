package com.kopo17.runshoes.api;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** /api 오류 본문은 {} — json-server 의 404 · 500 과 같다. 원인은 로그로만. 화면은 상태코드(401 · 403 · 409)로 문구를 고른다.
 *  새 오류(데모 관리자 403 · 숨긴 세대 409 · 스펙 출처 400)만 {code, message} — 화면이 문구를 그대로 띄운다 */
@RestControllerAdvice(assignableTypes = {JsonServerController.class, LikeController.class, AdminController.class})
class ApiErrorHandler {

	private static final Logger log = LoggerFactory.getLogger(ApiErrorHandler.class);

	@ExceptionHandler(ApiException.class)
	ResponseEntity<Object> api(ApiException e) {
		if (e.status != HttpStatus.NOT_FOUND) log.info("api {}: {}", e.status.value(), e.getMessage());
		if (e.code != null) return ResponseEntity.status(e.status).body(Map.of("code", e.code, "message", e.getMessage()));
		return ResponseEntity.status(e.status).body(Map.of());
	}

	@ExceptionHandler(HttpMessageNotReadableException.class)
	ResponseEntity<Object> unreadable(HttpMessageNotReadableException e) {
		log.info("api 400: 본문을 읽을 수 없다 — {}", e.getMostSpecificCause().getMessage());
		return ResponseEntity.badRequest().body(Map.of());
	}

	@ExceptionHandler(Exception.class)
	ResponseEntity<Object> other(Exception e) {
		log.warn("api 500", e);
		return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of());
	}
}
