package com.kopo17.runshoes.api;

import com.kopo17.runshoes.activity.ActivityLogger;
import com.kopo17.runshoes.activity.ActivityLogger.Entry;
import com.kopo17.runshoes.domain.ReviewRepository;
import com.kopo17.runshoes.domain.Shoe;
import com.kopo17.runshoes.domain.ShoeRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Objects;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * /api/shoes — 쓰기(POST · PATCH · PUT · DELETE)는 admin 만(403, 데모 관리자는 403 demo_admin). 없는 신발은 권한보다 먼저 404.
 * DELETE 는 숨긴다(V8, 2026-10-30) — 행 · 리뷰 · 찜은 남고 목록 · 상세에서 빠진다(domain/Shoe @SQLRestriction). 되살리기는 AdminController.
 *   숨긴 신발은 없는 신발과 같다(404) — 숨긴 것을 다시 DELETE 해도 404.
 * 와이드 모델 "없음"의 출처 필수(2026-10-29)는 관리 폼이 본다 — 서버가 막으면 json-server 계약(spring-v3 W30 · W36 의 wideAvailable:false)이 깨진다.
 * rating · reviewCount 는 리뷰가 정하고(Ratings), likeCount · liked 는 찜이 정한다(Likes) — 본문에 와도 admin 이어도 버린다.
 * 응답의 liked 는 요청한 사람이 찜했는지(likes). 공용 칸 shoes.liked 는 읽지 않는다(V4 에서 지운다).
 * 수정 이력(V11, 2026-11-01 사용자): 등록 · 수정 · 숨김 · 되살리기가 updated_at · last_change(바뀐 칸 이름)를 찍고, 등록 · 수정은 활동 로그에도
 *   shoe.create · shoe.update(바뀐 칸 이름만 — 값은 넣지 않는다). 바뀐 칸이 없는 저장은 찍지도 남기지도 않는다.
 *   적재기(헤더 X-Runshoes-Client: loader)의 등록 · 수정은 시각 · 칸을 찍지 않는다 — 293켤레가 "최근 수정순" 맨 위로 올라오지 않게. 로그에는 via loader 로 남긴다.
 */
@Component
class ShoeCollection implements DocCollection {

	private final ShoeRepository shoes;
	private final ReviewRepository reviews;
	private final Likes likes;
	private final ActivityLogger activity;
	private final EntityManager em;
	private final JdbcTemplate jdbc;

	ShoeCollection(ShoeRepository shoes, ReviewRepository reviews, Likes likes, ActivityLogger activity, EntityManager em, JdbcTemplate jdbc) {
		this.shoes = shoes;
		this.reviews = reviews;
		this.likes = likes;
		this.activity = activity;
		this.em = em;
		this.jdbc = jdbc;
	}

	@Override
	public String name() { return "shoes"; }

	/** 홈 · 등록·관리의 검색창 — 브랜드 · 모델명 · 영어 이름 · 검색용 다른 표기(V13) */
	@Override
	public List<String> searchFields() { return List.of("brand", "model", "modelEn", "modelAlias"); }

	/** 브랜드 목록(처음 나온 순서 = id 순) — 등록·관리의 브랜드 칩. 검색 결과와 상관없이 전부 */
	@Transactional(readOnly = true)
	public List<String> brands() {
		return shoes.findAll(Sort.by("id")).stream().map(Shoe::getBrand).distinct().toList();
	}

	@Override
	@Transactional(readOnly = true)
	public List<Map<String, Object>> all(Viewer viewer) {
		Set<Long> liked = likes.shoesLikedBy(viewer.userId());
		return shoes.findAll(Sort.by("id")).stream().map(s -> toDoc(s, liked.contains(s.getId()))).toList();
	}

	@Override
	@Transactional(readOnly = true)
	public Optional<Map<String, Object>> get(long id, Viewer viewer) {
		Set<Long> liked = likes.shoesLikedBy(viewer.userId());
		return shoes.findById(id).map(s -> toDoc(s, liked.contains(s.getId())));
	}

	@Override
	@Transactional
	public Map<String, Object> create(Map<String, Object> body, Viewer viewer) {
		viewer.requireAdmin();
		Shoe s = new Shoe();
		requireUniqueGeneration(target(null, body), null);
		apply(s, body);
		s.setRating(0.0);                                      // 리뷰 · 찜이 생기면 서버가 센다
		s.setReviewCount(0);
		s.setLikeCount(0);
		s.setLiked(false);
		boolean loader = fromLoader();
		if (!loader) stamp(s, List.of("created"));
		// id 는 DB 가 매긴다(V10). 본문에 id 가 있으면 그 id — save 는 id 가 있으면 merge 로 보므로 persist 를 직접 부른다
		Long id = Values.id("id", body.get("id"));
		try {
			if (id == null || id == 0) s = shoes.saveAndFlush(s);
			else {
				if (shoes.existsById(id)) throw ApiException.conflict("duplicate id " + id);
				s.setId(id);
				em.persist(s);
				em.flush();
			}
			activity.log(new Entry("shoe.create", viewer.userId(), "shoe", s.getId(), Map.of("model", s.getModel() == null ? "" : s.getModel(), "via", loader ? "loader" : "admin")));
			return toDoc(s, false);
		} catch (DataIntegrityViolationException e) {
			throw saveFailed(DuplicateKey.key(e), id);
		} catch (PersistenceException e) {                      // persist 는 저장소를 거치지 않아 Spring 예외로 바뀌지 않는다
			throw saveFailed(e.getCause() == null ? e.getMessage() : e.getCause().getMessage(), id);
		}
	}

	/** DB 가 막은 저장 — 숨긴 신발(엔티티로 안 보인다)의 id 를 본문에 주면 PK, 동시에 같은 세대를 넣으면 세대 UNIQUE */
	private static ApiException saveFailed(String key, Long id) {
		if (key != null && key.contains("uk_shoes_line_generation_gender")) return ApiException.duplicateGeneration("같은 라인키 · 세대 · 성별의 신발이 이미 있다");
		return ApiException.conflict("duplicate id " + id);
	}

	@Override
	@Transactional
	public Optional<Map<String, Object>> patch(long id, Map<String, Object> body, Viewer viewer) {
		return shoes.findById(id).map(s -> {
			viewer.requireAdmin();
			requireUniqueGeneration(target(s, body), s.getId());   // 바꾸기 전에 — 바꾼 엔티티는 조회 전에 먼저 flush 돼 DB UNIQUE 가 500 으로 터진다
			Map<String, Object> before = toDoc(s, false);
			apply(s, body);
			recordUpdate(s, before, viewer);
			return toDoc(shoes.saveAndFlush(s), likes.likesShoe(viewer.userId(), s.getId()));
		});
	}

	@Override
	@Transactional
	public Optional<Map<String, Object>> replace(long id, Map<String, Object> body, Viewer viewer) {
		return shoes.findById(id).map(old -> {
			viewer.requireAdmin();
			Shoe s = new Shoe();
			s.setId(old.getId());
			requireUniqueGeneration(target(null, body), old.getId());   // PUT 은 본문에 없는 칸이 null
			apply(s, body);
			s.setRating(old.getRating());                     // 셈하는 값은 그대로 — PUT 이 지우지 않는다
			s.setReviewCount(old.getReviewCount());
			s.setLikeCount(old.getLikeCount());
			s.setLiked(old.getLiked());
			s.setUpdatedAt(old.getUpdatedAt());               // 수정 이력도 셈하는 값처럼 — 바뀐 칸이 있을 때만 아래에서 새로
			s.setLastChange(old.getLastChange());
			recordUpdate(s, toDoc(old, false), viewer);
			return toDoc(shoes.saveAndFlush(s), likes.likesShoe(viewer.userId(), s.getId()));   // merge — body 에 없는 필드는 null 이 된다
		});
	}

	@Override
	@Transactional
	public boolean delete(long id, Viewer viewer) {
		Optional<Shoe> found = shoes.findById(id);
		if (found.isEmpty()) return false;
		viewer.requireAdmin();
		Shoe s = found.get();
		java.time.LocalDateTime at = Values.nowUtc().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
		if (shoes.hide(id, at) != 1) return false;
		// 숨긴 신발의 기록 — 숨긴 뒤에는 엔티티로 읽히지 않아 모델 · 라인 · 세대를 여기 남긴다(리뷰 · 찜 수는 그때의 것)
		Map<String, Object> meta = new LinkedHashMap<>();
		meta.put("model", s.getModel());
		meta.put("brand", s.getBrand());
		meta.put("lineKey", s.getLineKey());
		meta.put("generation", s.getGeneration());
		meta.put("isCurrent", s.getIsCurrent());
		meta.put("hiddenAt", Values.formatCreatedAt(at));
		meta.put("reviews", reviews.countByShoeId(id));
		meta.put("likes", s.getLikeCount());
		activity.log(new Entry("shoe.delete", viewer.userId(), "shoe", id, meta));
		return true;
	}

	/** 숨긴 신발(관리 화면의 되살리기 목록) — admin · 데모 관리자 */
	@Transactional(readOnly = true)
	public List<Map<String, Object>> hidden(Viewer viewer) {
		viewer.requireAdminView();
		return shoes.findHidden().stream().map(s -> {
			Map<String, Object> d = toDoc(s, false);
			d.put("deletedAt", s.getDeletedAt() == null ? null : Values.formatCreatedAt(s.getDeletedAt()));
			return d;
		}).toList();
	}

	/** 되살리기 — 리뷰 · 찜이 그대로 돌아온다. 없는 · 숨기지 않은 신발은 404 */
	@Transactional
	public Map<String, Object> restore(long id, Viewer viewer) {
		if (shoes.countHidden(id) == 0) throw ApiException.notFound();
		viewer.requireAdmin();
		shoes.unhide(id, Values.nowUtc().truncatedTo(ChronoUnit.MILLIS));
		Shoe s = shoes.findById(id).orElseThrow(ApiException::notFound);
		activity.log(new Entry("shoe.restore", viewer.userId(), "shoe", id, Map.of("model", s.getModel())));
		return toDoc(s, likes.likesShoe(viewer.userId(), id));
	}

	/**
	 * 영구 삭제(V11, 2026-11-01 사용자) — 숨긴 신발만(보이는 신발 409 not_hidden, 없는 신발 404). admin 만(데모 관리자 403).
	 * 리뷰 · 답글 · 도움이 돼요 · 찜은 FK CASCADE 로 같이 지워진다. 지우기 전에 shoe_purges 에 남긴다 — pull-admin 이 읽어 카탈로그 제외로 옮긴다
	 */
	@Transactional
	public Map<String, Object> purge(long id, Viewer viewer) {
		if (shoes.countHidden(id) == 0) {
			if (!shoes.existsById(id)) throw ApiException.notFound();
			viewer.requireAdmin();
			throw ApiException.notHidden();
		}
		viewer.requireAdmin();
		Map<String, Object> row = jdbc.queryForMap("SELECT line_key, generation, gender, brand, model, like_count FROM shoes WHERE id = ? FOR UPDATE", id);
		long reviewCount = jdbc.queryForObject("SELECT COUNT(*) FROM reviews WHERE shoe_id = ?", Long.class, id);
		int likeCount = jdbc.queryForObject("SELECT COUNT(*) FROM likes WHERE shoe_id = ?", Integer.class, id);
		LocalDateTime at = Values.nowUtc().truncatedTo(ChronoUnit.MILLIS);
		jdbc.update("INSERT INTO shoe_purges (shoe_id, line_key, generation, gender, brand, model, review_count, like_count, purged_at, purged_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
				id, row.get("line_key"), row.get("generation"), row.get("gender"), row.get("brand"), row.get("model"), reviewCount, likeCount, at, viewer.userId());
		if (shoes.purge(id) != 1) throw ApiException.notFound();
		Map<String, Object> meta = new LinkedHashMap<>();
		meta.put("model", row.get("model"));
		meta.put("brand", row.get("brand"));
		meta.put("lineKey", row.get("line_key"));
		meta.put("generation", row.get("generation"));
		meta.put("gender", row.get("gender"));
		meta.put("reviews", reviewCount);
		meta.put("likes", likeCount);
		activity.log(new Entry("shoe.purge", viewer.userId(), "shoe", id, meta));
		return Map.of("id", id, "reviews", reviewCount, "likes", likeCount);
	}

	/** 영구 삭제 기록 — pull-admin 이 읽는다(admin · 데모 관리자). 지운 순서 */
	@Transactional(readOnly = true)
	public List<Map<String, Object>> purged(Viewer viewer) {
		viewer.requireAdminView();
		return jdbc.query("SELECT shoe_id, line_key, generation, gender, brand, model, review_count, like_count, purged_at FROM shoe_purges ORDER BY id", (rs, i) -> {
			Map<String, Object> d = new LinkedHashMap<>();
			d.put("id", rs.getLong("shoe_id"));
			d.put("lineKey", rs.getString("line_key"));
			d.put("generation", rs.getObject("generation"));
			d.put("gender", rs.getString("gender"));
			d.put("brand", rs.getString("brand"));
			d.put("model", rs.getString("model"));
			d.put("reviews", rs.getInt("review_count"));
			d.put("likes", rs.getInt("like_count"));
			d.put("purgedAt", Values.formatCreatedAt(rs.getTimestamp("purged_at").toLocalDateTime()));
			return d;
		});
	}

	/** 수정 이력에 넣지 않는 키 — 셈하는 값 · 요청한 사람 기준 값 · 이력 자신 · DB 가 계산하는 값(무게를 고치면 weight 가 이미 남는다) */
	private static final Set<String> NOT_EDITS = Set.of("id", "rating", "reviewCount", "likeCount", "liked", "updatedAt", "lastChange", "weightNorm270");

	/** 바뀐 칸 이름(API 이름, toDoc 순서) — 값은 보지 않고 같은지만 */
	static List<String> changedFields(Map<String, Object> before, Map<String, Object> after) {
		List<String> out = new ArrayList<>();
		for (String k : after.keySet()) if (!NOT_EDITS.contains(k) && !Objects.equals(before.get(k), after.get(k))) out.add(k);
		return out;
	}

	private void recordUpdate(Shoe s, Map<String, Object> before, Viewer viewer) {
		List<String> fields = changedFields(before, toDoc(s, false));
		if (fields.isEmpty()) return;
		boolean loader = fromLoader();
		if (!loader) stamp(s, fields);
		activity.log(new Entry("shoe.update", viewer.userId(), "shoe", s.getId(), Map.of("fields", fields, "via", loader ? "loader" : "admin")));
	}

	private static void stamp(Shoe s, List<String> fields) {
		s.setUpdatedAt(Values.nowUtc().truncatedTo(ChronoUnit.MILLIS));
		s.setLastChange(List.copyOf(fields));
	}

	/** 적재기 요청인가 — catalog/load.mjs 가 붙이는 헤더. 관리자 토큰으로만 쓰기가 되니 스스로 밝히는 값이면 된다 */
	private static boolean fromLoader() {
		return RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes a
				&& "loader".equals(a.getRequest().getHeader("X-Runshoes-Client"));
	}

	/** 키 순서는 기준선 GET 과 같게(db.json 의 필드 순서). liked 는 요청한 사람 기준 */
	static Map<String, Object> toDoc(Shoe s, boolean liked) {
		Map<String, Object> d = new LinkedHashMap<>();
		d.put("id", s.getId());
		d.put("brand", s.getBrand());
		d.put("model", s.getModel());
		d.put("purpose", s.getPurpose());
		d.put("stability", s.getStability());
		d.put("midsole", s.getMidsole());
		d.put("weight", s.getWeight());
		d.put("drop", s.getDrop());
		d.put("stackHeight", s.getStackHeight());
		d.put("width", s.getWidth());
		d.put("wideAvailable", s.getWideAvailable());
		d.put("wideScope", s.getWideScope());
		d.put("carbon", s.getCarbon());
		d.put("price", s.getPrice());
		d.put("image", s.getImage());
		d.put("images", s.getImages());
		d.put("summary", s.getSummary());
		d.put("description", s.getDescription());
		d.put("rating", s.getRating());
		d.put("reviewCount", s.getReviewCount());
		d.put("likeCount", s.getLikeCount());
		d.put("liked", liked);
		// V4 — 세대 구조 · 공시값 기준 사이즈 · 실측값. 옛 키 뒤에 붙인다(옛 키의 순서 · 값은 그대로 — 계약 spring-v3 는 이 키들을 "추가"로만 본다)
		d.put("lineKey", s.getLineKey());
		d.put("generation", s.getGeneration());
		d.put("isCurrent", s.getIsCurrent());
		d.put("gender", s.getGender());
		d.put("weightSize", s.getWeightSize());
		d.put("specSize", s.getSpecSize());
		d.put("measuredWeight", s.getMeasuredWeight());
		d.put("measuredWeightSize", s.getMeasuredWeightSize());
		d.put("measuredStackHeight", s.getMeasuredStackHeight());
		d.put("measuredDrop", s.getMeasuredDrop());
		d.put("measuredSource", s.getMeasuredSource());
		d.put("measuredCount", s.getMeasuredCount());
		// V5 — 가격 메타. 같은 방식으로 맨 뒤에 붙인다(계약 spring-v4 는 "추가"로만 본다)
		d.put("priceSource", s.getPriceSource());
		d.put("priceCheckedAt", s.getPriceCheckedAt() == null ? null : s.getPriceCheckedAt().toString());
		d.put("priceKind", s.getPriceKind());
		// V6 — 스펙 출처. 같은 방식으로 맨 뒤에(계약 spring-v4 · v3 는 "추가"로만 본다)
		d.put("specSources", s.getSpecSources());
		// V11 — 품번 · 관리자가 마지막으로 고친 때 · 그때 바뀐 칸 이름. 같은 방식으로 맨 뒤에
		d.put("sku", s.getSku());
		d.put("updatedAt", s.getUpdatedAt() == null ? null : Values.formatCreatedAt(s.getUpdatedAt()));
		d.put("lastChange", s.getLastChange());
		// V13 — 영어 이름 · 검색용 다른 표기. 같은 방식으로 맨 뒤에
		d.put("modelEn", s.getModelEn());
		d.put("modelAlias", s.getModelAlias());
		// V15 — 270mm(M9)로 맞춘 무게(DB 생성 컬럼, 읽기 전용 — 본문에 와도 apply 가 읽지 않는다). 같은 방식으로 맨 뒤에
		d.put("weightNorm270", s.getWeightNorm270());
		return d;
	}

	private static final java.util.Set<String> GENDERS = java.util.Set.of("men", "women", "unisex");
	// 가격 출처 · 종류(V5) — 다른 값은 400. 할인가는 받지 않는다(2026-10-28)
	// 다나와 = 시드 가격 중 ABC · 공식몰에 없는 것(사용자가 넣은 값, 2026-10-29). 크림 = 발매가(2026-10-29).
	// MAN(직접 확인) = 공식몰에서 내려간 모델을 관리자가 다른 자료(블로그의 공식몰 화면 캡처 등)로 확인한 발매가(2026-11-01, 이름은 2026-11-02 스펙 출처 MAN 과 맞춤 — 운영에 "직접 확인" 값은 없었다)
	private static final java.util.Set<String> PRICE_SOURCES = java.util.Set.of("공식몰", "ABC마트", "다나와", "크림", "MAN(직접 확인)");
	// 와이드가 어디에 나오나(V12, 2026-11-02 사용자) — domestic 국내 · overseas 해외에만. 와이드 없음 · 정보 없음이면 null
	private static final java.util.Set<String> WIDE_SCOPES = java.util.Set.of("domestic", "overseas");
	private static final java.util.Set<String> PRICE_KINDS = java.util.Set.of("발매가");   // 2026-10-30 사용자 — "정가"를 "발매가"로 통일(크림 발매가 · 공식몰 · ABC마트 정가 모두)

	/** 품번(V11) — 영문 · 숫자와 - . / 공백, 50자까지. 온은 점(71.98674), 미즈노는 두 품번을 / 로(411448-RBUN / U1GD241751) — 카탈로그 실제 값. 빈 칸은 없음(null) */
	private static String sku(String v) {
		if (v == null || v.isBlank()) return null;
		String t = v.trim();
		if (!t.matches("[A-Za-z0-9./ -]{1,50}")) throw ApiException.invalid("품번은 영문 · 숫자와 - . / 로 50자까지예요(예: 1011C284-400)");
		return t;
	}

	/** 영어 이름 · 다른 표기(V13) — 앞뒤 공백을 떼고 길이만 본다(열 길이). 빈 칸은 없음(null) */
	private static String text(String field, Object v, int max, String label) {
		String x = Values.str(field, v);
		if (x == null || x.isBlank()) return null;
		String t = x.trim();
		if (t.length() > max) throw ApiException.invalid(label + "은 " + max + "자까지예요");
		return t;
	}

	/** 추가 이미지는 6장까지(2026-10-30 사용자 — 관리 폼이 칸 하나에 주소 하나) */
	static final int MAX_IMAGES = 6;

	private static List<String> images(List<String> v) {
		if (v != null && v.size() > MAX_IMAGES) throw ApiException.invalid("추가 이미지는 " + MAX_IMAGES + "개까지예요");
		return v;
	}

	private static String oneOf(String field, Object v, java.util.Set<String> allowed) {
		String x = Values.str(field, v);
		if (x != null && !allowed.contains(x)) throw ApiException.badRequest(field + " 은 " + String.join(" · ", allowed.stream().sorted().toList()) + " 중 하나여야 한다");
		return x;
	}

	/** 쓰고 난 뒤의 lineKey · generation · gender — base(PATCH 의 지금 행) 위에 본문을 얹는다. 엔티티를 건드리지 않는 사본 */
	private static Shoe target(Shoe base, Map<String, Object> body) {
		Shoe t = new Shoe();
		if (base != null) { t.setLineKey(base.getLineKey()); t.setGeneration(base.getGeneration()); t.setGender(base.getGender()); }
		Map<String, Object> keys = new LinkedHashMap<>();
		for (String k : List.of("lineKey", "generation", "gender")) if (body.containsKey(k)) keys.put(k, body.get(k));
		apply(t, keys);
		return t;
	}

	/** 한 라인 · 세대 · 성별은 한 행 — DB UNIQUE(uk_shoes_line_generation_gender)가 500 으로 터지기 전에 409. 셋 중 하나라도 없으면 보지 않는다(NULL 은 겹치지 않는다) */
	private void requireUniqueGeneration(Shoe s, Long selfId) {
		if (s.getGender() != null && !GENDERS.contains(s.getGender())) throw ApiException.badRequest("gender 는 men · women · unisex 중 하나여야 한다");
		if (s.getLineKey() == null || s.getGeneration() == null || s.getGender() == null) return;
		boolean taken = shoes.findByLineKeyAndGenerationAndGender(s.getLineKey(), s.getGeneration(), s.getGender()).stream()
				.anyMatch(o -> !o.getId().equals(selfId));
		if (taken) throw ApiException.duplicateGeneration("duplicate generation " + s.getLineKey() + " " + s.getGeneration() + " " + s.getGender());
		List<Long> hidden = shoes.hiddenGeneration(s.getLineKey(), s.getGeneration(), s.getGender()).stream().filter(h -> !h.equals(selfId)).toList();
		if (!hidden.isEmpty()) throw ApiException.hiddenGeneration(hidden.get(0));   // DB UNIQUE 는 숨긴 행에도 걸린다 — 500 대신 409
	}


	/** body 에 있는 키만 — null 도 그대로 넣는다(수정 폼이 빈 칸을 null 로 보낸다). id · 셈하는 값(rating · reviewCount · likeCount · liked) · 모르는 키는 무시 */
	static void apply(Shoe s, Map<String, Object> body) {
		body.forEach((k, v) -> {
			switch (k) {
				case "brand" -> s.setBrand(Values.str(k, v));
				case "model" -> s.setModel(Values.str(k, v));
				case "purpose" -> s.setPurpose(Values.str(k, v));
				case "stability" -> s.setStability(Values.str(k, v));
				case "midsole" -> s.setMidsole(Values.str(k, v));
				case "weight" -> s.setWeight(Values.dbl(k, v));
				case "drop" -> s.setDrop(Values.dbl(k, v));
				case "stackHeight" -> s.setStackHeight(Values.dbl(k, v));
				case "width" -> s.setWidth(Values.str(k, v));
				case "wideAvailable" -> s.setWideAvailable(Values.bool(k, v));
				case "wideScope" -> s.setWideScope(oneOf(k, v, WIDE_SCOPES));
				case "carbon" -> s.setCarbon(Values.bool(k, v));
				case "price" -> s.setPrice(Values.dbl(k, v));
				case "image" -> s.setImage(Values.str(k, v));
				case "images" -> s.setImages(images(Values.strings(k, v)));
				case "summary" -> s.setSummary(Values.str(k, v));
				case "description" -> s.setDescription(Values.str(k, v));
				case "lineKey" -> s.setLineKey(Values.str(k, v));
				case "generation" -> s.setGeneration(Values.integer(k, v));
				case "isCurrent" -> s.setIsCurrent(Values.bool(k, v));
				case "gender" -> s.setGender(Values.str(k, v));
				case "weightSize" -> s.setWeightSize(Values.str(k, v));
				case "specSize" -> s.setSpecSize(Values.str(k, v));
				case "measuredWeight" -> s.setMeasuredWeight(Values.dbl(k, v));
				case "measuredWeightSize" -> s.setMeasuredWeightSize(Values.str(k, v));
				case "measuredStackHeight" -> s.setMeasuredStackHeight(Values.dbl(k, v));
				case "measuredDrop" -> s.setMeasuredDrop(Values.dbl(k, v));
				case "measuredSource" -> s.setMeasuredSource(Values.str(k, v));
				case "measuredCount" -> s.setMeasuredCount(Values.integer(k, v));
				case "priceSource" -> s.setPriceSource(oneOf(k, v, PRICE_SOURCES));
				case "priceCheckedAt" -> s.setPriceCheckedAt(Values.date(k, v));
				case "priceKind" -> s.setPriceKind(oneOf(k, v, PRICE_KINDS));
				case "specSources" -> s.setSpecSources(SpecSources.parse(v));
				case "sku" -> s.setSku(sku(Values.str(k, v)));
				case "modelEn" -> s.setModelEn(text(k, v, 100, "영어 이름"));
				case "modelAlias" -> s.setModelAlias(text(k, v, 255, "검색용 다른 표기"));
				default -> { }
			}
		});
	}
}
