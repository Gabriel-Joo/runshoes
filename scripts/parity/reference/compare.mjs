// 얼린 사본 — 이관 전(2026-11-10, 앱 27bf4a1) src/utils/compare.ts 를 tsc 로 타입만 지운 것. 고치지 않는다.
// 서버(compare/CompareService)와 결과가 같은지 scripts/parity/check.mjs 가 본다. 가중치를 고칠 때는 이 사본도 같이 고쳐 "의도한 차이"를 본다.
export const MAX_COLS = 5; // 비교는 다섯 켤레까지
export const AUTO_COLS = 4; // 하나를 고르면 네 켤레까지 채운다
export const WHY_LABEL = {
    pick: "고른 신발",
    line: "같은 라인",
    brand: "같은 브랜드",
    stability: "안정성 다름",
    similar: "비슷한 신발",
    user: "내가 담은 신발", // 검색 · 찜 · 상세 모달에서 담은 것(2026-11-09 사용자 — 모든 카드에 이유가 있어야 줄이 맞는다)
    rec: "추천받은 신발", // 추천받기 결과에서
};
const WHY_CODE = { pick: "p", line: "l", brand: "b", stability: "s", similar: "m", user: "u", rec: "r" };
const CODE_WHY = Object.fromEntries(Object.entries(WHY_CODE).map(([k, v]) => [v, k]));
/** ?ids=1,2,3&why=p,l,b — 숫자 아님 · 모르는 id · 겹침은 버리고 다섯 개까지. why 가 모자라거나 모르면 "user"("내가 담은 신발") */
export function parseCols(ids, why, known) {
    const whys = (why ?? "").split(",");
    const out = [];
    (ids ?? "").split(",").forEach((raw, i) => {
        const id = Number(raw.trim());
        if (!Number.isInteger(id) || id <= 0 || !known.has(id) || out.some((c) => c.id === id) || out.length >= MAX_COLS)
            return;
        out.push({ id, why: CODE_WHY[whys[i]?.trim()] ?? "user" });
    });
    return out;
}
/** Col[] → 주소의 ids · why. 모두 "user" 면 why 는 뺀다(읽을 때 없으면 "user") */
export function formatCols(cols) {
    return {
        ids: cols.map((c) => c.id).join(","),
        why: cols.some((c) => c.why !== "user") ? cols.map((c) => WHY_CODE[c.why]).join(",") : null,
    };
}
/**
 * 비슷한 신발 거리에만 쓰는 무게 — 270mm 로 맞춘 값, 기준 모름(weightNorm270 null)이면 원값.
 * 일부러 여기만 원값을 쓴다(2026-11-10 사용자): 기준 모름 29켤레를 "무게 모름"으로 두면 거리가 스택 · 드롭으로만 갈려
 * 247g 신발 옆에 311g 을 "비슷한 신발"로 내놓았다. 기준을 몰라도 대표 사이즈는 거의 265~285mm 라(01a 1-3)
 * 원값의 오차는 많아야 약 ±7.4%(약 20g) — 무게를 버리는 것보다 작다.
 * 이 값은 저장하지도 보이지도 않는다 — 화면 · 등수 · 그래프 · API 의 무게 자리는 numValue(기준 모름이면 null)만 쓴다.
 */
const distWeight = (s) => s.weightNorm270 ?? s.weight;
function stdev(xs) {
    if (xs.length === 0)
        return 1;
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1;
}
/** 스펙이 얼마나 가까운가 — 스택 + 드롭 × 0.7 + 무게(distWeight)(각각 전체 표준편차로 나눔), 카본이 서로 다르면 +2, 한쪽이 비면 그 칸은 1 */
export function makeDistance(all) {
    const sd = {
        stackHeight: stdev(all.map((s) => s.stackHeight).filter((v) => v != null)),
        drop: stdev(all.map((s) => s.drop).filter((v) => v != null)),
        weight: stdev(all.map(distWeight).filter((v) => v != null)),
    };
    return (a, b) => {
        let d = 0;
        for (const [k, w] of [["stackHeight", 1], ["drop", 0.7], ["weight", 1]]) {
            const x = k === "weight" ? distWeight(a) : a[k], y = k === "weight" ? distWeight(b) : b[k];
            d += w * (x == null || y == null ? 1 : Math.abs(x - y) / sd[k]);
        }
        if (a.carbon != null && b.carbon != null && a.carbon !== b.carbon)
            d += 2;
        return d;
    };
}
/**
 * 하나를 고르면 네 켤레까지(08 1-3): 고른 신발 → 같은 라인의 다른 세대 → 같은 브랜드 · 같은 안정성 1 →
 * 다른 브랜드 · 안정성이 다른 신발 1 → 다른 브랜드 · 같은 안정성 → (모자라면) 다른 브랜드 아무거나 → 아무거나.
 * 후보는 같은 용도 · 다른 라인 · 현행만(검색은 전체 — 여기만 현행). 다른 브랜드는 브랜드마다 하나.
 */
export function autofill(pickId, all) {
    const pick = all.find((s) => s.id === pickId);
    if (!pick)
        return [];
    const out = [{ id: pick.id, why: "pick" }];
    if (pick.lineKey) {
        all.filter((s) => s.lineKey === pick.lineKey && s.id !== pick.id).forEach((s) => out.push({ id: s.id, why: "line" }));
    }
    const dist = makeDistance(all);
    const pool = all
        .filter((s) => s.id !== pick.id && (!pick.lineKey || s.lineKey !== pick.lineKey) && s.isCurrent && s.purpose === pick.purpose)
        .sort((a, b) => dist(pick, a) - dist(pick, b) || a.id - b.id);
    const used = new Set(out.map((c) => c.id));
    const brands = new Set([pick.brand]);
    const take = (ok, why) => {
        if (out.length >= AUTO_COLS)
            return false;
        const s = pool.find((x) => !used.has(x.id) && ok(x));
        if (!s)
            return false;
        used.add(s.id);
        brands.add(s.brand);
        out.push({ id: s.id, why });
        return true;
    };
    take((s) => s.brand === pick.brand && s.stability === pick.stability, "brand");
    take((s) => !brands.has(s.brand) && s.stability !== pick.stability, "stability");
    while (take((s) => !brands.has(s.brand) && s.stability === pick.stability, "similar"))
        ;
    while (take((s) => !brands.has(s.brand), "similar"))
        ;
    while (take(() => true, "similar"))
        ;
    return out.slice(0, AUTO_COLS);
}
/** 무게를 잰 사이즈 → mm(표시용). 무게 자리는 270mm(M9)로 맞춘 값으로 말한다(V15 weightNorm270, 환산 규칙 01a 1-3a) */
export const SIZE_MM = { "M8.5": 265, M9: 270, "M9.5": 275, M10: 280, "M10.5": 285 };
export const BASE_SIZE = "M9";
/** 그 칸의 "자리를 말할 수 있는" 값 — 무게는 270mm 로 맞춘 값(기준 모름이면 null) */
export function numValue(s, key) {
    if (key === "weight")
        return s.weightNorm270 ?? null;
    return s[key];
}
/** 환산한 무게인가 — 270mm 로 맞춘 값이 있고 기준이 M9 가 아니다(표의 "환산" 배지 · 그래프 설명) */
export function isConverted(s) {
    return s.weightNorm270 != null && s.weightSize !== BASE_SIZE;
}
/** 모집단 — 그 칸의 값이 있는 신발(무게는 270mm 로 맞춘 값이 있는 것) */
export function population(all, key) {
    return all.map((s) => numValue(s, key)).filter((v) => v != null);
}
export function rankIn(arr, v) {
    const less = arr.filter((a) => a < v).length;
    const same = arr.filter((a) => a === v).length;
    const more = arr.length - less - same;
    const p = arr.length ? (less + same / 2) / arr.length : 0.5;
    return { less, same, more, order: less + 1, band: p < 0.25 ? "low" : p > 0.75 ? "high" : "mid" };
}
export const BAND_WORD = {
    weight: { low: "가벼운 편", mid: "중간", high: "무거운 편" },
    stackHeight: { low: "낮은 편", mid: "중간", high: "높은 편" },
    drop: { low: "낮은 편", mid: "중간", high: "높은 편" },
    price: { low: "낮은 편", mid: "중간", high: "높은 편" },
};
/** 그래프 설명 — 결론 먼저(2026-11-09 사용자): "무게 280g — 중간이에요" / "…를 가벼운 순으로 세우면 131번째예요." */
export const NUM_TEXT = {
    weight: { label: "무게", pop: "270mm로 맞춘 무게가 있는 신발", order: "가벼운 순" },
    stackHeight: { label: "스택하이트", pop: "스택하이트 값이 있는 신발", order: "낮은 순" },
    drop: { label: "드롭", pop: "드롭 값이 있는 신발", order: "낮은 순" },
    price: { label: "발매가", pop: "발매가를 확인한 신발", order: "낮은 순" },
};
export function formatNum(key, v) {
    if (key === "price")
        return `${v.toLocaleString("ko-KR")}원`;
    if (key === "weight")
        return `${Math.round(v)}g`; // 환산값은 소수 — 화면에서만 반올림한다
    return `${v}mm`;
}
/** 끝 글자에 받침이 있나 — 숫자 · 영문은 읽는 소리로 어림 */
function hasJong(word) {
    const c = word.trim().slice(-1);
    const code = c.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3)
        return (code - 0xac00) % 28 !== 0;
    if (/[0-9]/.test(c))
        return "0136789".includes(c);
    return /[lmnr]/i.test(c);
}
export const eunNeun = (word) => word + (hasJong(word) ? "은" : "는");
export const eulReul = (word) => word + (hasJong(word) ? "을" : "를");
/** 이름 여럿을 한 주어로 — "클라우드고 · 클리프톤 10은" (은/는은 끝 이름에만) */
export const topic = (names) => [...names.slice(0, -1), eunNeun(names[names.length - 1] ?? "")].join(" · ");
/* ───── 검색 결과 순서 ───── */
/** 같은 라인은 붙여서 새 세대 → 옛 세대(브랜드 · 라인 순) */
export function sortResults(list) {
    return [...list].sort((a, b) => a.brand.localeCompare(b.brand, "ko") ||
        (a.lineKey ?? `~${a.id}`).localeCompare(b.lineKey ?? `~${b.id}`) ||
        (b.generation ?? 0) - (a.generation ?? 0) ||
        a.id - b.id);
}
/* ───── 다른 화면에서 비교로 넘어갈 때 ───── */
/** 상세 모달 "비교에 담기" — 마지막 구성이 있으면 한 칸 더하고(이미 있거나 다섯이면 그대로), 없으면 그 신발로 자동 채우기 */
export function addToCompareUrl(id, last) {
    if (last.length === 0)
        return `/compare?pick=${id}`;
    const cols = last.some((c) => c.id === id) || last.length >= MAX_COLS ? last : [...last, { id, why: "user" }];
    const f = formatCols(cols);
    return `/compare?ids=${f.ids}${f.why ? `&why=${f.why}` : ""}`;
}
