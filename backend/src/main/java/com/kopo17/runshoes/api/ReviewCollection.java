package com.kopo17.runshoes.api;

import com.kopo17.runshoes.activity.ActivityLogger;
import com.kopo17.runshoes.activity.ActivityLogger.Entry;
import com.kopo17.runshoes.domain.Review;
import com.kopo17.runshoes.domain.ReviewRepository;
import com.kopo17.runshoes.domain.ShoeRepository;
import com.kopo17.runshoes.domain.User;
import com.kopo17.runshoes.domain.UserRepository;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * /api/reviews — 쓰기는 로그인한 사람만(401 은 SecurityConfig).
 * POST: 작성자 · 닉네임 · 시각은 서버가 정한다(본문의 author · createdAt · likeCount · liked · id 는 버린다 — 실사용 후기의 "30일 뒤"가 서버 시각이어야 한다).
 *       한 신발에 첫 리뷰 하나(409). 별점 1~5 · 내용 10~300자(400, 2026-10-30)
 * PATCH: 작성자만(403), rating · content 만 — 다른 키는 버린다. DELETE: 작성자 또는 admin. PUT: 405(아무 필드나 덮어쓰는 길을 열지 않는다)
 * 데모 관리자(V7)는 쓰기 · 고치기 · 지우기 모두 403 demo_admin. 탈퇴 회원(V9)의 리뷰는 남는다(작성자 "탈퇴 회원").
 * 숨긴 신발(V8)의 리뷰는 없는 것으로 본다 — 목록에서 빠지고 GET · PATCH · DELETE 는 404(DB 에는 남는다, 되살리면 돌아온다).
 * 쓰고 · 고치고 · 지우면 신발의 rating · reviewCount 를 다시 센다(Ratings).
 */
@Component
class ReviewCollection implements DocCollection {

	private final ReviewRepository reviews;
	private final ShoeRepository shoes;
	private final UserRepository users;
	private final Likes likes;
	private final Ratings ratings;
	private final ActivityLogger activity;

	ReviewCollection(ReviewRepository reviews, ShoeRepository shoes, UserRepository users, Likes likes, Ratings ratings, ActivityLogger activity) {
		this.reviews = reviews;
		this.shoes = shoes;
		this.users = users;
		this.likes = likes;
		this.ratings = ratings;
		this.activity = activity;
	}

	@Override
	public String name() { return "reviews"; }

	@Override
	@Transactional(readOnly = true)
	public List<Map<String, Object>> all(Viewer viewer) {
		Set<Long> liked = likes.reviewsLikedBy(viewer.userId());
		Set<Long> hidden = Set.copyOf(shoes.hiddenIds());
		return reviews.findAll(Sort.by("id")).stream().filter(r -> !hidden.contains(r.getShoeId())).map(r -> toDoc(r, liked.contains(r.getId()))).toList();
	}

	/** 숨긴 신발의 리뷰는 없는 것과 같다 */
	private Optional<Review> visible(long id) {
		return reviews.findById(id).filter(r -> r.getShoeId() == null || shoes.existsById(r.getShoeId()));
	}

	@Override
	@Transactional(readOnly = true)
	public Optional<Map<String, Object>> get(long id, Viewer viewer) {
		Set<Long> liked = likes.reviewsLikedBy(viewer.userId());
		return visible(id).map(r -> toDoc(r, liked.contains(r.getId())));
	}

	@Override
	@Transactional
	public Map<String, Object> create(Map<String, Object> body, Viewer viewer) {
		long userId = viewer.requireWriter();
		User author = users.findById(userId).filter(u -> !u.isWithdrawn()).orElseThrow(ApiException::unauthorized);
		Long shoeId = Values.id("shoeId", body.get("shoeId"));
		if (shoeId == null || !shoes.existsById(shoeId)) throw ApiException.badRequest("shoeId " + shoeId + " 인 신발이 없다");
		int rating = ReviewRules.rating(body.get("rating"));
		String content = ReviewRules.content(body.get("content"));
		if (reviews.existsByUserIdAndShoeIdAndReviewType(userId, shoeId, Review.FIRST)) throw ApiException.reviewExists();

		Review r = new Review();
		Long max = reviews.maxId();
		r.setId(max == null ? 1 : max + 1);
		r.setShoeId(shoeId);
		r.setUserId(userId);
		r.setAuthor(author.getNickname());
		r.setRating(rating);
		r.setContent(content);
		r.setCreatedAt(Values.nowUtc().truncatedTo(ChronoUnit.MILLIS));
		r.setLiked(false);
		r.setReviewType(Review.FIRST);
		r.setVerified(false);
		try {
			r = reviews.saveAndFlush(r);
		} catch (DataIntegrityViolationException e) {           // 같은 순간 두 번 — UNIQUE 가 막는다
			throw ApiException.reviewExists();
		}
		ratings.recompute(shoeId);
		activity.log(Entry.of("review.create", userId, "review", r.getId()).meta(Map.of("shoeId", shoeId)));
		return toDoc(r, false);
	}

	@Override
	@Transactional
	public Optional<Map<String, Object>> patch(long id, Map<String, Object> body, Viewer viewer) {
		return visible(id).map(r -> {
			if (viewer.demoAdmin()) throw ApiException.demoAdmin();
			if (!viewer.owns(r.getUserId())) throw ApiException.forbidden("작성자만 고친다");
			if (body.containsKey("rating")) r.setRating(ReviewRules.rating(body.get("rating")));
			if (body.containsKey("content")) r.setContent(ReviewRules.content(body.get("content")));
			r = reviews.saveAndFlush(r);
			ratings.recompute(r.getShoeId());
			activity.log(Entry.of("review.update", viewer.userId(), "review", r.getId()).meta(Map.of("shoeId", r.getShoeId())));
			return toDoc(r, likes.likesReview(viewer.userId(), r.getId()));
		});
	}

	@Override
	public Optional<Map<String, Object>> replace(long id, Map<String, Object> body, Viewer viewer) {
		throw ApiException.methodNotAllowed("리뷰는 PUT 으로 바꾸지 않는다 — PATCH(rating · content)");
	}

	@Override
	@Transactional
	public boolean delete(long id, Viewer viewer) {
		Optional<Review> found = visible(id);
		if (found.isEmpty()) return false;
		Review r = found.get();
		if (viewer.demoAdmin()) throw ApiException.demoAdmin();
		if (!viewer.owns(r.getUserId()) && !viewer.admin()) throw ApiException.forbidden("작성자 또는 admin 만 지운다");
		reviews.delete(r);
		reviews.flush();                                        // 실사용 후기는 FK(ON DELETE CASCADE)가 같이 지운다
		ratings.recompute(r.getShoeId());
		// 지운 사람(작성자 또는 admin)이 user_id, 원래 작성자는 meta — 지워진 리뷰는 조인할 수 없다
		activity.log(Entry.of("review.delete", viewer.userId(), "review", r.getId())
				.meta(r.getUserId() == null ? Map.of("shoeId", r.getShoeId()) : Map.of("shoeId", r.getShoeId(), "authorId", r.getUserId())));
		return true;
	}

	/**
	 * 키 순서는 기준선과 같게, V3 의 키는 뒤에. likeCount 가 NULL 이면 키를 뺀다(시드 2건 · 새 리뷰).
	 * liked 는 요청한 사람이 공감했는지(review_likes) — 로그인하지 않았으면 false
	 */
	static Map<String, Object> toDoc(Review r, boolean liked) {
		Map<String, Object> d = new LinkedHashMap<>();
		d.put("id", r.getId());
		d.put("shoeId", r.getShoeId());
		d.put("userId", r.getUserId());
		d.put("author", r.getAuthor());
		d.put("rating", r.getRating());
		d.put("content", r.getContent());
		d.put("createdAt", Values.formatCreatedAt(r.getCreatedAt()));
		if (r.getLikeCount() != null) d.put("likeCount", r.getLikeCount());
		d.put("liked", liked);
		d.put("reviewType", r.getReviewType());
		d.put("parentReviewId", r.getParentReviewId());
		d.put("distanceKm", r.getDistanceKm());
		d.put("proofImageUrl", r.getProofImageUrl());
		d.put("verified", Boolean.TRUE.equals(r.getVerified()));
		return d;
	}
}
