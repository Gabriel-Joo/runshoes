package com.kopo17.runshoes.api;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 스펙 출처(V6 spec_sources) — {"weight":{"code":"BITR","url":"https://…"}, …}. docs/ADMIN_DEMO_DESIGN.md 2.1 · 6.1.
 * 칸: weight · drop · stackHeight · midsole · width · wideAvailable(카본 플레이트는 출처 면제). 다른 칸은 400.
 * 코드: BITR · RSG · STORE · PR · WEB · MAN — 관리 화면이 고른다. DB · SX 는 적재기가 기존 값에만 단다(화면 선택지에는 없다).
 * url: WEB 은 필수, 나머지는 선택. http(s) 만, 500자까지. 빈 객체 · null 칸은 출처 없음으로 본다(키를 뺀다).
 */
final class SpecSources {

	static final List<String> FIELDS = List.of("weight", "drop", "stackHeight", "midsole", "width", "wideAvailable");
	static final Set<String> CODES = Set.of("BITR", "RSG", "STORE", "PR", "WEB", "MAN", "DB", "SX");

	private SpecSources() {}

	static Map<String, Map<String, String>> parse(Object v) {
		if (v == null) return null;
		if (!(v instanceof Map<?, ?> m)) throw ApiException.invalid("specSources 는 객체여야 한다");
		Map<String, Map<String, String>> out = new LinkedHashMap<>();
		for (Map.Entry<?, ?> e : m.entrySet()) {
			String field = String.valueOf(e.getKey());
			if (!FIELDS.contains(field)) throw ApiException.invalid("specSources 에 모르는 칸: " + field);
			if (e.getValue() == null) continue;
			if (!(e.getValue() instanceof Map<?, ?> src)) throw ApiException.invalid("specSources." + field + " 는 {code, url} 이어야 한다");
			Object code = src.get("code"), url = src.get("url");
			if (code == null && (url == null || "".equals(url))) continue;
			if (!(code instanceof String c) || !CODES.contains(c)) throw ApiException.invalid("specSources." + field + ".code 는 BITR · RSG · STORE · PR · WEB · MAN 중 하나");
			Map<String, String> s = new LinkedHashMap<>();
			s.put("code", c);
			if (url != null && !"".equals(url)) {
				if (!(url instanceof String u) || u.length() > 500 || !u.matches("^https?://\\S+$")) throw ApiException.invalid("specSources." + field + ".url 은 http(s) 주소");
				s.put("url", u);
			}
			if (c.equals("WEB") && !s.containsKey("url")) throw ApiException.invalid("출처가 WEB 이면 주소를 넣어 주세요(" + field + ")");
			out.put(field, s);
		}
		return out.isEmpty() ? null : out;
	}
}
