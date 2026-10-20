package com.kopo17.runshoes.auth;

import com.kopo17.runshoes.domain.User;
import com.kopo17.runshoes.domain.UserRepository;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * V3 가 넣은 계정(password_hash NULL)에 비밀번호를 채운다 — USER 는 SEED_USER_PASSWORD 하나를 같이, ADMIN 은 ADMIN_PASSWORD.
 * 값은 Secret runshoes-auth 에서만 온다(git 에는 평문도 해시도 없다). 이미 채워진 계정은 건드리지 않는다 — 사용자가 바꾼 비밀번호를 덮지 않게.
 * 값이 비어 있으면 그 계정들은 로그인할 수 없는 채로 둔다(경고만).
 */
@Component
class SeedPasswords implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(SeedPasswords.class);

	private final UserRepository users;
	private final PasswordEncoder encoder;
	private final AuthProperties props;

	SeedPasswords(UserRepository users, PasswordEncoder encoder, AuthProperties props) {
		this.users = users;
		this.encoder = encoder;
		this.props = props;
	}

	@Override
	@Transactional
	public void run(ApplicationArguments args) {
		List<User> empty = users.findByPasswordHashIsNull();
		if (empty.isEmpty()) return;
		String userHash = hash(props.seedUserPassword(), "SEED_USER_PASSWORD");
		String adminHash = hash(props.adminPassword(), "ADMIN_PASSWORD");
		int filled = 0;
		for (User u : empty) {
			String h = u.isAdmin() ? adminHash : userHash;
			if (h == null) continue;
			u.setPasswordHash(h);
			u.setUpdatedAt(Clock.now());
			filled++;
		}
		log.info("비밀번호가 없던 계정 {}개 중 {}개를 Secret 값으로 채웠다", empty.size(), filled);
	}

	/** 같은 비밀번호를 쓰는 계정끼리는 해시 하나를 같이 쓴다(BCrypt 를 30번 돌리지 않게) */
	private String hash(String raw, String name) {
		if (raw == null || raw.isBlank()) {
			log.warn("{} 가 비어 있다 — 그 계정들은 로그인할 수 없다", name);
			return null;
		}
		try {
			AuthRules.password(raw, name);
		} catch (AuthException e) {
			log.warn("{} 가 가입 규칙에 맞지 않는다({}) — 그래도 쓴다", name, e.getMessage());
		}
		return encoder.encode(raw);
	}
}
