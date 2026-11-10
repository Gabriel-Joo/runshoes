package com.kopo17.runshoes.compare;

import com.kopo17.runshoes.domain.ShoeRepository;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 비교 · 추천 계산(2026-11-10, 작업 3 — 브라우저에서 옮김). 읽기만 하는 계산이라 GET · 로그인 없음(SecurityConfig 의 GET 규칙),
 * 찜 여부처럼 보는 사람에 따라 바뀌는 값은 내지 않는다 — 카드는 화면이 /api/shoes 로 그린다. 챗봇(5단계)도 같은 API 를 부른다.
 * 모집단 · 순서는 /api/shoes 와 같다(보이는 신발 전부, id 순). 매번 전부 읽는다 — 캐시는 응답 시간을 재 보고 정한다.
 */
@RestController
class CompareController {

	private static final Logger log = LoggerFactory.getLogger(CompareController.class);

	private final ShoeRepository shoes;

	/** 잘못된 입력 — 본문 {}(json-server 의 400 과 같은 모양, ApiErrorHandler) */
	private static ResponseEntity<Object> badRequest(String why) {
		log.info("api 400: {}", why);
		return ResponseEntity.badRequest().body(Map.of());
	}

	CompareController(ShoeRepository shoes) {
		this.shoes = shoes;
	}

	private List<Spec> all() {
		return shoes.findAll(Sort.by("id")).stream().map(Spec::of).toList();
	}

	/** ?ids=210,1,53(1~5켤레) 또는 ?pick=210(자동 채우기까지 — 응답에 cols). 둘 다 없거나 둘 다 있으면 400 */
	@GetMapping("/api/compare")
	@Transactional(readOnly = true)
	ResponseEntity<Object> compare(@RequestParam(required = false) String ids, @RequestParam(required = false) String pick) {
		if ((ids == null) == (pick == null)) return badRequest("compare — ids 또는 pick 중 하나");
		List<Spec> all = all();
		Set<Long> known = all.stream().map(Spec::id).collect(Collectors.toSet());
		if (pick != null) {
			Long id = ComparePolicy.jsInteger(pick.trim());
			List<ComparePolicy.Col> cols = id == null || !known.contains(id) ? List.of() : ComparePolicy.autofill(id, all);
			return ResponseEntity.ok(ComparePolicy.result(cols.stream().map(ComparePolicy.Col::id).toList(), cols, all));
		}
		return ResponseEntity.ok(ComparePolicy.result(ComparePolicy.parseIds(ids, known), null, all));
	}

	/** ?purpose=…&width=…&stability=…&cushion=…&price=… — 다섯 칸 모두, 화면 선택지의 값만. 상위 3 */
	@GetMapping("/api/recommend")
	@Transactional(readOnly = true)
	ResponseEntity<Object> recommend(@RequestParam Map<String, String> query) {
		Map<String, String> answers = new LinkedHashMap<>();
		for (var e : RecommendPolicy.ANSWERS.entrySet()) {
			String v = query.get(e.getKey());
			if (v == null || !e.getValue().contains(v)) return badRequest("recommend — " + e.getKey() + " 값이 없거나 모르는 값");
			answers.put(e.getKey(), v);
		}
		return ResponseEntity.ok(RecommendPolicy.result(all(), answers));
	}
}
