package com.kopo17.runshoes.api;

import com.kopo17.runshoes.domain.Shoe;
import com.kopo17.runshoes.domain.ShoeRepository;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 신발 관리 탭의 목록(2026-11-15 사용자) — GET /api/admin/shoes(AdminController). 거르기 · 정렬 · 자르기 · 건수를 모두 SQL 로 한다(DB 가 한 쪽만 꺼낸다).
 * 처음(같은 날)에는 신발 전체를 메모리에 올려 했다 — 그 결과와 같은지 기준을 떠 견줬다(docs/03_admin.md 1-1). 규칙은 그대로:
 *   - 브랜드: 글자가 정확히 같은 것(공개 /api/shoes?brand= 와 같다)
 *   - 검색: 공개 /api/shoes?search= (ListQuery) 와 같다 — 낱말마다(공백으로 나눔, NFC · 소문자) 「브랜드 · 브랜드 영문 이름 · 모델 · 영어 이름 · 다른 표기」를
 *     공백 없이 이은 글에 들어 있어야 한다(AND). 영문 이름은 BrandNames 표를 CASE 로 넣는다
 *   - 빈 칸: GAPS(아래 SQL 조건). 보완 필요의 한 줄에는 빈 칸 이름 gaps
 *   - 정렬: 같은 값이면 id 오름차순 — 쪽 사이 순서가 흔들리지 않게. 최근 수정순은 고친 적 없는 신발을 방향과 상관없이 뒤에
 *   - 가나다: 브라우저 localeCompare("ko") 처럼 한글이 영문보다 앞 — MySQL 에는 한국어 정렬 규칙이 없고 utf8mb4_0900_ai_ci 는 영문을 앞에 둔다.
 *     그래서 한글 · 한자가 아닌 글자 앞마다 한자 확장 B 의 글자(U+2A6D6 — 0900 규칙에서 한글 · 한자 뒤)를 붙인 글로 정렬한다
 * 값은 모두 바인딩한다. 정렬 · 빈 칸은 아래 정해진 SQL 조각에서 고른다(요청의 글을 SQL 에 잇지 않는다).
 */
@Component
class AdminShoes {

	static final Set<String> TABS = Set.of("list", "hidden", "gaps", "purged");
	static final Set<String> SORTS = Set.of("updated", "id", "brand", "model", "gaps");

	/**
	 * 보완 필요의 빈 칸(2026-11-01 사용자) — 순서가 화면의 칩 순서. 와이드 · 카본은 NULL 만(false 「없음」은 확인한 값).
	 * 발볼 · 미드솔 · 품번은 빈 글도 빈 칸(CHAR_LENGTH — PAD SPACE 비교에서는 공백만 있는 글도 '' 와 같아서 쓰지 않는다).
	 * 중량 사이즈는 중량이 있는데 사이즈가 빈 것. 열 이름은 엔티티(domain/Shoe)의 공시값 칸
	 */
	static final Map<String, String> GAPS = new LinkedHashMap<>();
	static {
		GAPS.put("price", "s.price IS NULL");
		GAPS.put("width", "(s.toebox_width IS NULL OR CHAR_LENGTH(s.toebox_width) = 0)");
		GAPS.put("wideAvailable", "s.wide_available IS NULL");
		GAPS.put("stackHeight", "s.official_heel_mm IS NULL");
		GAPS.put("midsole", "(s.midsole IS NULL OR CHAR_LENGTH(s.midsole) = 0)");
		GAPS.put("carbon", "s.carbon IS NULL");
		GAPS.put("weight", "s.official_weight_g IS NULL");
		GAPS.put("drop", "s.official_drop_mm IS NULL");
		GAPS.put("weightSize", "(s.official_weight_g IS NOT NULL AND (s.official_weight_size IS NULL OR CHAR_LENGTH(s.official_weight_size) = 0))");
		GAPS.put("sku", "(s.sku IS NULL OR CHAR_LENGTH(s.sku) = 0)");
	}
	/** 빈 칸 수 — 조건마다 0 · 1 을 더한다(조건마다 괄호 — 「x IS NULL + …」는 IS 가 뒤까지 먹는다) */
	static final String GAP_COUNT = "(" + GAPS.values().stream().map(c -> "(" + c + ")").collect(Collectors.joining(" + ")) + ")";

	/** 가나다 정렬 키 — 한글 · 한자가 아닌 글자(영문 등) 앞마다 KO_MARK. 정규식 · 붙일 글은 바인딩한다(KO_ARGS) */
	static final String KO_REGEX = "([[\\p{L}]-[\\p{Script=Hangul}\\p{Script=Han}]])";
	static final String KO_MARK = new String(Character.toChars(0x2A6D6)) + "$1";
	static String koKey(String column) {
		return "REGEXP_REPLACE(" + column + ", ?, ?) COLLATE utf8mb4_0900_ai_ci";
	}

	/** 정렬 조각 — 키는 SORTS 에서만. down(↓) 이 최근 · 큰 id · 가나다 · 빈 칸 적은 순. koArgs 는 그 조각이 쓰는 바인딩 수(0 또는 2) */
	record Order(String sql, int koArgs) {}
	static Order order(String sort, boolean down) {
		return switch (sort) {
			case "id" -> new Order("s.id " + (down ? "DESC" : "ASC"), 0);
			case "gaps" -> new Order(GAP_COUNT + (down ? " ASC" : " DESC") + ", s.id ASC", 0);
			case "brand" -> new Order(koKey("s.brand") + (down ? " ASC" : " DESC") + ", s.id ASC", 2);
			case "model" -> new Order(koKey("s.model") + (down ? " ASC" : " DESC") + ", s.id ASC", 2);
			default -> new Order("s.updated_at IS NULL, s.updated_at " + (down ? "DESC" : "ASC") + ", s.id ASC", 0);
		};
	}

	private final JdbcTemplate jdbc;
	private final ShoeRepository shoes;

	AdminShoes(JdbcTemplate jdbc, ShoeRepository shoes) {
		this.jdbc = jdbc;
		this.shoes = shoes;
	}

	/** 조건 — tab · sort · gap 은 검사한 값. down 이면 ↓ */
	record Query(String tab, String brand, String search, String gap, String sort, boolean down) {}

	/** WHERE 조각과 바인딩 */
	record Where(String sql, List<Object> args) {}

	/**
	 * {items, total, page, size, counts, gapCounts}. counts 는 탭 단추의 수 — list · gaps 는 브랜드 · 검색을 건 수, all 은 걸지 않은 전체,
	 * hidden · purged 는 늘 전체(그 탭은 브랜드 · 검색으로 거르지 않는다). gapCounts 는 브랜드 · 검색을 건 신발에서 칸마다.
	 * 숨긴 신발은 숨긴 때 최근 먼저, 영구 삭제 기록은 지운 순서의 거꾸로(최근 먼저) — 정렬 칸을 보지 않는다
	 */
	@Transactional(readOnly = true)
	Map<String, Object> list(Query q, AdminPage page, Viewer viewer) {
		viewer.requireAdminView();
		Where w = where(q.brand(), q.search());

		// 건수 — 모두 COUNT · SUM
		StringBuilder countSql = new StringBuilder("SELECT COUNT(*) AS n, COALESCE(SUM(" + GAP_COUNT + " > 0), 0) AS lacking");
		GAPS.forEach((k, cond) -> countSql.append(", COALESCE(SUM(").append(cond).append("), 0) AS `g_").append(k).append('`'));
		countSql.append(" FROM shoes s WHERE ").append(w.sql());
		Map<String, Object> c = jdbc.queryForMap(countSql.toString(), w.args().toArray());
		long listCount = ((Number) c.get("n")).longValue(), lacking = ((Number) c.get("lacking")).longValue();
		Map<String, Object> gapCounts = new LinkedHashMap<>();
		GAPS.keySet().forEach(k -> gapCounts.put(k, ((Number) c.get("g_" + k)).longValue()));
		long all = jdbc.queryForObject("SELECT COUNT(*) FROM shoes WHERE deleted_at IS NULL", Long.class);
		long hidden = jdbc.queryForObject("SELECT COUNT(*) FROM shoes WHERE deleted_at IS NOT NULL", Long.class);
		long purged = jdbc.queryForObject("SELECT COUNT(*) FROM shoe_purges", Long.class);

		long total;
		List<Map<String, Object>> items;
		switch (q.tab()) {
			case "hidden" -> {
				total = hidden;
				List<Long> ids = jdbc.queryForList("SELECT s.id FROM shoes s WHERE s.deleted_at IS NOT NULL ORDER BY s.deleted_at DESC, s.id LIMIT ? OFFSET ?",
						Long.class, page.size(), page.offset());
				items = docs(ids, Map.of(), true);
			}
			case "purged" -> {
				total = purged;
				items = jdbc.query("SELECT " + ShoeCollection.PURGED_COLUMNS + " FROM shoe_purges ORDER BY id DESC LIMIT ? OFFSET ?",
						(rs, i) -> ShoeCollection.purgedRow(rs), page.size(), page.offset());
			}
			default -> {
				boolean gapsTab = q.tab().equals("gaps");
				String extra = !gapsTab ? "" : q.gap() != null ? " AND " + GAPS.get(q.gap()) : " AND " + GAP_COUNT + " > 0";
				total = !gapsTab ? listCount : q.gap() != null ? (long) gapCounts.get(q.gap()) : lacking;
				Order o = order(q.sort(), q.down());
				StringBuilder sql = new StringBuilder("SELECT s.id");
				if (gapsTab) GAPS.forEach((k, cond) -> sql.append(", ").append(cond).append(" AS `g_").append(k).append('`'));
				sql.append(" FROM shoes s WHERE ").append(w.sql()).append(extra).append(" ORDER BY ").append(o.sql()).append(" LIMIT ? OFFSET ?");
				List<Object> args = new ArrayList<>(w.args());
				if (o.koArgs() > 0) { args.add(KO_REGEX); args.add(KO_MARK); }
				args.add(page.size());
				args.add(page.offset());
				Map<Long, List<String>> gapsById = new LinkedHashMap<>();
				List<Long> ids = jdbc.query(sql.toString(), (rs, i) -> {
					long id = rs.getLong("id");
					if (gapsTab) {
						List<String> g = new ArrayList<>();
						for (String k : GAPS.keySet()) if (rs.getInt("g_" + k) == 1) g.add(k);
						gapsById.put(id, g);
					}
					return id;
				}, args.toArray());
				items = docs(ids, gapsById, false);
			}
		}

		Map<String, Object> body = page.body(items, total);
		Map<String, Object> counts = new LinkedHashMap<>();
		counts.put("list", listCount);
		counts.put("all", all);
		counts.put("hidden", hidden);
		counts.put("gaps", lacking);
		counts.put("purged", purged);
		body.put("counts", counts);
		body.put("gapCounts", gapCounts);
		return body;
	}

	/** 보이는 신발 + 브랜드 · 검색 */
	static Where where(String brand, String search) {
		StringBuilder sql = new StringBuilder("s.deleted_at IS NULL");
		List<Object> args = new ArrayList<>();
		if (brand != null && !brand.isBlank()) {
			sql.append(" AND s.brand COLLATE utf8mb4_bin = ?");
			args.add(brand.strip());
		}
		List<String> terms = search == null ? List.of()
				: Arrays.stream(normalize(search).split("\\s+")).filter(t -> !t.isEmpty()).toList();
		if (!terms.isEmpty()) {
			// 검색 글 — ListQuery.matchesAll 의 공백 없는 글(compact)과 같게. Java 의 \s 는 [ \t\n\x0B\f\r]
			StringBuilder en = new StringBuilder("CASE TRIM(s.brand) COLLATE utf8mb4_bin");
			List<Object> enArgs = new ArrayList<>();
			BrandNames.all().forEach((ko, eng) -> { en.append(" WHEN ? THEN ?"); enArgs.add(ko); enArgs.add(eng); });
			en.append(" ELSE '' END");
			String hay = "LOWER(REGEXP_REPLACE(CONCAT(s.brand, " + en + ", s.model, COALESCE(s.model_en, ''), COALESCE(s.model_alias, '')), ?, '')) COLLATE utf8mb4_bin";
			for (String t : terms) {
				sql.append(" AND LOCATE(?, ").append(hay).append(") > 0");
				args.add(t);
				args.addAll(enArgs);
				args.add("[ \\t\\n\\x0B\\f\\r]+");
			}
		}
		return new Where(sql.toString(), args);
	}

	/** id 순서대로 공개 신발과 같은 꼴(ShoeCollection.toDoc) — 숨긴 신발은 deletedAt, 보완 필요는 gaps */
	private List<Map<String, Object>> docs(List<Long> ids, Map<Long, List<String>> gapsById, boolean withDeletedAt) {
		if (ids.isEmpty()) return List.of();
		Map<Long, Shoe> byId = shoes.findAnyByIdIn(ids).stream().collect(Collectors.toMap(Shoe::getId, Function.identity()));
		List<Map<String, Object>> out = new ArrayList<>();
		for (Long id : ids) {
			Shoe s = byId.get(id);
			if (s == null) continue;
			Map<String, Object> d = ShoeCollection.toDoc(s, false);
			if (withDeletedAt) d.put("deletedAt", s.getDeletedAt() == null ? null : Values.formatCreatedAt(s.getDeletedAt()));
			if (gapsById.containsKey(id)) d.put("gaps", gapsById.get(id));
			out.add(d);
		}
		return out;
	}

	/** ListQuery.normalize 와 같다 — NFC · 소문자 */
	private static String normalize(String s) {
		return Normalizer.normalize(s, Normalizer.Form.NFC).toLowerCase(Locale.ROOT).strip();
	}
}
