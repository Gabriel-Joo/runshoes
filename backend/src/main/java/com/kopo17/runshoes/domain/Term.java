package com.kopo17.runshoes.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** terms — 시드에 id 12 가 둘이라 id 는 키가 아니다. 순서와 키는 row_no(V1__schema.sql). 읽기 전용(프런트에 쓰기 없음). */
@Entity
@Table(name = "terms")
public class Term {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "row_no")
	private Integer rowNo;

	private Long id;

	@Column(name = "term_key")
	private String key;

	private String name;

	@Column(name = "short")
	private String shortText;

	@Column(columnDefinition = "text")
	private String description;

	public Integer getRowNo() { return rowNo; }
	public Long getId() { return id; }
	public String getKey() { return key; }
	public String getName() { return name; }
	public String getShortText() { return shortText; }
	public String getDescription() { return description; }
}
