package com.kopo17.runshoes.api;

import com.kopo17.runshoes.domain.ReviewRepository;
import com.kopo17.runshoes.domain.Shoe;
import com.kopo17.runshoes.domain.ShoeRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * /api/shoes — 쓰기(POST · PATCH · PUT · DELETE)는 admin 만(403). 없는 신발은 권한보다 먼저 404.
 * rating · reviewCount 는 리뷰가 정하고(Ratings), likeCount · liked 는 찜이 정한다(Likes) — 본문에 와도 admin 이어도 버린다.
 * 응답의 liked 는 요청한 사람이 찜했는지(likes). 공용 칸 shoes.liked 는 읽지 않는다(V4 에서 지운다).
 */
@Component
class ShoeCollection implements DocCollection {

	private final ShoeRepository shoes;
	private final ReviewRepository reviews;
	private final Likes likes;

	ShoeCollection(ShoeRepository shoes, ReviewRepository reviews, Likes likes) {
		this.shoes = shoes;
		this.reviews = reviews;
		this.likes = likes;
	}

	@Override
	public String name() { return "shoes"; }

	/** 홈 · 등록·관리의 검색창 — 브랜드와 모델명 */
	@Override
	public List<String> searchFields() { return List.of("brand", "model"); }

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
		Long id = Values.id("id", body.get("id"));
		if (id == null || id == 0) {
			Long max = shoes.maxId();
			id = max == null ? 1 : max + 1;
		} else if (shoes.existsById(id)) throw ApiException.conflict("duplicate id " + id);
		s.setId(id);
		return toDoc(shoes.saveAndFlush(s), false);
	}

	@Override
	@Transactional
	public Optional<Map<String, Object>> patch(long id, Map<String, Object> body, Viewer viewer) {
		return shoes.findById(id).map(s -> {
			viewer.requireAdmin();
			requireUniqueGeneration(target(s, body), s.getId());   // 바꾸기 전에 — 바꾼 엔티티는 조회 전에 먼저 flush 돼 DB UNIQUE 가 500 으로 터진다
			apply(s, body);
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
			return toDoc(shoes.saveAndFlush(s), likes.likesShoe(viewer.userId(), s.getId()));   // merge — body 에 없는 필드는 null 이 된다
		});
	}

	@Override
	@Transactional
	public boolean delete(long id, Viewer viewer) {
		if (!shoes.existsById(id)) return false;
		viewer.requireAdmin();
		reviews.deleteByShoeId(id);
		shoes.deleteById(id);
		return true;
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
		return d;
	}

	private static final java.util.Set<String> GENDERS = java.util.Set.of("men", "women", "unisex");
	// 정가 출처 · 종류(V5) — 다른 값은 400. 할인가는 받지 않는다(2026-10-28)
	private static final java.util.Set<String> PRICE_SOURCES = java.util.Set.of("공식몰", "ABC마트", "다나와");  // 다나와 = 시드 가격 중 ABC · 공식몰에 없는 것(사용자가 넣은 값, 2026-10-29)
	private static final java.util.Set<String> PRICE_KINDS = java.util.Set.of("정가");

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
				case "carbon" -> s.setCarbon(Values.bool(k, v));
				case "price" -> s.setPrice(Values.dbl(k, v));
				case "image" -> s.setImage(Values.str(k, v));
				case "images" -> s.setImages(Values.strings(k, v));
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
				default -> { }
			}
		});
	}
}
