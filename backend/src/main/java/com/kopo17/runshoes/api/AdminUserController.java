package com.kopo17.runshoes.api;

import com.kopo17.runshoes.auth.LoginLocks;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 회원 관리(관리자 마이페이지, 2026-11-14 사용자 — docs/03_admin.md 1-6).
 * GET  /api/admin/users?q=&year=&page=&size=   계정 목록, 가입 최근 순. q 는 이메일 · 닉네임 부분 일치, year 는 가입한 한국 연도(2000~2100, 밖이면 400).
 *                                        서버 페이지 나누기 {items, total, page, size, years} — years 는 가입한 해들(최근 먼저, 연도 고르기 칸, 2026-11-15).
 *                                        한 줄: id · 이메일 · 닉네임 · 역할 · 가입일 · 마지막 로그인 · 탈퇴 · 잠김(풀리는 때) · 리뷰 수. admin · 데모 관리자
 *        데모 관리자도 admin 과 똑같이 본다(이메일 · 이메일 검색 포함, 2026-11-15 사용자) — 시현용이라 가리면 화면이 빈다.
 *        실제 서비스로 가면 데모 관리자 계정을 지운다(docs/04_auth.md)
 * POST /api/admin/users/{id}/unlock      로그인 계정 잠금 풀기 — admin 만. 탈퇴 계정 409 withdrawn, 잠겨 있지 않으면 409 not_locked.
 *                                        IP 잠금은 계정 단위로 풀 수 없다(화면에 적는다)
 * 계정 수는 사람 수가 아니다 — 체험 계정 31개를 여러 사람이 함께 쓰고, 한 사람이 계정을 여럿 만들 수 있다. 화면은 「계정 N개」라고 쓴다.
 */
@RestController
@RequestMapping("/api/admin/users")
class AdminUserController {

	private final JdbcTemplate jdbc;
	private final LoginLocks locks;

	AdminUserController(JdbcTemplate jdbc, LoginLocks locks) {
		this.jdbc = jdbc;
		this.locks = locks;
	}

	@GetMapping
	@Transactional(readOnly = true)
	Map<String, Object> list(@RequestParam(required = false) String q, @RequestParam(required = false) String year,
			@RequestParam(required = false) String page, @RequestParam(required = false) String size) {
		Viewer viewer = Viewer.current();
		viewer.requireAdminView();
		AdminPage p = AdminPage.of(page, size);
		String like = AdminPage.like(q);
		LocalDateTime[] y = AdminPage.yearKst(year);
		StringBuilder where = new StringBuilder(" WHERE 1 = 1");
		List<Object> args = new ArrayList<>();
		if (like != null) {
			where.append(" AND (u.email LIKE ? OR u.nickname LIKE ?)");
			args.add(like);
			args.add(like);
		}
		if (y != null) {
			where.append(" AND u.created_at >= ? AND u.created_at < ?");
			args.add(Timestamp.valueOf(y[0]));
			args.add(Timestamp.valueOf(y[1]));
		}
		long total = jdbc.queryForObject("SELECT COUNT(*) FROM users u" + where, Long.class, args.toArray());
		List<Object> pageArgs = new ArrayList<>(args);
		pageArgs.add(p.size());
		pageArgs.add(p.offset());
		List<Map<String, Object>> items = jdbc.query("""
				SELECT u.id, u.email, u.nickname, u.role, u.created_at, u.last_login_at, u.deleted_at,
				       (SELECT COUNT(*) FROM reviews r WHERE r.user_id = u.id AND r.hidden_at IS NULL) AS reviews
				  FROM users u""" + where + " ORDER BY u.created_at DESC, u.id DESC LIMIT ? OFFSET ?",
				(rs, i) -> {
					String email = rs.getString("email");
					LocalDateTime deleted = rs.getObject("deleted_at", LocalDateTime.class);
					LocalDateTime until = deleted == null ? locks.lockedUntil(email) : null;   // 탈퇴 계정은 로그인이 없다
					Map<String, Object> d = new LinkedHashMap<>();
					d.put("id", rs.getLong("id"));
					d.put("email", email);
					d.put("nickname", rs.getString("nickname"));
					d.put("role", rs.getString("role"));
					d.put("createdAt", at(rs.getObject("created_at", LocalDateTime.class)));
					d.put("lastLoginAt", at(rs.getObject("last_login_at", LocalDateTime.class)));
					d.put("withdrawn", deleted != null);
					d.put("withdrawnAt", at(deleted));
					d.put("locked", until != null);
					d.put("lockedUntil", at(until));
					d.put("reviews", rs.getInt("reviews"));
					return d;
				}, pageArgs.toArray());
		Map<String, Object> body = p.body(items, total);
		// 연도 고르기 칸의 값 — 가입한 해(한국 연도) 최근 먼저. 거르기와 상관없이 전체 계정에서
		body.put("years", jdbc.queryForList(
				"SELECT DISTINCT YEAR(CONVERT_TZ(created_at, '+00:00', '+09:00')) AS y FROM users ORDER BY y DESC", Integer.class));
		return body;
	}

	@PostMapping("/{id}/unlock")
	@Transactional
	Map<String, Object> unlock(@PathVariable String id) {
		Viewer viewer = Viewer.current();
		long userId = JsonServerController.id(id);
		viewer.requireUser();
		List<Map<String, Object>> rows = jdbc.queryForList("SELECT email, deleted_at FROM users WHERE id = ?", userId);
		if (rows.isEmpty()) throw ApiException.notFound();
		viewer.requireAdmin();
		if (rows.get(0).get("deleted_at") != null) throw ApiException.state("withdrawn", "탈퇴한 계정이에요.");
		if (!locks.unlock(userId, (String) rows.get(0).get("email"), viewer.userId())) throw ApiException.state("not_locked", "잠겨 있지 않아요.");
		return Map.of("id", userId, "locked", false);
	}

	private static String at(LocalDateTime t) {
		return t == null ? null : Values.formatCreatedAt(t);
	}
}
