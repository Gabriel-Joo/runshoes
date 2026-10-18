package com.kopo17.runshoes.api;

import com.kopo17.runshoes.domain.Review;
import com.kopo17.runshoes.domain.ReviewRepository;
import com.kopo17.runshoes.domain.ShoeRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** /api/reviews */
@Component
class ReviewCollection implements DocCollection {

	private final ReviewRepository reviews;
	private final ShoeRepository shoes;

	ReviewCollection(ReviewRepository reviews, ShoeRepository shoes) {
		this.reviews = reviews;
		this.shoes = shoes;
	}

	@Override
	public String name() { return "reviews"; }

	@Override
	@Transactional(readOnly = true)
	public List<Map<String, Object>> all() {
		return reviews.findAll(Sort.by("id")).stream().map(ReviewCollection::toDoc).toList();
	}

	@Override
	@Transactional(readOnly = true)
	public Optional<Map<String, Object>> get(long id) {
		return reviews.findById(id).map(ReviewCollection::toDoc);
	}

	@Override
	@Transactional
	public Map<String, Object> create(Map<String, Object> body) {
		Review r = new Review();
		r.setLiked(false);
		apply(r, body);
		if (r.getCreatedAt() == null) r.setCreatedAt(Values.nowUtc());   // json-server 는 키 없이 저장 — 컬럼이 NOT NULL 이라 지금 시각
		checkShoe(r.getShoeId());
		Long id = Values.id("id", body.get("id"));
		if (id == null || id == 0) {
			Long max = reviews.maxId();
			id = max == null ? 1 : max + 1;
		} else if (reviews.existsById(id)) throw ApiException.conflict("duplicate id " + id);
		r.setId(id);
		return toDoc(reviews.saveAndFlush(r));
	}

	@Override
	@Transactional
	public Optional<Map<String, Object>> patch(long id, Map<String, Object> body) {
		return reviews.findById(id).map(r -> {
			apply(r, body);
			checkShoe(r.getShoeId());
			return toDoc(reviews.saveAndFlush(r));
		});
	}

	@Override
	@Transactional
	public Optional<Map<String, Object>> replace(long id, Map<String, Object> body) {
		return reviews.findById(id).map(old -> {
			Review r = new Review();
			r.setId(old.getId());
			r.setLiked(false);
			apply(r, body);
			if (r.getCreatedAt() == null) r.setCreatedAt(old.getCreatedAt());
			checkShoe(r.getShoeId());
			return toDoc(reviews.saveAndFlush(r));
		});
	}

	@Override
	@Transactional
	public boolean delete(long id) {
		if (!reviews.existsById(id)) return false;
		reviews.deleteById(id);
		return true;
	}

	/** json-server 는 없는 신발의 리뷰도 받지만 여기는 FK 가 있다 — 400 으로 돌려보낸다 */
	private void checkShoe(Long shoeId) {
		if (shoeId == null || !shoes.existsById(shoeId)) throw ApiException.badRequest("shoeId " + shoeId + " 인 신발이 없다");
	}

	/** 키 순서는 기준선과 같게. likeCount 가 NULL 이면 키를 뺀다(시드 2건 · 새 리뷰). liked 는 늘 낸다(없음 = false 와 같다) */
	static Map<String, Object> toDoc(Review r) {
		Map<String, Object> d = new LinkedHashMap<>();
		d.put("id", r.getId());
		d.put("shoeId", r.getShoeId());
		d.put("author", r.getAuthor());
		d.put("rating", r.getRating());
		d.put("content", r.getContent());
		d.put("createdAt", Values.formatCreatedAt(r.getCreatedAt()));
		if (r.getLikeCount() != null) d.put("likeCount", r.getLikeCount());
		d.put("liked", Boolean.TRUE.equals(r.getLiked()));
		return d;
	}

	static void apply(Review r, Map<String, Object> body) {
		body.forEach((k, v) -> {
			switch (k) {
				case "shoeId" -> r.setShoeId(Values.id(k, v));
				case "author" -> r.setAuthor(Values.str(k, v));
				case "rating" -> r.setRating(Values.integer(k, v));
				case "content" -> r.setContent(Values.str(k, v));
				case "createdAt" -> r.setCreatedAt(Values.createdAt(v));
				case "likeCount" -> r.setLikeCount(Values.integer(k, v));
				case "liked" -> r.setLiked(Boolean.TRUE.equals(Values.bool(k, v)));
				default -> { }
			}
		});
	}
}
