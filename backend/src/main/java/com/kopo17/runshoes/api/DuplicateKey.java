package com.kopo17.runshoes.api;

import org.springframework.dao.DataIntegrityViolationException;

/**
 * 어떤 UNIQUE · PK 에 걸렸는가 — MySQL 메시지 "Duplicate entry '…' for key 'reviews.uk_reviews_user_first_shoe'" 의 key 이름으로 가른다(2026-11-01).
 * 예전에는 리뷰 저장 오류를 모두 409 "이미 리뷰를 썼다"로 돌려, 배포 중 id(PK) 충돌도 그렇게 보였다
 */
final class DuplicateKey {

	private DuplicateKey() {}

	static boolean is(DataIntegrityViolationException e, String key) {
		String k = key(e);
		return k != null && (k.equals(key) || k.endsWith("." + key));
	}

	/** 'reviews.PRIMARY' 같은 key 이름 — 중복 오류가 아니면 null */
	static String key(DataIntegrityViolationException e) {
		String m = e.getMostSpecificCause().getMessage();
		if (m == null) return null;
		int at = m.indexOf("for key '");
		if (at < 0) return null;
		int end = m.indexOf('\'', at + 9);
		return end < 0 ? null : m.substring(at + 9, end);
	}
}
