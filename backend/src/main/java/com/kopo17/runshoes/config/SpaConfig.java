package com.kopo17.runshoes.config;

import java.io.IOException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/**
 * React 빌드물(Vite dist) 서빙 — server.cjs 의 express.static(dist) + app.get("/*") → index.html 과 같다.
 * 파일이 있으면 그 파일, 없으면 index.html(없는 /assets/*.js 도 index.html — Node 와 같다). /api 는 컨트롤러가 먼저 받는다.
 * 경로는 APP_STATIC(이미지: /opt/app/static). 로컬은 저장소의 dist/ 를 붙인다.
 */
@Configuration
class SpaConfig implements WebMvcConfigurer {

	private final String staticPath;

	SpaConfig(@Value("${app.static-path}") String staticPath) {
		this.staticPath = staticPath.endsWith("/") ? staticPath : staticPath + "/";
	}

	@Override
	public void addResourceHandlers(ResourceHandlerRegistry registry) {
		registry.addResourceHandler("/**")
				.addResourceLocations("file:" + staticPath)
				.resourceChain(false)
				.addResolver(new PathResourceResolver() {
					@Override
					protected Resource getResource(String resourcePath, Resource location) throws IOException {
						Resource r = location.createRelative(resourcePath);
						// Spring 이 ".." 경로를 먼저 거르지만, 디렉터리 밖으로 나가는 파일은 한 번 더 막는다
						if (!resourcePath.isEmpty() && r.exists() && r.isReadable() && r.getFile().isFile()
								&& r.getFile().getCanonicalPath().startsWith(location.getFile().getCanonicalPath())) return r;
						Resource index = new FileSystemResource(staticPath + "index.html");
						return index.exists() ? index : null;
					}
				});
	}
}
