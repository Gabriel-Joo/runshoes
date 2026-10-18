package com.kopo17.runshoes.api;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * json-server 의 컬렉션 하나(/api/{name}) — 문서(Map)로 주고받는다. 키 순서는 기준선(contract/baseline/node)과 같게.
 * 응답에서 "키 없음"은 Map 에 키를 넣지 않는 것으로 낸다(예: reviews.likeCount 가 NULL).
 */
interface DocCollection {

	String name();

	/** id(terms 는 row_no) 순 — json-server 의 삽입 순서 */
	List<Map<String, Object>> all();

	Optional<Map<String, Object>> get(long id);

	/** POST — body 에 id 가 있으면 그 id(이미 있으면 충돌), 없으면 max+1 */
	Map<String, Object> create(Map<String, Object> body);

	/** PATCH — body 에 있는 키만(null 도) 바꾼다. 모르는 키는 버린다 */
	Optional<Map<String, Object>> patch(long id, Map<String, Object> body);

	/** PUT — body 로 통째로 바꾸고 id 만 남긴다 */
	Optional<Map<String, Object>> replace(long id, Map<String, Object> body);

	boolean delete(long id);
}
