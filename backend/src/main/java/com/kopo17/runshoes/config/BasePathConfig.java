package com.kopo17.runshoes.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.boot.web.servlet.server.ConfigurableServletWebServerFactory;
import org.springframework.stereotype.Component;

/**
 * BASE_PATH(예: /g/kopo17/project-runshoes/) — 앱 전체를 그 아래에 둔다(웹 터미널 배포, docs/DEPLOY.md). 클러스터는 비워 둔다(루트).
 * Vite 빌드와 같은 값을 쓰므로 끝의 / 를 그대로 받고, Spring 의 context-path 규칙(끝에 / 없음)에 맞춰 뗀다.
 */
@Component
class BasePathConfig implements WebServerFactoryCustomizer<ConfigurableServletWebServerFactory> {

	private final String basePath;

	BasePathConfig(@Value("${BASE_PATH:}") String basePath) {
		this.basePath = basePath;
	}

	@Override
	public void customize(ConfigurableServletWebServerFactory factory) {
		String p = basePath.replaceAll("/+$", "");
		if (!p.isEmpty()) factory.setContextPath(p.startsWith("/") ? p : "/" + p);
	}
}
