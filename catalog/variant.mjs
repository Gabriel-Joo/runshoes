// 리뷰 주소가 그 행의 신발이 아닌 다른 판 · 다른 모델 · 모음 글인지(2026-10-23 — Hyperion 3 ← hyperion-max-3, Adizero SL 1 ← evo-sl-atr 사고)
//   1. 변형 · 이웃 모델 낱말이 주소에 있는데 라인 이름에 없으면 다른 신발: GRVL · GTX · Hike · Wide · Mid · Max · GTS · ATR · Low · Lightspray · Evo · Ultra · Elite · Plus · Trail
//   2. 모음 · 비교 글(best-… · …-vs-… · rotation)은 한 신발의 값이 아니다
//   3. 라인 이름의 낱말(브랜드 계열 낱말 제외)이 하나도 없으면 다른 신발(adios-pro-evo ← hyperboost-edge)
//   예외: 그 신발의 공식 이름에 붙은 낱말(Challenger ATR 7 · Zegama Trail), 제목으로 확인한 주소(ALLOW_URL)
const DENY = ['grvl', 'gtx', 'gore', 'goretex', 'hike', 'wide', 'mid', 'max', 'gts', 'atr', 'low', 'lightspray', 'evo', 'ultra', 'elite', 'plus', 'trail'];
const ALLOW = { 'hoka:challenger': ['atr'], 'nike:acg-zegama': ['trail'] };
// 주소에 라인 낱말이 없지만 페이지 제목으로 같은 신발임을 확인한 것("New Balance Fresh Foam Hierro v8 Review")
const ALLOW_URL = new Set(['https://believeintherun.com/shoe-reviews/new-balance-fresh-foam-v8-review/']);
const GENERIC = new Set(['gel', 'fresh', 'foam', 'fuelcell', 'slab', 'adizero', 'terrex', 'wave', 'nitro']);

export function otherShoe(lineKey, u) {
  if (ALLOW_URL.has(u)) return null;
  let p; try { p = new URL(u).pathname.toLowerCase(); } catch { return 'bad_url'; }
  const slug = p.split('/').filter(Boolean).pop() ?? '', words = slug.split(/[^a-z0-9]+/).filter(Boolean);
  const line = lineKey.split(':')[1].split('-'), allow = new Set([...line, ...(ALLOW[lineKey] ?? [])]);
  const deny = words.find((w) => DENY.includes(w) && !allow.has(w));
  if (deny) return `variant:${deny}`;
  if (/^best-|(^|-)vs(-|$)|rotation/.test(slug)) return 'roundup';
  const core = line.filter((w) => !GENERIC.has(w) && !/^\d+$/.test(w));
  if (core.length && !core.some((w) => words.includes(w) || words.some((x) => x.startsWith(w) || (x.length >= 5 && w.startsWith(x))))) return 'no_line_word';
  return null;
}
