package com.kopo17.runshoes.api;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * 요청한 사람 — access token 의 sub · role. 로그인하지 않았으면 ANONYMOUS.
 * 쓰기의 401 은 SecurityConfig 가 먼저 막는다(대상이 있는지 보기 전에). 컬렉션은 그 뒤 404 → 403 순으로 본다(docs/AUTH_DESIGN.md 2절).
 */
record Viewer(Long userId, boolean admin) {

	static final Viewer ANONYMOUS = new Viewer(null, false);

	static Viewer current() {
		Authentication a = SecurityContextHolder.getContext().getAuthentication();
		if (a instanceof JwtAuthenticationToken t) {
			Jwt jwt = t.getToken();
			return new Viewer(Long.parseLong(jwt.getSubject()), "ADMIN".equals(jwt.getClaimAsString("role")));
		}
		return ANONYMOUS;
	}

	boolean loggedIn() {
		return userId != null;
	}

	long requireUser() {
		if (userId == null) throw ApiException.unauthorized();
		return userId;
	}

	void requireAdmin() {
		requireUser();
		if (!admin) throw ApiException.forbidden("admin 만");
	}

	boolean owns(Long ownerId) {
		return userId != null && userId.equals(ownerId);
	}
}
