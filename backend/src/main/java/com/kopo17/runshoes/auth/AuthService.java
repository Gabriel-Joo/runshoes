package com.kopo17.runshoes.auth;

import com.kopo17.runshoes.activity.ActivityLogger;
import com.kopo17.runshoes.activity.ActivityLogger.Entry;
import com.kopo17.runshoes.domain.RefreshToken;
import com.kopo17.runshoes.domain.RefreshTokenRepository;
import com.kopo17.runshoes.domain.ReviewRepository;
import com.kopo17.runshoes.domain.User;
import com.kopo17.runshoes.domain.UserRepository;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 가입 · 로그인 · refresh(교체 · 재사용 감지) · 로그아웃 · 닉네임 · 비밀번호.
 * refresh 재사용: 이미 바뀐 토큰이 다시 오면 그 family 를 전부 폐기한다(탈취로 본다).
 *   다만 바뀐 지 10초 안이면 탭 둘이 동시에 refresh 한 것으로 보고 family 에 토큰을 하나 더 준다 — 새로고침 두 번에 로그아웃되지 않게.
 * 시도 제한(RateLimiter)과 활동 로그(ActivityLogger) — 실패 · 429 · 재사용 감지는 따로 커밋(logNow), 성공은 같은 트랜잭션(log).
 *   인증 이벤트의 target 은 이메일 카운팅 키(EmailKey) — 세는 데만 쓰고, 사람이 읽는 것은 user_id 다.
 * 탈퇴(V9): 로그인 · refresh · /api/me 가 막힌다. 체험 로그인(docs/ADMIN_DEMO_DESIGN.md 8.3): 시드 계정 30개 · 데모 관리자만, 비밀번호 없이.
 * 체험 계정(시드 · 데모 관리자)과 관리자는 닉네임 변경 · 탈퇴를 막는다 — 체험 카드로 들어온 누구나 시드 데이터를 바꾸거나 지울 수 있게 되므로.
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
	private final RateLimiter limiter;
	private final EmailKey emailKey;
	private final ActivityLogger activity;
	private final JdbcTemplate jdbc;
	private final AuthProperties props;
	/** 없는 이메일에도 BCrypt 를 한 번 돌린다 — 응답 시간으로 가입 여부가 드러나지 않게 */
	private final String dummyHash;

	AuthService(UserRepository users, RefreshTokenRepository refreshTokens, ReviewRepository reviews, PasswordEncoder encoder,
			TokenService tokens, RateLimiter limiter, EmailKey emailKey, ActivityLogger activity, JdbcTemplate jdbc, AuthProperties props) {
		this.users = users;
		this.refreshTokens = refreshTokens;
		this.reviews = reviews;
		this.encoder = encoder;
		this.tokens = tokens;
		this.limiter = limiter;
		this.emailKey = emailKey;
		this.activity = activity;
		this.jdbc = jdbc;
		this.props = props;
		this.dummyHash = encoder.encode("runshoes-dummy-password-0");
	}

	@Transactional
	Session signup(String rawEmail, String password, String rawNickname, RequestInfo info) {
		String email = AuthRules.email(rawEmail);
		AuthRules.password(password, "password");
		String nickname = AuthRules.nickname(rawNickname);
		if (users.existsByEmail(email)) throw AuthException.conflict("EMAIL_TAKEN", "email", "이미 가입된 이메일입니다.");
		if (users.existsByNickname(nickname)) throw AuthException.conflict("NICKNAME_TAKEN", "nickname", "이미 쓰는 닉네임입니다.");
		limiter.checkSignup(info.ip());                          // 같은 IP 1시간 10건 — 성공한 가입만 센다
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
		activity.log(Entry.of("auth.signup", u.getId(), "user", u.getId()));
		return start(u, info);
	}

	@Transactional
	Session login(String rawEmail, String password, RequestInfo info) {
		String email = rawEmail == null ? "" : rawEmail.strip().toLowerCase();
		if (email.isEmpty() || password == null || password.isEmpty()) {
			throw AuthException.invalid(null, "이메일과 비밀번호를 입력해 주세요.");
		}
		User u = users.findByEmail(email).filter(x -> !x.isWithdrawn()).orElse(null);
		Long userId = u == null ? null : u.getId();
		long key = emailKey.of(email);
		try {
			limiter.checkLogin(key, info.ip());                   // 비밀번호를 보기 전에 — 잠긴 동안에는 맞아도 429
		} catch (AuthException e) {
			activity.logNow(Entry.of("auth.login.blocked", userId, "email", key));
			throw e;
		}
		boolean usable = u != null && usableHash(u.getPasswordHash());   // '!demo' · '!withdrawn' 은 비밀번호로 들어갈 수 없는 표식
		boolean ok = encoder.matches(password, usable ? u.getPasswordHash() : dummyHash) && usable;
		if (!ok) {
			activity.logNow(Entry.of("auth.login.failure", userId, "email", key));
			throw AuthException.unauthorized("INVALID_CREDENTIALS", "이메일 또는 비밀번호가 맞지 않습니다.");
		}
		u.setLastLoginAt(Clock.now());
		activity.log(Entry.of("auth.login.success", userId, "email", key));   // 성공하면 그 계정의 실패는 리셋(RateLimiter)
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
					activity.logNow(Entry.of("auth.refresh.reuse", t.getUserId(), "user", t.getUserId()).meta(Map.of("revoked", n)));
				}
				throw expired();
			}
		} else if (t.getExpiresAt().isBefore(now)) {
			throw expired();
		}
		User u = users.findById(t.getUserId()).filter(x -> !x.isWithdrawn()).orElseThrow(AuthService::expired);
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
		refreshTokens.findByTokenHash(TokenService.sha256(raw)).ifPresent(t -> {
			refreshTokens.revokeFamily(t.getFamilyId(), Clock.now());
			activity.log(Entry.of("auth.logout", t.getUserId(), "user", t.getUserId()));
		});
	}

	@Transactional(readOnly = true)
	User user(long id) {
		return users.findById(id).filter(u -> !u.isWithdrawn()).orElseThrow(() -> AuthException.unauthorized("UNAUTHORIZED", "로그인이 필요해요."));
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
		requireOwnAccount(u, "닉네임을 바꿀");
		String nickname = AuthRules.nickname(raw);
		if (nickname.equals(u.getNickname())) throw AuthException.invalid("nickname", "지금 닉네임과 같아요.");
		if (!nickname.equalsIgnoreCase(u.getNickname()) && users.existsByNickname(nickname)) {
			throw AuthException.conflict("NICKNAME_TAKEN", "nickname", "이미 쓰는 닉네임입니다.");
		}
		String before = u.getNickname();
		u.setNickname(nickname);
		u.setUpdatedAt(Clock.now());
		try {
			users.saveAndFlush(u);
		} catch (DataIntegrityViolationException e) {
			throw AuthException.conflict("NICKNAME_TAKEN", "nickname", "이미 쓰는 닉네임입니다.");
		}
		reviews.renameAuthor(u.getId(), nickname);
		activity.log(Entry.of("user.nickname.change", u.getId(), "user", u.getId()).meta(Map.of("before", before, "after", nickname)));
		return u;
	}

	/**
	 * 지금 기기(sid = refresh family)를 뺀 다른 로그인은 모두 끊는다.
	 * "지금 비밀번호" 틀림은 로그인 실패와 같이 센다(그 계정) — 로그인한 채 비밀번호를 추측하는 길을 막는다
	 */
	@Transactional
	void changePassword(long userId, String current, String next, String keepFamily, RequestInfo info) {
		User u = user(userId);
		if (u.isDemoAdmin()) throw demoAdmin();
		long key = emailKey.of(u.getEmail());
		try {
			limiter.checkLogin(key, info.ip());
		} catch (AuthException e) {
			activity.logNow(Entry.of("auth.login.blocked", userId, "email", key).meta(Map.of("via", "password")));
			throw e;
		}
		if (current == null || !usableHash(u.getPasswordHash()) || !encoder.matches(current, u.getPasswordHash())) {
			activity.logNow(Entry.of("auth.password.failure", userId, "email", key));
			throw AuthException.invalid("currentPassword", "지금 비밀번호가 맞지 않습니다.");
		}
		AuthRules.password(next, "newPassword");
		if (encoder.matches(next, u.getPasswordHash())) {
			throw AuthException.invalid("newPassword", "지금 비밀번호와 다른 비밀번호를 써 주세요.");
		}
		u.setPasswordHash(encoder.encode(next));
		u.setUpdatedAt(Clock.now());
		refreshTokens.revokeOthers(u.getId(), keepFamily == null ? "" : keepFamily, Clock.now());
		activity.log(Entry.of("auth.password.change", userId, "user", userId));
	}

	/**
	 * 회원 탈퇴(V9, 2026-10-30 사용자) — 한 트랜잭션:
	 * 리뷰는 남기고 작성자를 "탈퇴 회원"으로 · 찜은 지우고 신발의 찜 수를 뺀다 · 모든 로그인을 끊는다 · 비밀번호 칸을 표식으로.
	 * 같은 이메일로 다시 가입할 수 있게 이메일 · 닉네임을 자리표시로 바꾼다(UNIQUE 를 비운다 — 새 계정은 새 id 라 이전 리뷰는 돌아오지 않는다). 복구는 없다.
	 * 리뷰 공감(review_likes)은 남긴다 — 남의 리뷰의 공감 수가 바뀌지 않게.
	 */
	@Transactional
	void withdraw(long userId) {
		User u = user(userId);
		requireOwnAccount(u, "탈퇴할");
		LocalDateTime now = Clock.now();
		int reviewCount = reviews.renameAuthor(u.getId(), ReviewRepository.WITHDRAWN_AUTHOR);
		jdbc.update("UPDATE shoes s JOIN likes l ON l.shoe_id = s.id SET s.like_count = GREATEST(s.like_count - 1, 0) WHERE l.user_id = ?", u.getId());
		int likeCount = jdbc.update("DELETE FROM likes WHERE user_id = ?", u.getId());
		refreshTokens.revokeAll(u.getId(), now);
		u.setEmail("withdrawn-" + u.getId() + "@runshoes.invalid");
		u.setNickname("탈퇴-" + u.getId());           // 가입 규칙(한글 · 영문 · 숫자)에 '-' 가 없어 누구의 닉네임과도 겹치지 않는다
		u.setPasswordHash(WITHDRAWN_HASH);
		u.setDeletedAt(now);
		u.setUpdatedAt(now);
		users.saveAndFlush(u);
		activity.log(Entry.of("user.withdraw", u.getId(), "user", u.getId()).meta(Map.of("reviews", reviewCount, "likes", likeCount)));
	}

	/** 체험 카드(GET /api/auth/demo-accounts) — 시드 계정 3개(무작위) + 데모 관리자. 꺼져 있으면 404 */
	@Transactional(readOnly = true)
	List<Map<String, Object>> demoAccounts() {
		requireDemo();
		List<User> pool = new ArrayList<>(users.randomSeedUsers(3));
		users.findFirstByRoleAndDeletedAtIsNull(User.DEMO_ADMIN).ifPresent(pool::add);
		return pool.stream().map(u -> {
			Map<String, Object> d = new LinkedHashMap<>();
			d.put("id", u.getId());
			d.put("nickname", u.getNickname());
			d.put("role", u.getRole());
			d.put("reviewCount", reviews.countByUserId(u.getId()));
			return d;
		}).toList();
	}

	/** 체험 로그인(POST /api/auth/demo) — 체험 풀(시드 30 · 데모 관리자) 안의 id 만, 비밀번호 없이. 풀 밖(진짜 관리자 · 실제 가입자)은 400 */
	@Transactional
	Session demoLogin(Long id, RequestInfo info) {
		requireDemo();
		try {
			limiter.checkDemo(info.ip());
		} catch (AuthException e) {
			activity.logNow(Entry.of("auth.demo_login.blocked", null, "user", id));
			throw e;
		}
		User u = id == null ? null : users.findById(id).filter(x -> !x.isWithdrawn() && (isSeedAccount(x) || x.isDemoAdmin())).orElse(null);
		if (u == null) throw AuthException.invalid(null, "체험 계정이 아니에요.");
		u.setLastLoginAt(Clock.now());
		activity.log(Entry.of("auth.demo_login", u.getId(), "user", u.getId()));
		return start(u, info);
	}

	static final String WITHDRAWN_HASH = "!withdrawn";
	private static final Pattern SEED_EMAIL = Pattern.compile("^runner[0-9]{2}@runshoes\\.test$");

	/** V3 시드 계정(runner01~30@runshoes.test) — 체험 카드의 일반 사용자 풀 */
	static boolean isSeedAccount(User u) {
		return User.USER.equals(u.getRole()) && u.getEmail() != null && SEED_EMAIL.matcher(u.getEmail()).matches();
	}

	/** BCrypt 해시인가 — NULL(아직 없음) · '!' 로 시작하는 표식(데모 관리자 · 탈퇴)은 비밀번호로 들어갈 수 없다 */
	private static boolean usableHash(String h) {
		return h != null && !h.startsWith("!");
	}

	private void requireDemo() {
		if (!props.demoLoginEnabled()) throw AuthException.notFound();
	}

	private static void requireOwnAccount(User u, String what) {
		if (u.isDemoAdmin()) throw demoAdmin();
		if (u.isAdmin() || isSeedAccount(u)) throw AuthException.forbidden("DEMO_ACCOUNT", "체험 · 관리자 계정은 " + what + " 수 없어요.");
	}

	private static AuthException demoAdmin() {
		return AuthException.forbidden("DEMO_ADMIN", "데모 관리자 계정은 할 수 없습니다");
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
