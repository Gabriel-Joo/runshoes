// 적재기(load.mjs) · 관리 화면 수정 가져오기(pull-admin.mjs)가 같이 쓰는 칸 목록(API 이름)
// 비교하는 사실 값(API 이름) — 이것이 다를 때만 PATCH
export const FACTS = ['brand', 'model', 'stability', 'midsole', 'weight', 'drop', 'stackHeight', 'width', 'wideAvailable', 'carbon', 'price',
  'lineKey', 'generation', 'isCurrent', 'gender', 'weightSize', 'specSize', 'measuredWeight', 'measuredWeightSize', 'measuredStackHeight', 'measuredDrop', 'measuredSource', 'measuredCount',
  'priceSource', 'priceCheckedAt', 'priceKind',  // V5 가격 메타
  'specSources'];  // V6 스펙 출처 — 카탈로그 sources 에서 만든다(specSourcesOf)
// 스냅숏 · 가져오기가 보는 칸 — 사실 값 + 사람이 화면에서 고칠 수 있는 칸(용도 · 문구 · 이미지)
export const TRACKED = [...FACTS, 'purpose', 'summary', 'description', 'image', 'images'];

// 스냅숏 파일 — 적재 직후의 운영 값(호스트마다 하나). 이것과 지금 운영 값이 다른 칸 = 관리 화면에서 고친 칸
export const snapFile = (base, host) => new URL(`./local/work/snapshot-${(host ?? new URL(base).host).replace(/[^a-z0-9.-]/gi, '_')}.json`, import.meta.url);

// 스펙 출처(V6 spec_sources) — 카탈로그 sources(DB 칸 이름) → {weight:{code,url}, …}. docs/ADMIN_DEMO_DESIGN.md 6.1
//   코드는 todo.mjs code() 와 같다: BITR · RSG · STORE · PR · MAN · DB · SX. 그 밖의 URL(fit2run · solereview 표 · 판매점 …)은 WEB.
//   값이 비면 출처도 없다(2.2 — 값을 비우면 출처도 비운다). 카본은 출처 면제라 넣지 않는다
const SPEC_SOURCE_KEYS = { weight: 'official_weight_g', drop: 'official_drop_mm', stackHeight: 'official_heel_mm', midsole: 'midsole', width: 'toebox_width', wideAvailable: 'wideAvailable' };
export const sourceCode = (u) => !u ? null : u === 'manual' ? 'MAN' : /believeintherun/.test(u) ? 'BITR' : /runningshoesguru/.test(u) ? 'RSG'
  : /mediahub\.puma|corp\.asics|amersports|saucony\.com/.test(u) ? 'PR' : /nbkorea|saucony\.co\.kr|brooksrunning\.co\.kr|kor\.mizuno|salomon\.co\.kr|kr\.puma\.com|altra\.co\.kr|asics\.co\.kr|merrellkorea/.test(u) ? 'STORE'
  : /db\.json|사용자 확인/.test(u) ? 'DB' : /stockx/.test(u) ? 'SX' : /^https?:\/\//.test(u) ? 'WEB' : null;
export function specSourcesOf(r) {
  const out = {};
  for (const [f, k] of Object.entries(SPEC_SOURCE_KEYS)) {
    const u = r.sources?.[k], code = sourceCode(u);
    if (r[k] === null || r[k] === undefined || !code) continue;
    out[f] = /^https?:\/\/\S+$/.test(u) && u.length <= 500 ? { code, url: u } : { code };
  }
  return Object.keys(out).length ? out : null;
}
// 키 순서를 보지 않는 비교 — MySQL JSON 은 객체 키를 다시 늘어놓는다(길이 · 사전 순)
export const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((y) => [y, x[y]])) : x));
