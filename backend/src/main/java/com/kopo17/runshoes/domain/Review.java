package com.kopo17.runshoes.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/**
 * reviews — created_at 은 UTC(DATETIME(3)). like_count 는 NULL 이면 응답에서 키를 뺀다(json-server 에서 키가 없던 것).
 * V3: user_id(작성자) · review_type(FIRST/FOLLOWUP) 과 실사용 후기 칸. first_shoe_id 는 DB 가 만드는 VIRTUAL 칸이라 매핑하지 않는다.
 * liked 는 V3 전의 공용 칸 — 읽지 않는다(사용자별은 review_likes). V4 에서 지운다.
 */
@Entity
@Table(name = "reviews")
public class Review {

	@Id
	private Long id;

	@Column(name = "shoe_id")
	private Long shoeId;

	@Column(name = "user_id")
	private Long userId;

	private String author;
	private Integer rating;

	@Column(columnDefinition = "text")
	private String content;

	@Column(name = "created_at")
	private LocalDateTime createdAt;

	@Column(name = "like_count")
	private Integer likeCount;

	private Boolean liked;

	public static final String FIRST = "FIRST";

	@Column(name = "review_type")
	private String reviewType;

	@Column(name = "parent_review_id")
	private Long parentReviewId;

	@Column(name = "distance_km")
	private Double distanceKm;

	@Column(name = "proof_image_url")
	private String proofImageUrl;

	private Boolean verified;

	@Column(name = "verified_at")
	private LocalDateTime verifiedAt;

	@Column(name = "verified_by")
	private Long verifiedBy;

	public Long getId() { return id; }
	public void setId(Long id) { this.id = id; }
	public Long getShoeId() { return shoeId; }
	public void setShoeId(Long shoeId) { this.shoeId = shoeId; }
	public String getAuthor() { return author; }
	public void setAuthor(String author) { this.author = author; }
	public Integer getRating() { return rating; }
	public void setRating(Integer rating) { this.rating = rating; }
	public String getContent() { return content; }
	public void setContent(String content) { this.content = content; }
	public LocalDateTime getCreatedAt() { return createdAt; }
	public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
	public Integer getLikeCount() { return likeCount; }
	public void setLikeCount(Integer likeCount) { this.likeCount = likeCount; }
	public Boolean getLiked() { return liked; }
	public void setLiked(Boolean liked) { this.liked = liked; }
	public Long getUserId() { return userId; }
	public void setUserId(Long userId) { this.userId = userId; }
	public String getReviewType() { return reviewType; }
	public void setReviewType(String reviewType) { this.reviewType = reviewType; }
	public Long getParentReviewId() { return parentReviewId; }
	public Double getDistanceKm() { return distanceKm; }
	public String getProofImageUrl() { return proofImageUrl; }
	public Boolean getVerified() { return verified; }
	public void setVerified(Boolean verified) { this.verified = verified; }
}
