package com.kopo17.runshoes.api;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * 요청한 사람 — access token 의 sub · role. 로그인하지 않았으면 ANONYMOUS.
 * 쓰기의 401 은 SecurityConfig 가 먼저 막는다(대상이 있는지 보기 전에). 컬렉션은 그 뒤 404 → 403 순으로 본다(docs/AUTH_DESIGN.md 2절).
 * 데모 관리자(DEMO_ADMIN, V7)는 관리 화면을 보기만 — 신발 쓰기 · 리뷰 · 찜은 403 {code:"demo_admin"}(docs/ADMIN_DEMO_DESIGN.md 8.2).
 */
record Viewer(Long userId, String role) {

	static final Viewer ANONYMOUS = new Viewer(null, null);

	static Viewer current() {
		Authentication a = SecurityContextHolder.getContext().getAuthentication();
		if (a instanceof JwtAuthenticationToken t) {
			Jwt jwt = t.getToken();
			return new Viewer(Long.parseLong(jwt.getSubject()), jwt.getClaimAsString("role"));
		}
		return ANONYMOUS;
	}

	boolean admin() {
		return "ADMIN".equals(role);
	}

	boolean demoAdmin() {
		return "DEMO_ADMIN".equals(role);
	}

	boolean loggedIn() {
		return userId != null;
	}

	long requireUser() {
		if (userId == null) throw ApiException.unauthorized();
		return userId;
	}

	/** 리뷰 · 찜 · 공감 — 로그인한 사람, 데모 관리자는 빼고 */
	long requireWriter() {
		long id = requireUser();
		if (demoAdmin()) throw ApiException.demoAdmin();
		return id;
	}

	void requireAdmin() {
		requireUser();
		if (demoAdmin()) throw ApiException.demoAdmin();
		if (!admin()) throw ApiException.forbidden("admin 만");
	}

	/** 관리 화면의 읽기(숨긴 신발 목록) — admin 과 데모 관리자 */
	void requireAdminView() {
		requireUser();
		if (!admin() && !demoAdmin()) throw ApiException.forbidden("admin 만");
	}

	boolean owns(Long ownerId) {
		return userId != null && userId.equals(ownerId);
	}
}
