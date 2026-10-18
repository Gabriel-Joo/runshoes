package com.kopo17.runshoes.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.List;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** shoes — V1__schema.sql. id 는 앱이 매긴다(json-server 처럼 max+1, AUTO_INCREMENT 없음). */
@Entity
@Table(name = "shoes")
public class Shoe {

	@Id
	private Long id;

	private String brand;
	private String model;
	private String purpose;
	private String stability;
	private String midsole;
	private Double weight;

	@Column(name = "drop_mm")
	private Double drop;

	@Column(name = "stack_height")
	private Double stackHeight;

	private String width;

	@Column(name = "wide_available")
	private Boolean wideAvailable;

	private Boolean carbon;
	private Double price;
	private String image;

	@JdbcTypeCode(SqlTypes.JSON)
	@Column(columnDefinition = "json")
	private List<String> images;

	private String summary;

	@Column(columnDefinition = "text")
	private String description;

	private Double rating;

	@Column(name = "review_count")
	private Integer reviewCount;

	@Column(name = "like_count")
	private Integer likeCount;

	private Boolean liked;

	public Long getId() { return id; }
	public void setId(Long id) { this.id = id; }
	public String getBrand() { return brand; }
	public void setBrand(String brand) { this.brand = brand; }
	public String getModel() { return model; }
	public void setModel(String model) { this.model = model; }
	public String getPurpose() { return purpose; }
	public void setPurpose(String purpose) { this.purpose = purpose; }
	public String getStability() { return stability; }
	public void setStability(String stability) { this.stability = stability; }
	public String getMidsole() { return midsole; }
	public void setMidsole(String midsole) { this.midsole = midsole; }
	public Double getWeight() { return weight; }
	public void setWeight(Double weight) { this.weight = weight; }
	public Double getDrop() { return drop; }
	public void setDrop(Double drop) { this.drop = drop; }
	public Double getStackHeight() { return stackHeight; }
	public void setStackHeight(Double stackHeight) { this.stackHeight = stackHeight; }
	public String getWidth() { return width; }
	public void setWidth(String width) { this.width = width; }
	public Boolean getWideAvailable() { return wideAvailable; }
	public void setWideAvailable(Boolean wideAvailable) { this.wideAvailable = wideAvailable; }
	public Boolean getCarbon() { return carbon; }
	public void setCarbon(Boolean carbon) { this.carbon = carbon; }
	public Double getPrice() { return price; }
	public void setPrice(Double price) { this.price = price; }
	public String getImage() { return image; }
	public void setImage(String image) { this.image = image; }
	public List<String> getImages() { return images; }
	public void setImages(List<String> images) { this.images = images; }
	public String getSummary() { return summary; }
	public void setSummary(String summary) { this.summary = summary; }
	public String getDescription() { return description; }
	public void setDescription(String description) { this.description = description; }
	public Double getRating() { return rating; }
	public void setRating(Double rating) { this.rating = rating; }
	public Integer getReviewCount() { return reviewCount; }
	public void setReviewCount(Integer reviewCount) { this.reviewCount = reviewCount; }
	public Integer getLikeCount() { return likeCount; }
	public void setLikeCount(Integer likeCount) { this.likeCount = likeCount; }
	public Boolean getLiked() { return liked; }
	public void setLiked(Boolean liked) { this.liked = liked; }
}
