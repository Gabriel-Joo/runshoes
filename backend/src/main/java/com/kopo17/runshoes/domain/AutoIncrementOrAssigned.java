package com.kopo17.runshoes.domain;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.util.EnumSet;
import org.hibernate.annotations.IdGeneratorType;
import org.hibernate.engine.spi.SharedSessionContractImplementor;
import org.hibernate.generator.BeforeExecutionGenerator;
import org.hibernate.generator.EventType;
import org.hibernate.id.IdentityGenerator;

/**
 * 신발 id(V10, 2026-11-01) — 비어 있으면 DB 가 매기고(AUTO_INCREMENT), POST 본문에 id 가 있으면 그 id 를 넣는다(json-server 처럼, docs/API_CONTRACT.md 1.1).
 * 리뷰는 본문의 id 를 버리므로 평범한 IDENTITY(Review)
 */
@IdGeneratorType(AutoIncrementOrAssigned.Generator.class)
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.FIELD)
public @interface AutoIncrementOrAssigned {

	/** id 가 비면 INSERT 가 만든다(IDENTITY), 있으면 그 값을 그대로 쓴다(BeforeExecution 쪽 — 받은 값을 돌려준다) */
	class Generator extends IdentityGenerator implements BeforeExecutionGenerator {

		@Override
		public Object generate(SharedSessionContractImplementor session, Object owner, Object currentValue, EventType eventType) {
			return currentValue;
		}

		@Override
		public EnumSet<EventType> getEventTypes() {
			return EnumSet.of(EventType.INSERT);
		}

		@Override
		public boolean allowAssignedIdentifiers() {
			return true;
		}

		@Override
		public boolean generatedOnExecution() {
			return true;                                       // 기본은 IDENTITY — 행마다는 아래가 정한다
		}

		@Override
		public boolean generatedOnExecution(Object entity, SharedSessionContractImplementor session) {
			return ((Shoe) entity).getId() == null;
		}
	}
}
