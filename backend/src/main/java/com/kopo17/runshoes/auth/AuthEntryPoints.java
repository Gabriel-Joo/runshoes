package com.kopo17.runshoes.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

/**
 * 401 · 403 본문 — /api/auth · /api/me 는 화면이 메시지를 쓰는 {error:{code, message}}, 그 밖의 /api 는 json-server 처럼 {}.
 * 만료되거나 틀린 토큰은 GET 이라도 401 — 프런트가 refresh 하고 한 번 다시 보낸다.
 */
@Component
class AuthEntryPoints implements AuthenticationEntryPoint, AccessDeniedHandler {

	@Override
	public void commence(HttpServletRequest req, HttpServletResponse res, AuthenticationException e) throws IOException {
		res.setHeader("WWW-Authenticate", "Bearer");
		write(req, res, HttpServletResponse.SC_UNAUTHORIZED, "UNAUTHORIZED", "로그인이 필요해요.");
	}

	@Override
	public void handle(HttpServletRequest req, HttpServletResponse res, AccessDeniedException e) throws IOException {
		write(req, res, HttpServletResponse.SC_FORBIDDEN, "FORBIDDEN", "권한이 없어요.");
	}

	private static void write(HttpServletRequest req, HttpServletResponse res, int status, String code, String message) throws IOException {
		String path = req.getRequestURI().substring(req.getContextPath().length());
		boolean structured = path.startsWith("/api/auth/") || path.equals("/api/me") || path.startsWith("/api/me/");
		res.setStatus(status);
		res.setContentType(MediaType.APPLICATION_JSON_VALUE);
		res.setCharacterEncoding(StandardCharsets.UTF_8.name());
		res.getWriter().write(structured ? "{\"error\":{\"code\":\"" + code + "\",\"message\":\"" + message + "\"}}" : "{}");
	}
}
