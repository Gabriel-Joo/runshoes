package com.kopo17.runshoes.summary;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * batch 프로필(CronJob runshoes-summary)의 진입점 — 같은 이미지 · 같은 main 에 --spring.profiles.active=batch 만 붙인다.
 * 배치를 한 번 돌리고 프로세스를 끝낸다. 종료 코드: 실패가 하나라도 있으면 1(k8s 이력에 실패로 남게), 겹쳐서 하지 않았으면 0.
 * batch 프로필에서 끄는 것: 웹 서버 · Flyway(스키마는 웹 Pod 의 Sync 만 바꾼다) · SeedPasswords · ActivityCleanup — application-batch.yml.
 */
@Component
@Profile("batch")
class SummaryBatchRunner implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(SummaryBatchRunner.class);

	private final SummaryBatch batch;
	private final ApplicationContext context;

	SummaryBatchRunner(SummaryBatch batch, ApplicationContext context) {
		this.batch = batch;
		this.context = context;
	}

	@Override
	public void run(ApplicationArguments args) {
		int code;
		try {
			code = batch.run().exitCode();
		} catch (Exception e) {
			log.error("[summary-batch] 배치를 돌리지 못했다", e);
			code = 1;
		}
		int exit = code;
		System.exit(SpringApplication.exit(context, () -> exit));
	}
}
