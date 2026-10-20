package com.kopo17.runshoes.auth;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 요청한 쪽 — refresh_tokens · activity_logs 에 남긴다.
 * IP: 터널(Cloudflare) 뒤라 remoteAddr 는 cloudflared 다. CF-Connecting-IP → X-Forwarded-For 첫 값 → remoteAddr 순.
 * (CF-Connecting-IP 는 클러스터 안에서 VIP 로 바로 붙으면 꾸밀 수 있다 — 시도 제한 용도로는 받아들인다)
 */
public record RequestInfo(String ip, String userAgent) {

	public static RequestInfo of(HttpServletRequest req) {
		String ip = req.getHeader("CF-Connecting-IP");
		if (ip == null || ip.isBlank()) {
			String xff = req.getHeader("X-Forwarded-For");
			ip = xff == null || xff.isBlank() ? req.getRemoteAddr() : xff.split(",")[0].strip();
		}
		String ua = req.getHeader("User-Agent");
		return new RequestInfo(cut(ip, 45), cut(ua, 255));
	}

	private static String cut(String s, int max) {
		return s == null ? null : s.length() <= max ? s : s.substring(0, max);
	}
}
