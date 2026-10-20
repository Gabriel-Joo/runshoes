package com.kopo17.runshoes.auth;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

/** DB 시간은 UTC · ms(DATETIME(3)) — V1 과 같다 */
final class Clock {

	private Clock() {}

	static LocalDateTime now() {
		return LocalDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MILLIS);
	}
}
