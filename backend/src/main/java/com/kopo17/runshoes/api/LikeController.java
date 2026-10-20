package com.kopo17.runshoes.api;

import com.kopo17.runshoes.activity.ActivityLogger;
import com.kopo17.runshoes.activity.ActivityLogger.Entry;
import com.kopo17.runshoes.domain.Review;
import com.kopo17.runshoes.domain.ReviewRepository;
import com.kopo17.runshoes.domain.ShoeRepository;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 찜 · 리뷰 공감 — PUT 은 켠다, DELETE 는 끈다(몇 번 보내도 같다). 응답 {liked, likeCount} — 숫자는 서버가 센다(예전에는 프런트가 계산해 PATCH 했다).
 * 로그인해야 한다(401 — SecurityConfig). 없는 신발 · 리뷰는 404. 내 리뷰에는 공감할 수 없다(403).
 * json-server 계약 밖(docs/AUTH_DESIGN.md 2절).
 */
@RestController
@RequestMapping("/api")
class LikeController {

	private final ShoeRepository shoes;
	private final ReviewRepository reviews;
	private final Likes likes;
	private final ActivityLogger activity;

	LikeController(ShoeRepository shoes, ReviewRepository reviews, Likes likes, ActivityLogger activity) {
		this.shoes = shoes;
		this.reviews = reviews;
		this.likes = likes;
		this.activity = activity;
	}

	@PutMapping("/shoes/{id}/like")
	@Transactional
	public Map<String, Object> likeShoe(@PathVariable String id) {
		long userId = Viewer.current().requireUser(), shoeId = shoe(id);
		if (likes.likeShoe(userId, shoeId)) activity.log(Entry.of("like.add", userId, "shoe", shoeId));
		return state(true, likes.shoeLikeCount(shoeId));
	}

	@DeleteMapping("/shoes/{id}/like")
	@Transactional
	public Map<String, Object> unlikeShoe(@PathVariable String id) {
		long userId = Viewer.current().requireUser(), shoeId = shoe(id);
		if (likes.unlikeShoe(userId, shoeId)) activity.log(Entry.of("like.remove", userId, "shoe", shoeId));
		return state(false, likes.shoeLikeCount(shoeId));
	}

	@PutMapping("/reviews/{id}/like")
	@Transactional
	public Map<String, Object> likeReview(@PathVariable String id) {
		Viewer v = Viewer.current();
		long userId = v.requireUser();
		Review r = review(id);
		if (v.owns(r.getUserId())) throw ApiException.forbidden("내 리뷰에는 공감하지 않는다");
		if (likes.likeReview(userId, r.getId())) activity.log(Entry.of("review_like.add", userId, "review", r.getId()));
		return state(true, likes.reviewLikeCount(r.getId()));
	}

	@DeleteMapping("/reviews/{id}/like")
	@Transactional
	public Map<String, Object> unlikeReview(@PathVariable String id) {
		long userId = Viewer.current().requireUser();
		Review r = review(id);
		if (likes.unlikeReview(userId, r.getId())) activity.log(Entry.of("review_like.remove", userId, "review", r.getId()));
		return state(false, likes.reviewLikeCount(r.getId()));
	}

	private long shoe(String raw) {
		long id = JsonServerController.id(raw);
		if (!shoes.existsById(id)) throw ApiException.notFound();
		return id;
	}

	private Review review(String raw) {
		return reviews.findById(JsonServerController.id(raw)).orElseThrow(ApiException::notFound);
	}

	private static Map<String, Object> state(boolean liked, int likeCount) {
		Map<String, Object> d = new LinkedHashMap<>();
		d.put("liked", liked);
		d.put("likeCount", likeCount);
		return d;
	}
}
