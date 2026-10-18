package com.kopo17.runshoes.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/** reviews — created_at 은 UTC(DATETIME(3)). like_count 는 NULL 이면 응답에서 키를 뺀다(json-server 에서 키가 없던 것). */
@Entity
@Table(name = "reviews")
public class Review {

	@Id
	private Long id;

	@Column(name = "shoe_id")
	private Long shoeId;

	private String author;
	private Integer rating;

	@Column(columnDefinition = "text")
	private String content;

	@Column(name = "created_at")
	private LocalDateTime createdAt;

	@Column(name = "like_count")
	private Integer likeCount;

	private Boolean liked;

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
}
