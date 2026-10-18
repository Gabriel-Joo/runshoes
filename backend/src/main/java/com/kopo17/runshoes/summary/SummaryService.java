package com.kopo17.runshoes.summary;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kopo17.runshoes.domain.Review;
import com.kopo17.runshoes.domain.ReviewRepository;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Sort;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/**
 * 리뷰 요약 — server.cjs summaryHandler 를 그대로(프롬프트 · 공감 순 정렬 · 캐시 · 실패 처리). 계약은 contract/baseline/node-summary.
 * Ollama 는 OLLAMA_URL(클러스터: GPU 호스트 192.168.122.1:11434 직접). 터널 · Access 를 거치지 않아 CF_ACCESS 헤더를 보내지 않는다.
 * 캐시는 Pod 메모리 — 신발별 리뷰 수가 같으면 다시 부르지 않는다(재시작하면 비워진다, Node 와 같다).
 */
@Service
public class SummaryService {

	private static final Logger log = LoggerFactory.getLogger(SummaryService.class);
	private static final Pattern JSON_OBJECT = Pattern.compile("\\{[\\s\\S]*\\}");

	private record Cached(Object summary, int reviewCount) {}

	private final ReviewRepository reviews;
	private final ObjectMapper json;
	private final RestClient ollama;
	private final String model;
	private final Map<Double, Cached> cache = new ConcurrentHashMap<>();

	SummaryService(ReviewRepository reviews, ObjectMapper json, RestClient.Builder builder,
			@Value("${app.ollama.url}") String url, @Value("${app.ollama.model}") String model,
			@Value("${app.ollama.timeout-ms}") long timeoutMs) {
		this.reviews = reviews;
		this.json = json;
		this.model = model;
		HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(http);
		factory.setReadTimeout(Duration.ofMillis(timeoutMs));          // Node: AbortSignal.timeout(40000)
		this.ollama = builder.baseUrl(url).requestFactory(factory).build();
	}

	/** GET /api/shoes/{id}/summary 의 본문 — 언제나 200 */
	public Map<String, Object> summarize(String rawId) {
		double shoeId = jsNumber(rawId);                               // Node: Number(req.params.id) — "abc" 는 NaN(리뷰 0개)
		List<Review> list = reviews.findAll(Sort.by("id")).stream()
				.filter(r -> r.getShoeId() != null && r.getShoeId().doubleValue() == shoeId)
				.toList();

		Map<String, Object> body = new LinkedHashMap<>();
		if (list.size() < 3) {
			body.put("summary", null);
			body.put("reason", "리뷰가 3개 미만입니다");
			return body;
		}
		Cached cached = cache.get(shoeId);
		if (cached != null && cached.reviewCount() == list.size()) {
			body.put("summary", cached.summary());
			return body;
		}

		String reviewText = list.stream()
				.sorted(Comparator.comparingInt((Review r) -> likes(r)).reversed())   // stable — 같은 공감 수는 id 순(Node Array.sort 도 stable)
				.map(r -> "- (공감 " + likes(r) + "개) " + r.getContent())
				.collect(Collectors.joining("\n"));
		String prompt = prompt(list.size(), reviewText);

		try {
			JsonNode data = ollama.post().uri("/api/generate").contentType(MediaType.APPLICATION_JSON)
					.body(Map.of("model", model, "prompt", prompt, "stream", false))
					.retrieve()
					.body(JsonNode.class);
			// Node: data.response 가 없으면 대체 처리(data.response.trim())에서도 던져 결국 "요약을 불러오지 못했습니다"
			if (data == null || data.get("response") == null || data.get("response").isNull()) throw new IllegalStateException("Ollama 응답에 response 가 없다");
			String response = data.get("response").asText();
			Object parsed;
			try {
				Matcher m = JSON_OBJECT.matcher(response);
				if (!m.find()) throw new IllegalStateException("JSON 없음");
				parsed = json.readTree(m.group());
			} catch (Exception e) {
				Map<String, Object> fallback = new LinkedHashMap<>();   // Node: { positive: data.response.trim(), negative: null }
				fallback.put("positive", response.strip());
				fallback.put("negative", null);
				parsed = fallback;
			}
			cache.put(shoeId, new Cached(parsed, list.size()));
			log.info("[summary] shoeId={} 요약 생성 완료 (리뷰 {}개)", rawId, list.size());
			body.put("summary", parsed);
			return body;
		} catch (Exception e) {
			log.error("summary error: {}", e.getMessage());
			body.put("summary", null);
			body.put("reason", "요약을 불러오지 못했습니다");
			return body;
		}
	}

	private static int likes(Review r) {
		return r.getLikeCount() == null ? 0 : r.getLikeCount();
	}

	/** server.cjs 의 프롬프트 — 문구를 바꾸면 요약 품질이 바뀐다. 계약 S9(mock 이 받은 프롬프트)와 글자 단위로 같아야 한다 */
	static String prompt(int count, String reviewText) {
		return "다음은 러닝화 리뷰 " + count + "개입니다. 각 리뷰 앞의 \"(공감 N개)\"는 다른 사용자들이 그 리뷰에 공감한 수입니다. "
				+ "공감을 많이 받은 리뷰의 의견을 더 비중 있게 반영하세요. 리뷰 작성자들이 실제로 언급한 내용만 근거로 분석하세요. "
				+ "리뷰에 없는 내용은 추측하지 마세요. 같은 주제에 대해 리뷰들의 의견이 서로 반대된다면, 한쪽만 고르지 말고 "
				+ "\"의견이 갈립니다\"처럼 양쪽을 함께 언급하세요. 문장은 반드시 정중한 존댓말(합니다체)로 작성하세요.\n"
				+ "\n"
				+ "반드시 아래 JSON 형식으로만 답하세요. 다른 설명은 붙이지 마세요.\n"
				+ "{\"positive\": \"긍정적으로 언급된 점 한 문장 (존댓말)\", \"negative\": \"아쉽다고 언급된 점 한 문장 (존댓말, 없으면 null)\"}\n"
				+ "\n"
				+ "리뷰:\n"
				+ reviewText;
	}

	/** JS Number(s) — 빈 문자열은 0, 숫자가 아니면 NaN */
	static double jsNumber(String s) {
		String t = s.strip();
		if (t.isEmpty()) return 0;
		try {
			if (t.matches("[+-]?0[xX][0-9a-fA-F]+")) return Long.parseLong(t.replaceFirst("[+-]?0[xX]", ""), 16) * (t.startsWith("-") ? -1 : 1);
			if (t.matches("[+-]?(\\d+\\.?\\d*|\\.\\d+)([eE][+-]?\\d+)?|[+-]?Infinity")) return Double.parseDouble(t);
		} catch (NumberFormatException ignored) { }
		return Double.NaN;
	}
}
