package com.kopo17.runshoes.api;

import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * json-server 0.17.4 의 REST 라우터(/api/{name}, /api/{name}/{id})를 그대로 — 계약은 contract/baseline/node.
 * 없는 컬렉션 · 없는 id · 비숫자 id · 그 밖의 /api 경로는 전부 404 {}. 응답 헤더(CORS · Cache-Control)는 ApiHeadersFilter.
 */
@RestController
@RequestMapping("/api")
class JsonServerController {

	private final Map<String, DocCollection> collections;
	/** 새 id(max+1)를 매기는 동안 쓰기를 한 줄로 — json-server 도 한 프로세스가 차례로 쓴다. Pod 가 둘이면 PK 충돌이 500 으로 드러난다 */
	private final ReentrantLock writeLock = new ReentrantLock();

	JsonServerController(List<DocCollection> collections) {
		this.collections = collections.stream().collect(Collectors.toMap(DocCollection::name, Function.identity()));
	}

	@GetMapping({"/{name}", "/{name}/"})
	ResponseEntity<Object> list(@PathVariable String name, @RequestParam MultiValueMap<String, String> query) {
		DocCollection c = collection(name);
		ListQuery.Result r = ListQuery.apply(c.all(), query, c.searchFields());
		ResponseEntity.BodyBuilder ok = ResponseEntity.ok();
		if (r.totalCount() != null) {
			ok.header("X-Total-Count", String.valueOf(r.totalCount()));
			ok.header(HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS, "X-Total-Count");
		}
		return ok.body(r.items());
	}

	@GetMapping("/{name}/{id}")
	Object show(@PathVariable String name, @PathVariable String id) {
		return collection(name).get(id(id)).orElseThrow(ApiException::notFound);
	}

	@PostMapping({"/{name}", "/{name}/"})
	ResponseEntity<Object> create(@PathVariable String name, @RequestBody(required = false) Map<String, Object> body,
			HttpServletRequest req) {
		DocCollection c = collection(name);
		Map<String, Object> doc = locked(() -> c.create(body == null ? Map.of() : body));
		// json-server: Location = 요청 전체 URL + "/" + id, 그리고 Expose-Headers 에 Location
		URI location = ServletUriComponentsBuilder.fromRequestUri(req).path("/{id}").buildAndExpand(doc.get("id")).toUri();
		return ResponseEntity.created(location).header(HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS, "Location").body(doc);
	}

	@PatchMapping("/{name}/{id}")
	Object patch(@PathVariable String name, @PathVariable String id, @RequestBody(required = false) Map<String, Object> body) {
		DocCollection c = collection(name);
		long n = id(id);
		return locked(() -> c.patch(n, body == null ? Map.of() : body)).orElseThrow(ApiException::notFound);
	}

	@PutMapping("/{name}/{id}")
	Object replace(@PathVariable String name, @PathVariable String id, @RequestBody(required = false) Map<String, Object> body) {
		DocCollection c = collection(name);
		long n = id(id);
		return locked(() -> c.replace(n, body == null ? Map.of() : body)).orElseThrow(ApiException::notFound);
	}

	/** json-server 는 지운 문서가 아니라 {} 를 돌려준다(기준선 44 · 48) */
	@DeleteMapping("/{name}/{id}")
	Object delete(@PathVariable String name, @PathVariable String id) {
		DocCollection c = collection(name);
		long n = id(id);
		if (!locked(() -> c.delete(n))) throw ApiException.notFound();
		return Map.of();
	}

	/** 그 밖의 /api 경로(/api/db, /api/shoes/1/foo, POST /api/shoes/1 …) — json-server 마지막 미들웨어처럼 404 {} */
	@RequestMapping("/**")
	Object fallback() {
		throw ApiException.notFound();
	}

	private DocCollection collection(String name) {
		DocCollection c = collections.get(name);
		if (c == null) throw ApiException.notFound();
		return c;
	}

	/** json-server getById 는 String(doc.id) === id — "abc" · "01" · "1.0" 은 없는 id 다 */
	private static long id(String raw) {
		try {
			long n = Long.parseLong(raw);
			if (Long.toString(n).equals(raw)) return n;
		} catch (NumberFormatException ignored) { }
		throw ApiException.notFound();
	}

	private <T> T locked(Supplier<T> work) {
		writeLock.lock();
		try {
			return work.get();
		} finally {
			writeLock.unlock();
		}
	}
}
