package com.kopo17.runshoes.summary;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kopo17.runshoes.domain.Review;
import com.kopo17.runshoes.domain.ReviewRepository;
import java.net.http.HttpClient;
import java.time.Duration;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/**
 * 리뷰 요약 — 만들기(배치)와 읽기(조회)를 나눴다(V14, 2026-11-10 사용자 — docs/09_chatbot_rag.md 5절).
 * 만드는 법은 server.cjs summaryHandler 그대로다(프롬프트 · 공감 순 정렬 · JSON 파싱 · 실패 처리). 바뀐 것은 언제 부르나와 결과를 어디 두나뿐이다.
 *   조회 GET /api/shoes/{id}/summary — shoe_summaries 만 읽는다. Ollama 를 부르지 않는다.
 *   만들기 — SummaryBatch(CronJob, batch 프로필)가 stale 인 신발마다 generate() 를 부르고 SummaryStore 에 저장한다.
 * Ollama 는 OLLAMA_URL(클러스터: GPU 호스트 192.168.122.1:11434 직접). 터널 · Access 를 거치지 않아 CF_ACCESS 헤더를 보내지 않는다.
 */
@Service
public class SummaryService {

	private static final Logger log = LoggerFactory.getLogger(SummaryService.class);
	private static final Pattern JSON_OBJECT = Pattern.compile("\\{[\\s\\S]*\\}");
	static final String TOO_FEW = "리뷰가 3개 미만입니다";
	static final String NOT_YET = "요약을 아직 만들지 않았습니다";
	private static final DateTimeFormatter ISO_MS = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");   // api/Values 와 같은 꼴

	/** 만든 요약 — negative 는 없으면 null */
	public record Generated(String positive, String negative) {}

	private final ReviewRepository reviews;
	private final SummaryStore store;
	private final ObjectMapper json;
	private final RestClient ollama;
	private final String model;

	SummaryService(ReviewRepository reviews, SummaryStore store, ObjectMapper json, RestClient.Builder builder,
			@Value("${app.ollama.url}") String url, @Value("${app.ollama.model}") String model,
			@Value("${app.ollama.timeout-ms}") long timeoutMs) {
		this.reviews = reviews;
		this.store = store;
		this.json = json;
		this.model = model;
		HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(http);
		factory.setReadTimeout(Duration.ofMillis(timeoutMs));          // Node: AbortSignal.timeout(40000)
		this.ollama = builder.baseUrl(url).requestFactory(factory).build();
	}

	/**
	 * GET /api/shoes/{id}/summary 의 본문 — 언제나 200, DB 만 읽는다.
	 *   행이 없다(리뷰 3건 미만 · 없는 신발 · 숨긴 신발)  → {summary: null, reason: "리뷰가 3개 미만입니다"}
	 *   행은 있는데 아직 만들지 않았다                  → {summary: null, reason: "요약을 아직 만들지 않았습니다"}
	 *   만들었다(is_stale 이어도)                      → {summary: {positive, negative}, reviewCount, generatedAt}
	 */
	public Map<String, Object> summarize(String rawId) {
		double shoeId = jsNumber(rawId);                               // Node: Number(req.params.id) — "abc" 는 NaN(리뷰 0개)
		Map<String, Object> body = new LinkedHashMap<>();
		Optional<Optional<SummaryStore.Saved>> found = shoeId == Math.rint(shoeId) && shoeId > 0 && shoeId <= Long.MAX_VALUE
				? store.find((long) shoeId) : Optional.empty();
		if (found.isEmpty() || found.get().isEmpty()) {
			body.put("summary", null);
			body.put("reason", found.isEmpty() ? TOO_FEW : NOT_YET);
			return body;
		}
		SummaryStore.Saved s = found.get().get();
		Map<String, Object> summary = new LinkedHashMap<>();
		summary.put("positive", s.positive());
		summary.put("negative", s.negative());
		body.put("summary", summary);
		body.put("reviewCount", s.reviewCount());
		body.put("generatedAt", ISO_MS.format(s.generatedAt()));
		return body;
	}

	/** 요약 입력 — 그 신발의 리뷰 전부(id 순). 배치가 부른다 */
	public List<Review> reviewsOf(long shoeId) {
		return reviews.findByShoeIdOrderByIdAsc(shoeId);
	}

	/**
	 * 요약을 만든다 — Ollama 한 번. 실패(연결 · 시간 초과 · 응답에 response 없음)면 던진다 — 배치가 세고 stale 로 남긴다.
	 * JSON 을 못 뽑으면 Node 와 같이 positive 에 응답 전문, negative null.
	 */
	public Generated generate(List<Review> list) {
		String reviewText = list.stream()
				.sorted(Comparator.comparingInt((Review r) -> likes(r)).reversed())   // stable — 같은 공감 수는 id 순(Node Array.sort 도 stable)
				.map(r -> "- (공감 " + likes(r) + "개) " + r.getContent())
				.collect(Collectors.joining("\n"));
		String prompt = prompt(list.size(), reviewText);

		JsonNode data = ollama.post().uri("/api/generate").contentType(MediaType.APPLICATION_JSON)
				.body(Map.of("model", model, "prompt", prompt, "stream", false))
				.retrieve()
				.body(JsonNode.class);
		// Node: data.response 가 없으면 대체 처리(data.response.trim())에서도 던져 결국 실패
		if (data == null || data.get("response") == null || data.get("response").isNull()) throw new IllegalStateException("Ollama 응답에 response 가 없다");
		String response = data.get("response").asText();
		try {
			Matcher m = JSON_OBJECT.matcher(response);
			if (!m.find()) throw new IllegalStateException("JSON 없음");
			JsonNode parsed = json.readTree(m.group());
			JsonNode p = parsed.get("positive"), n = parsed.get("negative");
			if (p == null || p.isNull()) throw new IllegalStateException("positive 없음");
			return new Generated(text(p), n == null || n.isNull() ? null : text(n));
		} catch (Exception e) {
			log.debug("요약 JSON 을 못 읽어 응답 전문을 positive 로: {}", e.getMessage());
			return new Generated(response.strip(), null);              // Node: { positive: data.response.trim(), negative: null }
		}
	}

	private static String text(JsonNode n) {
		return n.isTextual() ? n.asText() : n.toString();
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
