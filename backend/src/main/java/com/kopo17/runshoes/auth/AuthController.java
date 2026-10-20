package com.kopo17.runshoes.auth;

import com.kopo17.runshoes.domain.User;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * /api/auth — 가입 · 로그인 · refresh · 로그아웃. json-server 계약 밖(docs/AUTH_DESIGN.md).
 * 응답: {accessToken, tokenType, expiresIn, user} + refresh 쿠키(HttpOnly · Secure · SameSite=Strict · Path=/api/auth).
 * CSRF: 쿠키가 붙는 곳은 여기뿐 — POST 는 Origin 이 오면 같은 호스트여야 한다(Sec-Fetch-Site: cross-site 도 거절). CORS 는 ApiHeadersFilter 가 주지 않는다.
 */
@RestController
@RequestMapping("/api/auth")
class AuthController {

	static final String COOKIE = "runshoes_refresh";

	private final AuthService auth;
	private final TokenService tokens;
	private final AuthProperties props;

	AuthController(AuthService auth, TokenService tokens, AuthProperties props) {
		this.auth = auth;
		this.tokens = tokens;
		this.props = props;
	}

	record SignupBody(String email, String password, String nickname) {}

	record LoginBody(String email, String password) {}

	@PostMapping("/signup")
	ResponseEntity<Object> signup(@RequestBody SignupBody b, HttpServletRequest req) {
		sameOrigin(req);
		return session(HttpStatus.CREATED, auth.signup(b.email(), b.password(), b.nickname(), RequestInfo.of(req)), req);
	}

	@PostMapping("/login")
	ResponseEntity<Object> login(@RequestBody LoginBody b, HttpServletRequest req) {
		sameOrigin(req);
		return session(HttpStatus.OK, auth.login(b.email(), b.password(), RequestInfo.of(req)), req);
	}

	/** 실패하면 쿠키도 지운다 — 화면은 로그인 안 한 상태로 */
	@PostMapping("/refresh")
	ResponseEntity<Object> refresh(HttpServletRequest req) {
		sameOrigin(req);
		try {
			return session(HttpStatus.OK, auth.refresh(cookie(req), RequestInfo.of(req)), req);
		} catch (AuthException e) {
			Map<String, Object> err = new LinkedHashMap<>();
			err.put("code", e.code);
			err.put("message", e.getMessage());
			return ResponseEntity.status(e.status).header(HttpHeaders.SET_COOKIE, clear(req).toString()).body(Map.of("error", err));
		}
	}

	@PostMapping("/logout")
	ResponseEntity<Void> logout(HttpServletRequest req) {
		sameOrigin(req);
		auth.logout(cookie(req));
		return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, clear(req).toString()).build();
	}

	/** 가입 화면의 미리 확인 — 형식이 틀리면 400(메시지), 쓰는 중이면 409. 최종 판정은 가입할 때 */
	@GetMapping("/nickname-available")
	Map<String, Object> nicknameAvailable(@RequestParam(required = false) String nickname) {
		auth.checkNicknameAvailable(nickname);
		return Map.of("available", true);
	}

	static Map<String, Object> userDoc(User u) {
		Map<String, Object> d = new LinkedHashMap<>();
		d.put("id", u.getId());
		d.put("email", u.getEmail());
		d.put("nickname", u.getNickname());
		d.put("role", u.getRole());
		return d;
	}

	private ResponseEntity<Object> session(HttpStatus status, AuthService.Session s, HttpServletRequest req) {
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("accessToken", s.accessToken());
		body.put("tokenType", "Bearer");
		body.put("expiresIn", tokens.accessTtlSeconds());
		body.put("user", userDoc(s.user()));
		ResponseCookie c = base(req, s.refreshToken()).maxAge(props.refreshTtl()).build();
		return ResponseEntity.status(status).header(HttpHeaders.SET_COOKIE, c.toString()).body(body);
	}

	private ResponseCookie clear(HttpServletRequest req) {
		return base(req, "").maxAge(0).build();
	}

	private ResponseCookie.ResponseCookieBuilder base(HttpServletRequest req, String value) {
		return ResponseCookie.from(COOKIE, value).httpOnly(true).secure(props.cookieSecure()).sameSite("Strict")
				.path(req.getContextPath() + "/api/auth");
	}

	private static String cookie(HttpServletRequest req) {
		if (req.getCookies() == null) return null;
		for (Cookie c : req.getCookies()) if (COOKIE.equals(c.getName())) return c.getValue();
		return null;
	}

	/** Origin 이 없으면(curl · 같은 출처의 일부 요청) 통과. 있으면 Host 와 같아야 한다 */
	private static void sameOrigin(HttpServletRequest req) {
		if ("cross-site".equals(req.getHeader("Sec-Fetch-Site"))) throw forbidden();
		String origin = req.getHeader("Origin");
		if (origin == null) return;
		String host = req.getHeader("Host");
		String authority;
		try {
			authority = URI.create(origin).getAuthority();
		} catch (IllegalArgumentException e) {
			throw forbidden();
		}
		if (host == null || authority == null || !authority.equalsIgnoreCase(host)) throw forbidden();
	}

	private static AuthException forbidden() {
		return AuthException.forbidden("CROSS_ORIGIN", "다른 사이트에서 온 요청은 받지 않아요.");
	}
}
