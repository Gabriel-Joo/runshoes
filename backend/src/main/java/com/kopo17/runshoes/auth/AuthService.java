package com.kopo17.runshoes.auth;

import com.kopo17.runshoes.domain.RefreshToken;
import com.kopo17.runshoes.domain.RefreshTokenRepository;
import com.kopo17.runshoes.domain.ReviewRepository;
import com.kopo17.runshoes.domain.User;
import com.kopo17.runshoes.domain.UserRepository;
import java.time.LocalDateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 가입 · 로그인 · refresh(교체 · 재사용 감지) · 로그아웃 · 닉네임 · 비밀번호.
 * refresh 재사용: 이미 바뀐 토큰이 다시 오면 그 family 를 전부 폐기한다(탈취로 본다).
 *   다만 바뀐 지 10초 안이면 탭 둘이 동시에 refresh 한 것으로 보고 family 에 토큰을 하나 더 준다 — 새로고침 두 번에 로그아웃되지 않게.
 */
@Service
class AuthService {

	private static final Logger log = LoggerFactory.getLogger(AuthService.class);
	private static final long CONCURRENT_REFRESH_SECONDS = 10;

	private final UserRepository users;
	private final RefreshTokenRepository refreshTokens;
	private final ReviewRepository reviews;
	private final PasswordEncoder encoder;
	private final TokenService tokens;
	/** 없는 이메일에도 BCrypt 를 한 번 돌린다 — 응답 시간으로 가입 여부가 드러나지 않게 */
	private final String dummyHash;

	AuthService(UserRepository users, RefreshTokenRepository refreshTokens, ReviewRepository reviews, PasswordEncoder encoder,
			TokenService tokens) {
		this.users = users;
		this.refreshTokens = refreshTokens;
		this.reviews = reviews;
		this.encoder = encoder;
		this.tokens = tokens;
		this.dummyHash = encoder.encode("runshoes-dummy-password-0");
	}

	@Transactional
	Session signup(String rawEmail, String password, String rawNickname, RequestInfo info) {
		String email = AuthRules.email(rawEmail);
		AuthRules.password(password, "password");
		String nickname = AuthRules.nickname(rawNickname);
		if (users.existsByEmail(email)) throw AuthException.conflict("EMAIL_TAKEN", "email", "이미 가입된 이메일입니다.");
		if (users.existsByNickname(nickname)) throw AuthException.conflict("NICKNAME_TAKEN", "nickname", "이미 쓰는 닉네임입니다.");
		User u = new User();
		u.setEmail(email);
		u.setPasswordHash(encoder.encode(password));
		u.setNickname(nickname);
		u.setRole(User.USER);
		u.setCreatedAt(Clock.now());
		u.setUpdatedAt(u.getCreatedAt());
		u.setLastLoginAt(u.getCreatedAt());
		try {
			u = users.saveAndFlush(u);
		} catch (DataIntegrityViolationException e) {        // 같은 순간 같은 이메일 · 닉네임 — UNIQUE 가 막는다
			throw AuthException.conflict("ALREADY_TAKEN", null, "이미 가입된 이메일이나 쓰는 닉네임입니다.");
		}
		return start(u, info);
	}

	@Transactional
	Session login(String rawEmail, String password, RequestInfo info) {
		String email = rawEmail == null ? "" : rawEmail.strip().toLowerCase();
		if (email.isEmpty() || password == null || password.isEmpty()) {
			throw AuthException.invalid(null, "이메일과 비밀번호를 입력해 주세요.");
		}
		User u = users.findByEmail(email).orElse(null);
		String hash = u == null || u.getPasswordHash() == null ? dummyHash : u.getPasswordHash();
		boolean ok = encoder.matches(password, hash) && u != null && u.getPasswordHash() != null;
		if (!ok) throw AuthException.unauthorized("INVALID_CREDENTIALS", "이메일 또는 비밀번호가 맞지 않습니다.");
		u.setLastLoginAt(Clock.now());
		return start(u, info);
	}

	@Transactional(noRollbackFor = AuthException.class)       // 재사용 감지의 family 폐기는 401 을 돌려줘도 남아야 한다
	Session refresh(String raw, RequestInfo info) {
		if (raw == null || raw.isBlank()) throw expired();
		RefreshToken t = refreshTokens.findByTokenHash(TokenService.sha256(raw)).orElseThrow(AuthService::expired);
		LocalDateTime now = Clock.now();
		if (t.getRevokedAt() != null) {
			boolean rotated = t.getReplacedBy() != null;
			boolean concurrent = rotated && t.getRevokedAt().isAfter(now.minusSeconds(CONCURRENT_REFRESH_SECONDS))
					&& refreshTokens.existsByFamilyIdAndRevokedAtIsNull(t.getFamilyId());
			if (!concurrent) {
				if (rotated) {
					int n = refreshTokens.revokeFamily(t.getFamilyId(), now);
					log.warn("refresh 재사용 — user {} family {} 의 토큰 {}개 폐기", t.getUserId(), t.getFamilyId(), n);
				}
				throw expired();
			}
		} else if (t.getExpiresAt().isBefore(now)) {
			throw expired();
		}
		User u = users.findById(t.getUserId()).orElseThrow(AuthService::expired);
		TokenService.Issued next = tokens.issueRefresh(u.getId(), t.getFamilyId(), info);
		if (t.getRevokedAt() == null) {
			t.setRevokedAt(now);
			t.setReplacedBy(next.row().getId());
		}
		return new Session(u, tokens.accessToken(u, t.getFamilyId()), next.raw());
	}

	@Transactional
	void logout(String raw) {
		if (raw == null || raw.isBlank()) return;
		refreshTokens.findByTokenHash(TokenService.sha256(raw))
				.ifPresent(t -> refreshTokens.revokeFamily(t.getFamilyId(), Clock.now()));
	}

	@Transactional(readOnly = true)
	User user(long id) {
		return users.findById(id).orElseThrow(() -> AuthException.unauthorized("UNAUTHORIZED", "로그인이 필요해요."));
	}

	@Transactional(readOnly = true)
	void checkNicknameAvailable(String raw) {
		String nickname = AuthRules.nickname(raw);
		if (users.existsByNickname(nickname)) throw AuthException.conflict("NICKNAME_TAKEN", "nickname", "이미 쓰는 닉네임입니다.");
	}

	/** 지난 리뷰의 author(닉네임 스냅샷)도 같은 트랜잭션에서 */
	@Transactional
	User changeNickname(long userId, String raw) {
		User u = user(userId);
		String nickname = AuthRules.nickname(raw);
		if (nickname.equals(u.getNickname())) throw AuthException.invalid("nickname", "지금 닉네임과 같아요.");
		if (!nickname.equalsIgnoreCase(u.getNickname()) && users.existsByNickname(nickname)) {
			throw AuthException.conflict("NICKNAME_TAKEN", "nickname", "이미 쓰는 닉네임입니다.");
		}
		u.setNickname(nickname);
		u.setUpdatedAt(Clock.now());
		try {
			users.saveAndFlush(u);
		} catch (DataIntegrityViolationException e) {
			throw AuthException.conflict("NICKNAME_TAKEN", "nickname", "이미 쓰는 닉네임입니다.");
		}
		reviews.renameAuthor(u.getId(), nickname);
		return u;
	}

	/** 지금 기기(sid = refresh family)를 뺀 다른 로그인은 모두 끊는다 */
	@Transactional
	void changePassword(long userId, String current, String next, String keepFamily) {
		User u = user(userId);
		if (current == null || u.getPasswordHash() == null || !encoder.matches(current, u.getPasswordHash())) {
			throw AuthException.invalid("currentPassword", "지금 비밀번호가 맞지 않습니다.");
		}
		AuthRules.password(next, "newPassword");
		if (encoder.matches(next, u.getPasswordHash())) {
			throw AuthException.invalid("newPassword", "지금 비밀번호와 다른 비밀번호를 써 주세요.");
		}
		u.setPasswordHash(encoder.encode(next));
		u.setUpdatedAt(Clock.now());
		refreshTokens.revokeOthers(u.getId(), keepFamily == null ? "" : keepFamily, Clock.now());
	}

	/** 로그인 한 번 = 새 family */
	private Session start(User u, RequestInfo info) {
		String family = TokenService.newFamily();
		TokenService.Issued refresh = tokens.issueRefresh(u.getId(), family, info);
		return new Session(u, tokens.accessToken(u, family), refresh.raw());
	}

	private static AuthException expired() {
		return AuthException.unauthorized("SESSION_EXPIRED", "로그인이 끝났어요. 다시 로그인해 주세요.");
	}

	record Session(User user, String accessToken, String refreshToken) {}
}
