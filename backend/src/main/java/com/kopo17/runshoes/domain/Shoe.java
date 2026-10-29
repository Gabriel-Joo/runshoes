package com.kopo17.runshoes.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.type.SqlTypes;

/**
 * shoes — V1__schema.sql. id 는 앱이 매긴다(json-server 처럼 max+1, AUTO_INCREMENT 없음).
 * 숨긴 신발(V8 deleted_at)은 엔티티로 읽히지 않는다 — 목록 · 상세 · existsById · 찜 · 리뷰 쓰기에서 저절로 빠진다.
 * 숨긴 행까지 봐야 하는 곳(새 id · 세대 겹침 · 숨긴 목록 · 되살리기)은 ShoeRepository 의 native 쿼리.
 */
@Entity
@Table(name = "shoes")
@SQLRestriction("deleted_at IS NULL")
public class Shoe {

	@Id
	private Long id;

	private String brand;
	private String model;

	// 세대 구조(V4) — 같은 라인을 묶는 키 · 세대 번호 · 현행 여부 · 성별. 모두 NULL 허용(관리 화면 등록은 이 칸을 모른다 — V6 에서 조인다)
	@Column(name = "line_key")
	private String lineKey;

	private Integer generation;

	@Column(name = "is_current")
	private Boolean isCurrent;

	private String gender;
	private String purpose;
	private String stability;
	private String midsole;
	// 스펙은 제조사 공시값(V4 official_*)을 읽는다. 쓸 때는 옛 컬럼(weight · drop_mm · stack_height)에도 같은 값을 쓴다 —
	// 옛 이미지로 롤백해도 최신 값이 보이게. 옛 컬럼은 V6 에서 지우고 legacy* 도 같이 지운다
	@Column(name = "official_weight_g")
	private Double weight;

	@Column(name = "official_drop_mm")
	private Double drop;

	@Column(name = "official_heel_mm")
	private Double stackHeight;

	// 공시값의 기준 사이즈(V4) — 무게 'M9' · 'M10.5' …, NULL = 출처가 밝히지 않음. 스택 · 드롭 기준 사이즈는 대부분 NULL
	@Column(name = "official_weight_size")
	private String weightSize;

	@Column(name = "official_spec_size")
	private String specSize;

	// 실측값(V4) — 사람이 정한 것만(decisions.json measured_weight_g). 공시값과 따로 둔다
	@Column(name = "measured_weight_g")
	private Double measuredWeight;

	@Column(name = "measured_weight_size")
	private String measuredWeightSize;

	@Column(name = "measured_heel_mm")
	private Double measuredStackHeight;

	@Column(name = "measured_drop_mm")
	private Double measuredDrop;

	@Column(name = "measured_source")
	private String measuredSource;

	@Column(name = "measured_count")
	private Integer measuredCount;

	@Column(name = "weight")
	private Double legacyWeight;

	@Column(name = "drop_mm")
	private Double legacyDrop;

	@Column(name = "stack_height")
	private Double legacyStackHeight;

	// 발볼 = 토박스 너비(V4 toebox_width). 쓸 때는 옛 width 에도 같은 값을 쓴다 — V6 에서 지운다
	@Column(name = "toebox_width")
	private String width;

	@Column(name = "width")
	private String legacyWidth;

	@Column(name = "wide_available")
	private Boolean wideAvailable;

	private Boolean carbon;
	private Double price;

	// 가격 메타(V5) — 가격의 출처('공식몰' · 'ABC마트' · '다나와') · 읽은 날 · '정가'(다나와는 정가인지 기록이 없어 null)
	@Column(name = "price_source")
	private String priceSource;

	@Column(name = "price_checked_at")
	private LocalDate priceCheckedAt;

	@Column(name = "price_kind")
	private String priceKind;

	// 스펙 출처(V6) — {"weight":{"code":"BITR","url":"…"}, …}. 칸 · 코드 형식은 api/SpecSources 가 본다
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(name = "spec_sources", columnDefinition = "json")
	private Map<String, Map<String, String>> specSources;

	// 숨긴 때(V8) — 엔티티로 읽히는 행은 늘 NULL(@SQLRestriction). 숨기기 · 되살리기는 ShoeRepository native
	@Column(name = "deleted_at")
	private LocalDateTime deletedAt;

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
	public String getLineKey() { return lineKey; }
	public void setLineKey(String lineKey) { this.lineKey = lineKey; }
	public Integer getGeneration() { return generation; }
	public void setGeneration(Integer generation) { this.generation = generation; }
	public Boolean getIsCurrent() { return isCurrent; }
	public void setIsCurrent(Boolean isCurrent) { this.isCurrent = isCurrent; }
	public String getGender() { return gender; }
	public void setGender(String gender) { this.gender = gender; }
	public String getWeightSize() { return weightSize; }
	public void setWeightSize(String weightSize) { this.weightSize = weightSize; }
	public String getSpecSize() { return specSize; }
	public void setSpecSize(String specSize) { this.specSize = specSize; }
	public Double getMeasuredWeight() { return measuredWeight; }
	public void setMeasuredWeight(Double measuredWeight) { this.measuredWeight = measuredWeight; }
	public String getMeasuredWeightSize() { return measuredWeightSize; }
	public void setMeasuredWeightSize(String measuredWeightSize) { this.measuredWeightSize = measuredWeightSize; }
	public Double getMeasuredStackHeight() { return measuredStackHeight; }
	public void setMeasuredStackHeight(Double measuredStackHeight) { this.measuredStackHeight = measuredStackHeight; }
	public Double getMeasuredDrop() { return measuredDrop; }
	public void setMeasuredDrop(Double measuredDrop) { this.measuredDrop = measuredDrop; }
	public String getMeasuredSource() { return measuredSource; }
	public void setMeasuredSource(String measuredSource) { this.measuredSource = measuredSource; }
	public Integer getMeasuredCount() { return measuredCount; }
	public void setMeasuredCount(Integer measuredCount) { this.measuredCount = measuredCount; }
	public String getPurpose() { return purpose; }
	public void setPurpose(String purpose) { this.purpose = purpose; }
	public String getStability() { return stability; }
	public void setStability(String stability) { this.stability = stability; }
	public String getMidsole() { return midsole; }
	public void setMidsole(String midsole) { this.midsole = midsole; }
	public Double getWeight() { return weight; }
	public void setWeight(Double weight) { this.weight = weight; this.legacyWeight = weight; }
	public Double getDrop() { return drop; }
	public void setDrop(Double drop) { this.drop = drop; this.legacyDrop = drop; }
	public Double getStackHeight() { return stackHeight; }
	public void setStackHeight(Double stackHeight) { this.stackHeight = stackHeight; this.legacyStackHeight = stackHeight; }
	public String getWidth() { return width; }
	public void setWidth(String width) { this.width = width; this.legacyWidth = width; }
	public Boolean getWideAvailable() { return wideAvailable; }
	public void setWideAvailable(Boolean wideAvailable) { this.wideAvailable = wideAvailable; }
	public Boolean getCarbon() { return carbon; }
	public void setCarbon(Boolean carbon) { this.carbon = carbon; }
	public Double getPrice() { return price; }
	public void setPrice(Double price) { this.price = price; }
	public String getPriceSource() { return priceSource; }
	public void setPriceSource(String priceSource) { this.priceSource = priceSource; }
	public LocalDate getPriceCheckedAt() { return priceCheckedAt; }
	public void setPriceCheckedAt(LocalDate priceCheckedAt) { this.priceCheckedAt = priceCheckedAt; }
	public String getPriceKind() { return priceKind; }
	public void setPriceKind(String priceKind) { this.priceKind = priceKind; }
	public Map<String, Map<String, String>> getSpecSources() { return specSources; }
	public void setSpecSources(Map<String, Map<String, String>> specSources) { this.specSources = specSources; }
	public LocalDateTime getDeletedAt() { return deletedAt; }
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
