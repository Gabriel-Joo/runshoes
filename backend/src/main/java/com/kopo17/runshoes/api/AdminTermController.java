package com.kopo17.runshoes.api;

import com.kopo17.runshoes.activity.ActivityLogger;
import com.kopo17.runshoes.activity.ActivityLogger.Entry;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 용어 사전에 더하기(관리자 마이페이지의 챗봇 문의 → 사전 추가, 2026-11-14 사용자). terms 는 DB 에 있고 쓰기만 막혀 있었다.
 * POST /api/admin/terms  본문 {key, name, short, description} → 201 {id, key, name, short, description}. admin 만(데모 관리자 403 demo_admin).
 *   key  영문 소문자로 시작하는 영문 · 숫자 2~50자, 겹치면 409 term_exists. 화면 · 챗봇이 쓰는 key(wideAvailable · stabilityPair)도 409
 *   name 1~100자, 이름이 같은 용어가 있으면 409(대소문자 같게 — collation)
 *   short 1~200자, description 1~2,000자. 틀리면 400 {code:"invalid", message}
 * id 는 지금 가장 큰 id + 1(행 키는 row_no — V1). 지우기 · 고치기는 두지 않는다(지시 범위 밖 — 잘못 넣으면 사람이 DB 에서).
 * /api/terms 의 쓰기(json-server 꼴)는 그대로 405 — 계약(contract) 그대로 둔다.
 * 챗봇은 바로 쓴다 — 카탈로그 판(CatalogVersionController)에 terms 체크섬이 들어 있어 다음 턴에 /api/terms 를 다시 읽고,
 *   사전(chatbot/terms.py Dictionary)이 용어 이름으로 문장에서 찾는다.
 */
@RestController
class AdminTermController {

	/** 챗봇 · 화면이 따로 가진 용어의 key(chatbot/terms.py WIDE_TERM · stability_term) — DB 에 넣으면 겹친다 */
	private static final Set<String> RESERVED = Set.of("wideAvailable", "stabilityPair");

	private final JdbcTemplate jdbc;
	private final ActivityLogger activity;

	AdminTermController(JdbcTemplate jdbc, ActivityLogger activity) {
		this.jdbc = jdbc;
		this.activity = activity;
	}

	@PostMapping("/api/admin/terms")
	@Transactional
	ResponseEntity<Map<String, Object>> create(@RequestBody(required = false) Map<String, Object> body) {
		Viewer viewer = Viewer.current();
		viewer.requireAdmin();
		if (body == null) throw ApiException.invalid("key · name · short · description 을 보내 주세요.");
		String key = text(body, "key", "key", 50);
		if (!key.matches("[a-z][A-Za-z0-9]{1,49}")) throw ApiException.invalid("key 는 영문 소문자로 시작하는 영문 · 숫자 2~50자예요(예: heelCounter).");
		String name = text(body, "name", "이름", 100);
		String shortText = text(body, "short", "한 줄 설명", 200);
		String description = text(body, "description", "설명", 2000);
		jdbc.queryForList("SELECT row_no FROM terms FOR UPDATE");   // 같은 때 둘이 더해도 id 가 겹치지 않게(13행)
		if (RESERVED.contains(key) || count("term_key = ?", key) > 0) throw ApiException.state("term_exists", "key '" + key + "' 는 이미 있어요.");
		if (count("name = ?", name) > 0) throw ApiException.state("term_exists", "'" + name + "' 용어는 이미 사전에 있어요.");
		long id = jdbc.queryForObject("SELECT COALESCE(MAX(id), 0) + 1 FROM terms", Long.class);
		jdbc.update("INSERT INTO terms (id, term_key, name, short, description) VALUES (?, ?, ?, ?, ?)", id, key, name, shortText, description);
		activity.log(new Entry("admin.term.create", viewer.userId(), "term", id, Map.of("key", key, "name", name)));
		Map<String, Object> d = new LinkedHashMap<>();
		d.put("id", id);
		d.put("key", key);
		d.put("name", name);
		d.put("short", shortText);
		d.put("description", description);
		return ResponseEntity.status(HttpStatus.CREATED).body(d);
	}

	private int count(String where, Object arg) {
		Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM terms WHERE " + where, Integer.class, arg);
		return n == null ? 0 : n;
	}

	/** 앞뒤 공백을 뺀 글, 1~max 자(코드포인트) */
	private static String text(Map<String, Object> body, String field, String label, int max) {
		if (!(body.get(field) instanceof String s) || s.isBlank()) throw ApiException.invalid(label + "을(를) 적어 주세요.");
		String v = s.strip();
		if (v.codePointCount(0, v.length()) > max) throw ApiException.invalid(label + "은(는) " + max + "자까지예요.");
		return v;
	}
}
