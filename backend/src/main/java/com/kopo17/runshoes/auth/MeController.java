package com.kopo17.runshoes.auth;

import jakarta.servlet.http.HttpServletRequest;
import com.kopo17.runshoes.domain.User;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * /api/me — 로그인한 나(Bearer). 회원 정보 수정 화면과 챗봇(같은 Pod 에서 토큰을 확인)이 쓴다.
 * 이메일은 바꾸지 않는다. 닉네임과 비밀번호는 따로. DELETE 는 탈퇴(V9).
 */
@RestController
@RequestMapping("/api/me")
class MeController {

	private final AuthService auth;

	MeController(AuthService auth) {
		this.auth = auth;
	}

	record NicknameBody(String nickname) {}

	record PasswordBody(String currentPassword, String newPassword) {}

	/** 마이페이지의 가입일 — 로그인 응답(userDoc)에는 넣지 않고 여기에만 */
	@GetMapping
	Map<String, Object> me(@AuthenticationPrincipal Jwt jwt) {
		User u = auth.user(userId(jwt));
		Map<String, Object> d = new LinkedHashMap<>(AuthController.userDoc(u));
		d.put("createdAt", u.getCreatedAt() == null ? null : u.getCreatedAt().toString());
		return d;
	}

	/** 회원 탈퇴(V9) — 204. 화면은 이어서 로그아웃한다(refresh 쿠키를 지우려고). 체험 · 관리자 계정은 403 */
	@DeleteMapping
	ResponseEntity<Void> withdraw(@AuthenticationPrincipal Jwt jwt) {
		auth.withdraw(userId(jwt));
		return ResponseEntity.noContent().build();
	}

	@PatchMapping("/nickname")
	Map<String, Object> nickname(@AuthenticationPrincipal Jwt jwt, @RequestBody NicknameBody b) {
		return AuthController.userDoc(auth.changeNickname(userId(jwt), b.nickname()));
	}

	@PutMapping("/password")
	ResponseEntity<Void> password(@AuthenticationPrincipal Jwt jwt, @RequestBody PasswordBody b, HttpServletRequest req) {
		auth.changePassword(userId(jwt), b.currentPassword(), b.newPassword(), jwt.getClaimAsString("sid"), RequestInfo.of(req));
		return ResponseEntity.noContent().build();
	}

	static long userId(Jwt jwt) {
		return Long.parseLong(jwt.getSubject());
	}
}
