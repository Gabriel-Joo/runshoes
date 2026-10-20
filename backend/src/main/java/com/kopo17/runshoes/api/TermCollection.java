package com.kopo17.runshoes.api;

import com.kopo17.runshoes.domain.Term;
import com.kopo17.runshoes.domain.TermRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * /api/terms — 읽기 전용. 프런트는 용어를 읽기만 한다(TermTooltip). id 12 가 둘이라(V1__schema.sql) 단건 조회는 json-server 처럼 앞의 것.
 * 쓰기는 405 — json-server 는 받았지만 쓰는 곳이 없어 재현하지 않는다(contract 시나리오에 없음).
 */
@Component
class TermCollection implements DocCollection {

	private final TermRepository terms;

	TermCollection(TermRepository terms) {
		this.terms = terms;
	}

	@Override
	public String name() { return "terms"; }

	@Override
	@Transactional(readOnly = true)
	public List<Map<String, Object>> all(Viewer viewer) {
		return terms.findAll(Sort.by("rowNo")).stream().map(TermCollection::toDoc).toList();
	}

	@Override
	public Optional<Map<String, Object>> get(long id, Viewer viewer) {
		return all(viewer).stream().filter(t -> Long.valueOf(id).equals(t.get("id"))).findFirst();
	}

	@Override
	public Map<String, Object> create(Map<String, Object> body, Viewer viewer) { throw readOnly(); }

	@Override
	public Optional<Map<String, Object>> patch(long id, Map<String, Object> body, Viewer viewer) { throw readOnly(); }

	@Override
	public Optional<Map<String, Object>> replace(long id, Map<String, Object> body, Viewer viewer) { throw readOnly(); }

	@Override
	public boolean delete(long id, Viewer viewer) { throw readOnly(); }

	private static ApiException readOnly() {
		return new ApiException(HttpStatus.METHOD_NOT_ALLOWED, "terms 는 읽기 전용");
	}

	static Map<String, Object> toDoc(Term t) {
		Map<String, Object> d = new LinkedHashMap<>();
		d.put("id", t.getId());
		d.put("key", t.getKey());
		d.put("name", t.getName());
		d.put("short", t.getShortText());
		d.put("description", t.getDescription());
		return d;
	}
}
