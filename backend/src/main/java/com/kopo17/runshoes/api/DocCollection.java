package com.kopo17.runshoes.api;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * json-server 의 컬렉션 하나(/api/{name}) — 문서(Map)로 주고받는다. 키 순서는 기준선(contract/baseline/node)과 같게.
 * 응답에서 "키 없음"은 Map 에 키를 넣지 않는 것으로 낸다(예: reviews.likeCount 가 NULL).
 * viewer — 요청한 사람. 응답의 liked 를 그 사람 기준으로 내고, 쓰기 권한을 본다(404 → 403 순. 401 은 SecurityConfig 가 먼저)
 */
interface DocCollection {

	String name();

	/** GET 목록의 search 가 볼 필드 — 기본은 없음(search 무시) */
	default List<String> searchFields() {
		return List.of();
	}

	/** id(terms 는 row_no) 순 — json-server 의 삽입 순서 */
	List<Map<String, Object>> all(Viewer viewer);

	Optional<Map<String, Object>> get(long id, Viewer viewer);

	/** POST — 새 id 는 max+1 */
	Map<String, Object> create(Map<String, Object> body, Viewer viewer);

	/** PATCH — body 에 있는 키만(null 도) 바꾼다. 바꿀 수 없는 키는 버린다 */
	Optional<Map<String, Object>> patch(long id, Map<String, Object> body, Viewer viewer);

	/** PUT — body 로 통째로 바꾸고 id 만 남긴다 */
	Optional<Map<String, Object>> replace(long id, Map<String, Object> body, Viewer viewer);

	boolean delete(long id, Viewer viewer);
}
