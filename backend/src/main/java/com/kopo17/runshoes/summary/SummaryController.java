package com.kopo17.runshoes.summary;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** server.cjs 는 이 경로를 json-server 앞에서 직접 받는다 — 헤더가 다르다(ACAO * · no-store 만, ApiHeadersFilter) */
@RestController
class SummaryController {

	private final SummaryService summary;

	SummaryController(SummaryService summary) {
		this.summary = summary;
	}

	@GetMapping("/api/shoes/{id}/summary")
	Map<String, Object> get(@PathVariable String id) {
		return summary.summarize(id);
	}
}
