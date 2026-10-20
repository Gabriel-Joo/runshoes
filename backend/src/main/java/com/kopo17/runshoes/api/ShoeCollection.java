package com.kopo17.runshoes.api;

import com.kopo17.runshoes.domain.ReviewRepository;
import com.kopo17.runshoes.domain.Shoe;
import com.kopo17.runshoes.domain.ShoeRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** /api/shoes */
@Component
class ShoeCollection implements DocCollection {

	private final ShoeRepository shoes;
	private final ReviewRepository reviews;

	ShoeCollection(ShoeRepository shoes, ReviewRepository reviews) {
		this.shoes = shoes;
		this.reviews = reviews;
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
	public List<Map<String, Object>> all() {
		return shoes.findAll(Sort.by("id")).stream().map(ShoeCollection::toDoc).toList();
	}

	@Override
	@Transactional(readOnly = true)
	public Optional<Map<String, Object>> get(long id) {
		return shoes.findById(id).map(ShoeCollection::toDoc);
	}

	@Override
	@Transactional
	public Map<String, Object> create(Map<String, Object> body) {
		Shoe s = new Shoe();
		apply(s, body);
		Long id = Values.id("id", body.get("id"));
		if (id == null || id == 0) {
			Long max = shoes.maxId();
			id = max == null ? 1 : max + 1;
		} else if (shoes.existsById(id)) throw ApiException.conflict("duplicate id " + id);
		s.setId(id);
		return toDoc(shoes.saveAndFlush(s));
	}

	@Override
	@Transactional
	public Optional<Map<String, Object>> patch(long id, Map<String, Object> body) {
		return shoes.findById(id).map(s -> {
			apply(s, body);
			return toDoc(shoes.saveAndFlush(s));
		});
	}

	@Override
	@Transactional
	public Optional<Map<String, Object>> replace(long id, Map<String, Object> body) {
		return shoes.findById(id).map(old -> {
			Shoe s = new Shoe();
			s.setId(old.getId());
			apply(s, body);
			return toDoc(shoes.saveAndFlush(s));         // merge — body 에 없는 필드는 null 이 된다
		});
	}

	@Override
	@Transactional
	public boolean delete(long id) {
		if (!shoes.existsById(id)) return false;
		reviews.deleteByShoeId(id);
		shoes.deleteById(id);
		return true;
	}

	/** 키 순서는 기준선 GET 과 같게(db.json 의 필드 순서) */
	static Map<String, Object> toDoc(Shoe s) {
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
		d.put("liked", s.getLiked());
		return d;
	}

	/** body 에 있는 키만 — null 도 그대로 넣는다(수정 폼이 빈 칸을 null 로 보낸다). id 와 모르는 키는 무시 */
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
				case "rating" -> s.setRating(Values.dbl(k, v));
				case "reviewCount" -> s.setReviewCount(Values.integer(k, v));
				case "likeCount" -> s.setLikeCount(Values.integer(k, v));
				case "liked" -> s.setLiked(Values.bool(k, v));
				default -> { }
			}
		});
	}
}
