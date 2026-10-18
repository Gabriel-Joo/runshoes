package com.kopo17.runshoes.config;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.Module;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.module.SimpleModule;
import java.io.IOException;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * JSON 숫자를 JS 처럼 — 컬럼이 DOUBLE 이라 Java 는 300.0 을 들고 있다. json-server(JSON.stringify)는 300 으로 낸다.
 * 값이 같아 diff 는 통과하지만 응답 텍스트까지 같게 둔다. 글로벌 NON_NULL 은 쓰지 않는다 — shoe 4 의 midsole:null 은 나가야 한다.
 */
@Configuration
class JacksonConfig {

	@Bean
	Module jsNumbers() {
		return new SimpleModule("js-numbers").addSerializer(Double.class, new JsonSerializer<>() {
			@Override
			public void serialize(Double v, JsonGenerator g, SerializerProvider p) throws IOException {
				if (!v.isInfinite() && !v.isNaN() && v == Math.rint(v) && Math.abs(v) < 9.007199254740992E15) g.writeNumber(v.longValue());
				else g.writeNumber(v);
			}
		});
	}
}
