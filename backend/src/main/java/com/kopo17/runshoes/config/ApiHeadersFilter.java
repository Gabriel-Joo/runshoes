package com.kopo17.runshoes.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.regex.Pattern;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Node 앱의 응답 헤더를 그대로 — server.cjs 미들웨어 + jsonServer.defaults()(cors · noCache) 가 붙이던 것(contract/baseline/node).
 *
 * - 모든 경로: Access-Control-Allow-Origin: *                                  (server.cjs)
 * - /api/** : Cache-Control: no-store                                        (server.cjs)
 *   그 위에 json-server 라우터로 가는 것은 cors(origin 반사 · credentials) 와 noCache(no-cache, Pragma, Expires -1) 가 덮어쓴다
 *   OPTIONS 는 cors 가 204 로 끝낸다 — noCache 까지 가지 않아 no-store 가 남는다(기준선 19)
 * - GET /api/shoes/{id}/summary 는 server.cjs 가 json-server 앞에서 직접 응답한다 — ACAO * 와 no-store 만(기준선 20).
 *   다른 메서드는 json-server 로 가서 404 — 다른 /api 와 같다
 * - /api 밖(SPA · 정적 파일)의 GET: Cache-Control: public, max-age=0 (express.static · sendFile 기본값, 기준선 21~23)
 * Spring 의 CORS 처리(@CrossOrigin · CorsRegistry)는 쓰지 않는다 — 헤더 모양(204, Origin 이 없을 때 *)이 달라진다.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class ApiHeadersFilter extends OncePerRequestFilter {

	private static final Pattern SUMMARY = Pattern.compile("^/api/shoes/[^/]+/summary$");

	@Override
	protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
			throws ServletException, IOException {
		String path = req.getRequestURI().substring(req.getContextPath().length());
		res.setHeader("Access-Control-Allow-Origin", "*");
		boolean read = "GET".equals(req.getMethod()) || "HEAD".equals(req.getMethod());
		if (!path.startsWith("/api/")) {
			if (read) res.setHeader("Cache-Control", "public, max-age=0");
			chain.doFilter(req, res);
			return;
		}
		res.setHeader("Cache-Control", "no-store");
		if (read && SUMMARY.matcher(path).matches()) {
			chain.doFilter(req, res);
			return;
		}

		// cors({ origin: true, credentials: true }) — Origin 이 오면 그대로 돌려준다
		String origin = req.getHeader("Origin");
		if (origin != null) {
			res.setHeader("Access-Control-Allow-Origin", origin);
			res.addHeader("Vary", "Origin");
		}
		res.setHeader("Access-Control-Allow-Credentials", "true");

		if ("OPTIONS".equals(req.getMethod())) {
			res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE");
			String reqHeaders = req.getHeader("Access-Control-Request-Headers");
			if (reqHeaders != null) {
				res.setHeader("Access-Control-Allow-Headers", reqHeaders);
				res.addHeader("Vary", "Access-Control-Request-Headers");
			}
			res.setStatus(HttpServletResponse.SC_NO_CONTENT);
			res.setContentLength(0);
			return;
		}

		// noCache
		res.setHeader("Cache-Control", "no-cache");
		res.setHeader("Pragma", "no-cache");
		res.setHeader("Expires", "-1");
		chain.doFilter(req, res);
	}
}
