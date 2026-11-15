package com.kopo17.runshoes.api;

import com.kopo17.runshoes.activity.ActivityLogger;
import com.kopo17.runshoes.activity.ActivityLogger.Entry;
import com.kopo17.runshoes.summary.SummaryStore;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 관리자의 리뷰 관리(2026-11-14 사용자, 마이페이지 관리자 메뉴 — docs/03_admin.md 1-6). 신발 숨김(V8)과 같은 방식: 숨기기 → 숨긴 리뷰 → 거기서만 영구 삭제.
 * 숨긴 리뷰(V22 hidden_at)는 엔티티로 읽히지 않으므로(domain/Review @SQLRestriction) 여기는 JDBC 로 읽고 쓴다.
 *
 * 숨기면 빠지는 곳 — 공개 리뷰 목록(/api/reviews, 챗봇 색인은 이것을 10분마다 다시 읽는다) · 신발 평점 · 리뷰 수(Ratings 로 다시 센다) ·
 *   요약 입력 · 다시 만들지 판단(SummaryStore). 요약은 비율 조건과 상관없이 「다시 만들 차례」로 세운다(forceStale) — 다음 배치(03:30 KST)가 만든다.
 * 실사용 후기(FOLLOWUP, parent_review_id)는 첫 리뷰와 같이 숨기고 같이 되살린다 — 영구 삭제 때 FK CASCADE 로 같이 지워지는 것과 맞춘다.
 * 권한: 목록은 admin · 데모 관리자(보기만), 숨기기 · 되살리기 · 영구 삭제 · 인증은 admin 만(데모 관리자 403 demo_admin). 순서는 401 → 404 → 403(Viewer).
 * 관리자 행동은 activity_logs 에 admin.review.* 로 남긴다(보관 180일 — ActivityCleanup).
 */
@Component
class AdminReviews {

	private final JdbcTemplate jdbc;
	private final Ratings ratings;
	private final SummaryStore summaries;
	private final ActivityLogger activity;

	AdminReviews(JdbcTemplate jdbc, Ratings ratings, SummaryStore summaries, ActivityLogger activity) {
		this.jdbc = jdbc;
		this.ratings = ratings;
		this.summaries = summaries;
		this.activity = activity;
	}

	/** 목록 조건 — hidden 이면 숨긴 리뷰(숨긴 순 최근 먼저), 아니면 보이는 리뷰(작성 순 최근 먼저). 나머지는 비면 거르지 않는다 */
	record Filter(boolean hidden, LocalDateTime from, LocalDateTime to, Long shoeId, String shoeLike, String authorLike) {}

	@Transactional(readOnly = true)
	Map<String, Object> list(Filter f, AdminPage page, Viewer viewer) {
		viewer.requireAdminView();
		StringBuilder where = new StringBuilder(f.hidden() ? " WHERE r.hidden_at IS NOT NULL" : " WHERE r.hidden_at IS NULL");
		List<Object> args = new ArrayList<>();
		// 숨긴 실사용 후기는 첫 리뷰 아래에 같이 숨는다 — 숨긴 목록에는 첫 리뷰만(되살리기 · 영구 삭제가 같이 한다)
		if (f.hidden()) where.append(" AND NOT EXISTS (SELECT 1 FROM reviews p WHERE p.id = r.parent_review_id AND p.hidden_at IS NOT NULL)");
		if (f.from() != null) { where.append(" AND r.created_at >= ?"); args.add(Timestamp.valueOf(f.from())); }
		if (f.to() != null) { where.append(" AND r.created_at < ?"); args.add(Timestamp.valueOf(f.to())); }
		if (f.shoeId() != null) { where.append(" AND r.shoe_id = ?"); args.add(f.shoeId()); }
		if (f.shoeLike() != null) { where.append(" AND (s.brand LIKE ? OR s.model LIKE ? OR s.model_en LIKE ?)"); args.add(f.shoeLike()); args.add(f.shoeLike()); args.add(f.shoeLike()); }
		if (f.authorLike() != null) { where.append(" AND r.author LIKE ?"); args.add(f.authorLike()); }
		String from = " FROM reviews r LEFT JOIN shoes s ON s.id = r.shoe_id";
		long total = jdbc.queryForObject("SELECT COUNT(*)" + from + where, Long.class, args.toArray());
		List<Object> pageArgs = new ArrayList<>(args);
		pageArgs.add(page.size());
		pageArgs.add(page.offset());
		String order = f.hidden() ? " ORDER BY r.hidden_at DESC, r.id DESC" : " ORDER BY r.created_at DESC, r.id DESC";
		List<Map<String, Object>> items = jdbc.query("""
				SELECT r.id, r.shoe_id, s.brand, s.model, s.image, s.deleted_at AS shoe_hidden_at, r.user_id, r.author, r.rating, r.content, r.created_at,
				       r.like_count, r.review_type, r.verified, r.verified_at, r.hidden_at,
				       (SELECT COUNT(*) FROM review_likes rl WHERE rl.review_id = r.id
				          OR rl.review_id IN (SELECT c.id FROM reviews c WHERE c.parent_review_id = r.id)) AS helpful_rows,
				       (SELECT COUNT(*) FROM reviews c WHERE c.parent_review_id = r.id) AS followups""" + from + where + order + " LIMIT ? OFFSET ?",
				(rs, i) -> toDoc(rs), pageArgs.toArray());
		return page.body(items, total);
	}

	/** 숨기기 — 보이는 리뷰만(이미 숨겼으면 409 already_hidden). 실사용 후기도 같은 시각으로 */
	@Transactional
	Map<String, Object> hide(long id, Viewer viewer) {
		Row r = locked(id, viewer);
		if (r.hiddenAt() != null) throw ApiException.state("already_hidden", "이미 숨긴 리뷰예요.");
		LocalDateTime at = Values.nowUtc().truncatedTo(ChronoUnit.MILLIS);
		int n = jdbc.update("UPDATE reviews SET hidden_at = ? WHERE (id = ? OR parent_review_id = ?) AND hidden_at IS NULL", Timestamp.valueOf(at), id, id);
		boolean stale = recount(r.shoeId());
		activity.log(new Entry("admin.review.hide", viewer.userId(), "review", id, meta(r, Map.of("rows", n))));
		return result(id, at, stale);
	}

	/** 되살리기 — 숨긴 리뷰만(아니면 409 not_hidden). 같이 숨긴 실사용 후기(같은 시각)도 */
	@Transactional
	Map<String, Object> restore(long id, Viewer viewer) {
		Row r = locked(id, viewer);
		if (r.hiddenAt() == null) throw ApiException.state("not_hidden", "숨긴 리뷰가 아니에요.");
		int n = jdbc.update("UPDATE reviews SET hidden_at = NULL WHERE (id = ? OR (parent_review_id = ? AND hidden_at = ?))",
				id, id, Timestamp.valueOf(r.hiddenAt()));
		boolean stale = recount(r.shoeId());
		activity.log(new Entry("admin.review.restore", viewer.userId(), "review", id, meta(r, Map.of("rows", n))));
		return result(id, null, stale);
	}

	/**
	 * 영구 삭제 — 숨긴 리뷰만(보이는 리뷰는 409 not_hidden). 도움이 돼요(review_likes) · 실사용 후기는 FK CASCADE 로 같이 지워진다.
	 * 숨긴 리뷰는 이미 평점 · 요약에서 빠져 있어 다시 셀 것이 없다. 지운 건수를 돌려준다(확인 창이 미리 보인 것과 같은지)
	 */
	@Transactional
	Map<String, Object> purge(long id, Viewer viewer) {
		Row r = locked(id, viewer);
		if (r.hiddenAt() == null) throw ApiException.state("not_hidden", "숨긴 리뷰만 영구 삭제할 수 있어요. 먼저 숨겨 주세요.");
		Map<String, Object> c = counts(id);
		jdbc.update("DELETE FROM reviews WHERE id = ?", id);
		Map<String, Object> extra = new LinkedHashMap<>(c);
		extra.put("rating", r.rating());
		activity.log(new Entry("admin.review.purge", viewer.userId(), "review", id, meta(r, extra)));
		Map<String, Object> d = new LinkedHashMap<>();
		d.put("id", id);
		d.putAll(c);
		return d;
	}

	/**
	 * 실사용 인증 켜기 · 끄기(2026-11-14 사용자) — V3 의 verified · verified_at · verified_by 칸은 있었는데 화면이 없었다.
	 * 켜면 때 · 켠 관리자를 적고, 끄면 둘 다 비운다. 숨긴 리뷰에도 할 수 있다. 평점 · 요약과 상관없다(셈을 바꾸지 않는다).
	 * 공개 응답의 verified 는 그대로 나간다(ReviewCollection.toDoc) — 상세 모달에 표시를 그리는 것은 이번 범위 밖
	 */
	@Transactional
	Map<String, Object> verify(long id, Object value, Viewer viewer) {
		Row r = locked(id, viewer);
		if (!(value instanceof Boolean on)) throw ApiException.invalid("verified 를 true 또는 false 로 보내 주세요.");
		LocalDateTime at = on ? Values.nowUtc().truncatedTo(ChronoUnit.MILLIS) : null;
		jdbc.update("UPDATE reviews SET verified = ?, verified_at = ?, verified_by = ? WHERE id = ?",
				on, at == null ? null : Timestamp.valueOf(at), on ? viewer.userId() : null, id);
		activity.log(new Entry(on ? "admin.review.verify" : "admin.review.unverify", viewer.userId(), "review", id, meta(r, Map.of())));
		Map<String, Object> d = new LinkedHashMap<>();
		d.put("id", id);
		d.put("verified", on);
		d.put("verifiedAt", at == null ? null : Values.formatCreatedAt(at));
		return d;
	}

	/** 지울 때 함께 지워지는 것 — 도움이 돼요(그 리뷰와 실사용 후기의 review_likes 행) · 실사용 후기 수 */
	private Map<String, Object> counts(long id) {
		Map<String, Object> m = jdbc.queryForMap("""
				SELECT (SELECT COUNT(*) FROM review_likes rl WHERE rl.review_id = ? OR rl.review_id IN (SELECT c.id FROM reviews c WHERE c.parent_review_id = ?)) AS helpful,
				       (SELECT COUNT(*) FROM reviews c WHERE c.parent_review_id = ?) AS followups""", id, id, id);
		Map<String, Object> d = new LinkedHashMap<>();
		d.put("helpful", ((Number) m.get("helpful")).intValue());
		d.put("followups", ((Number) m.get("followups")).intValue());
		return d;
	}

	record Row(long id, Long shoeId, Long userId, int rating, LocalDateTime hiddenAt) {}

	/**
	 * 쓰기 공통 — 401(SecurityConfig) → 404(없는 리뷰) → 403(admin 아님 · 데모 관리자). 그 뒤 신발 행부터 잠그고 리뷰를 다시 읽는다 —
	 * 리뷰 쓰기(ReviewCollection → Ratings.lock)와 같은 순서라 데드락이 나지 않고, 잠근 뒤의 숨김 상태로 판단한다
	 */
	private Row locked(long id, Viewer viewer) {
		viewer.requireUser();
		Row r = read(id);
		if (r == null) throw ApiException.notFound();
		viewer.requireAdmin();
		if (r.shoeId() == null) return r;
		ratings.lock(r.shoeId());
		Row again = read(id);
		if (again == null) throw ApiException.notFound();
		return again;
	}

	private Row read(long id) {
		List<Row> rows = jdbc.query("SELECT id, shoe_id, user_id, rating, hidden_at FROM reviews WHERE id = ?",
				(rs, i) -> new Row(rs.getLong("id"), rs.getObject("shoe_id", Long.class), rs.getObject("user_id", Long.class),
						rs.getInt("rating"), rs.getObject("hidden_at", LocalDateTime.class)), id);
		return rows.isEmpty() ? null : rows.get(0);
	}

	/** 평점 · 리뷰 수를 다시 세고 요약을 「다시 만들 차례」로. 돌려주는 값: 요약 행이 있어 stale 로 세웠나 */
	private boolean recount(Long shoeId) {
		if (shoeId == null) return false;
		ratings.recompute(shoeId);
		return summaries.forceStale(shoeId);
	}

	private static Map<String, Object> meta(Row r, Map<String, Object> extra) {
		Map<String, Object> m = new LinkedHashMap<>();
		if (r.shoeId() != null) m.put("shoeId", r.shoeId());
		if (r.userId() != null) m.put("authorId", r.userId());
		m.putAll(extra);
		return m;
	}

	private static Map<String, Object> result(long id, LocalDateTime hiddenAt, boolean summaryStale) {
		Map<String, Object> d = new LinkedHashMap<>();
		d.put("id", id);
		d.put("hiddenAt", hiddenAt == null ? null : Values.formatCreatedAt(hiddenAt));
		d.put("summaryStale", summaryStale);
		return d;
	}

	private static Map<String, Object> toDoc(ResultSet rs) throws SQLException {
		Map<String, Object> d = new LinkedHashMap<>();
		d.put("id", rs.getLong("id"));
		d.put("shoeId", rs.getObject("shoe_id", Long.class));
		d.put("brand", rs.getString("brand"));
		d.put("model", rs.getString("model"));
		d.put("image", rs.getString("image"));
		d.put("shoeHidden", rs.getObject("shoe_hidden_at") != null);
		d.put("userId", rs.getObject("user_id", Long.class));
		d.put("author", rs.getString("author"));
		d.put("rating", rs.getInt("rating"));
		d.put("content", rs.getString("content"));
		d.put("createdAt", at(rs, "created_at"));
		d.put("likeCount", rs.getObject("like_count", Integer.class));
		d.put("reviewType", rs.getString("review_type"));
		d.put("verified", rs.getBoolean("verified"));
		d.put("verifiedAt", at(rs, "verified_at"));
		d.put("hiddenAt", at(rs, "hidden_at"));
		d.put("helpfulRows", rs.getInt("helpful_rows"));
		d.put("followups", rs.getInt("followups"));
		return d;
	}

	private static String at(ResultSet rs, String col) throws SQLException {
		LocalDateTime t = rs.getObject(col, LocalDateTime.class);
		return t == null ? null : Values.formatCreatedAt(t);
	}
}
