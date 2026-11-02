// 영어 이름(model_en) · 검색용 다른 표기(model_alias) — V13(2026-11-03 사용자). build.mjs 가 행마다 부른다. 새 요청 없이 이미 받아 둔 자료만 읽는다
//   영어 이름(사용자 A안): KicksDB(StockX) 상품명의 모델 부분(브랜드 뗀 것)이 "앞에 붙은 기술명 + line_en"과 맞으면 그것(출처 SX — 상품 주소),
//     아니면 candidates.csv 의 line_en(출처 없음). 나이키는 line_en — "Next% 3" 같은 StockX 표기를 공식몰(접근 금지)로 확인할 수 없다
//     국내 공식몰 상품명은 대부분 한글("젤 카야노 33")이라 영어 이름으로 쓰지 못한다(nbkorea "SC Elite V6"는 R2 근거로만)
//   다른 표기 — 검색은 낱말이 brand · model · modelEn · modelAlias 어디엔가 들어 있으면 걸린다(부분 문자열 · 공백 무시, ListQuery).
//     그래서 앞부분을 뗀 형태(GEL-Kayano → Kayano) · 세대 숫자만 뺀 형태는 적지 않는다 — 이미 찾아진다. 검색이 못 찾는 표기만 만든다
//     R1 한글 오독      우리 한글 이름의 낱말 → 흔히 쓰는 다른 한글 표기(아래 표)
//     R2 브랜드 약어    브랜드가 실제로 줄여 쓰는 것 — 뉴발란스 SuperComp → SC(nbkorea 상품명 "SC Elite V6")
//     R3 다른 영어 표기 영어 이름과 다른 line_en · 하이픈을 띄운 형태(Gel-Kayano → Gel Kayano — 하이픈은 공백 무시로 못 찾는다)
//     R4 약자 한글 읽기 한글 이름 안의 영문 약자(X · SL · GTS · S/LAB …)를 한글로(로켓 X → 로켓 엑스)
//     R5 나이키 옛 표기 KicksDB 상품명에만 있는 Next% · ZoomX · Air Zoom — 영어 그대로와 한글 읽기(베이퍼플라이 넥스트% 4, 2026-11-03 사용자 제안)
//   근거는 엄격하지 않다(검색용 — 틀려도 검색이 안 될 뿐, 화면에 보이지 않는다). 규칙과 수는 docs/01c 1-8
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const R1 = { 퓨얼셀: ['퓨어셀'], 프레시폼: ['프레쉬폼', '후레쉬폼'], 젤: ['겔'], 엔돌핀: ['엔도르핀'], 페가수스: ['페가서스'], 클리프톤: ['클리프턴', '클립톤'],
  본디: ['본다이'], 님버스: ['님부스'], 큐뮬러스: ['큐물러스'], 하이페리온: ['하이퍼리온'], 디비에이트: ['디비에잇'], 스트럭처: ['스트럭쳐'],
  캐스캐디아: ['캐스케이디아'], 이에로: ['히에로'], 시엘로: ['씨엘로'], 펄사: ['펄서'], 배니시: ['배니쉬'], 듀라모: ['두라모'], 엣지: ['에지'],
  아드레날린: ['아드레나린'] };
const R4 = { X: '엑스', SL: '에스엘', GTS: '지티에스', 'S/LAB': '에스랩', ACG: '에이씨지', XA: '엑스에이', FWD: '포워드', VIA: '비아', SC: '에스씨', TT: '티티' };
const R5 = { 'next%': '넥스트%', zoomx: '줌X', air: '에어', zoom: '줌' };
const BRAND = /^(New Balance|ASICS|Hoka One One|Hoka|Nike|adidas|On Running|On|Under Armour|Puma|Saucony|Brooks|Mizuno|Salomon|Altra|Merrell)\s+(UA\s+)?/i;
const norm = (s) => s.toLowerCase().replace(/[\s-]+/g, '');
const words = (s) => s.toLowerCase().replace(/-/g, ' ').split(/\s+/).filter(Boolean);

// 받아 둔 자료 — 처음 부를 때 한 번 읽는다
let IDX = null;
function index() {
  if (IDX) return IDX;
  const sx = JSON.parse(fs.readFileSync(path.join(ROOT, 'local/work/stockx.json'), 'utf8'));
  const bySlug = new Map();
  for (const d of ['local/cache/kicksdb', 'local/cache/kicksdb100']) {
    const dir = path.join(ROOT, d); if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { continue; }
      for (const r of j.data ?? []) if (r?.slug && r.model && !bySlug.has(r.slug)) bySlug.set(r.slug, r.model);
    }
  }
  // nbkorea 상품 페이지(스펙 수집 때 받아 둔 것)의 "SC … V6" 상품명
  const sc = new Map();
  for (const f of fs.readdirSync(path.join(ROOT, 'local/work')).filter((x) => /^specs-.*\.jsonl$/.test(x))) {
    for (const l of fs.readFileSync(path.join(ROOT, 'local/work', f), 'utf8').split('\n')) {
      if (!l.trim()) continue;
      const s = JSON.parse(l), id = `${s.line_key}#${s.generation}`;
      for (const u of Object.values(s.sources ?? {})) {
        if (typeof u !== 'string' || !/nbkorea\.com\/product\/productDetail/.test(u)) continue;
        const file = path.join(ROOT, 'local/cache', crypto.createHash('sha1').update(u).digest('hex') + '.json');
        if (!fs.existsSync(file)) continue;
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        const og = j.status === 200 ? j.body.match(/property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1] : null;
        const n = og?.match(/^(SC [A-Za-z]+ V?\d*)/i)?.[1]?.trim();
        if (n) sc.set(id, n);
      }
    }
  }
  return (IDX = { sx, bySlug, sc });
}

/** 행(build.mjs 의 row — brand · model · line_key · generation)과 line_en → { model_en, model_en_source, model_alias, alias_rules } */
export function namesOf(row, lineEn) {
  const { sx, bySlug, sc } = index();
  const id = `${row.line_key}#${row.generation}`, nike = row.line_key.startsWith('nike:');
  const slug = sx[id]?.slug ?? null, raw = slug ? bySlug.get(slug) ?? null : null;
  const sxName = raw ? raw.replace(BRAND, '').trim() : null;
  const le = lineEn || null;
  // "앞에 붙은 낱말 + line_en" 만 — 뒤에 붙은 낱말(GRVL · LE · 색상)이나 세대 숫자가 다르면 쓰지 않는다. 나이키 옛 이름의 "Next%"만 사이에 끼어도 된다
  const lw = le ? words(le) : [], sw = sxName ? words(sxName) : [];
  const at = sw.indexOf(lw[0]), rest = at < 0 ? [] : sw.slice(at).filter((w) => w !== 'next%');
  const sxOk = Boolean(sxName && le && at >= 0 && rest.length === lw.length && rest.every((w, i) => w === lw[i]));
  const useSx = sxOk && !nike;
  const en = useSx ? sxName : le;

  const alias = [], rules = [];
  const add = (a, r) => {
    if (!a) return;
    const known = [row.model, en, ...alias].filter(Boolean);
    if (known.some((x) => norm(x) === norm(a))) return;
    const hay = known.join(' ').toLowerCase();
    if (words(a).every((w) => hay.includes(w))) return;   // 이미 찾아지는 표기
    alias.push(a); rules.push(r);
  };
  const ko = row.model.split(' ');
  for (const [k, vs] of Object.entries(R1)) if (ko.includes(k)) for (const v of vs) add(ko.map((w) => (w === k ? v : w)).join(' '), 'R1');
  for (const f of [en, le].filter(Boolean)) if (/SuperComp/i.test(f)) add(f.replace(/^FuelCell\s+/i, '').replace(/SuperComp/i, 'SC'), 'R2');
  if (sc.has(id)) add(sc.get(id), 'R2');
  if (le) add(le, 'R3');
  for (const f of [en, le].filter(Boolean)) if (/-/.test(f)) add(f.replace(/-/g, ' '), 'R3');
  if (ko.some((w) => R4[w])) add(ko.map((w) => R4[w] ?? w).join(' '), 'R4');
  if (nike && sxOk && sw.length > lw.length) {
    add(sxName, 'R5');
    // 한글 이름에 옛 낱말을 같은 자리에 — 베이퍼플라이 4 + "ZoomX Vaporfly Next% 4" → 줌X 베이퍼플라이 넥스트% 4
    const extra = sw.filter((w) => R5[w]);
    const before = extra.filter((w) => sw.indexOf(w) < at).map((w) => R5[w]), mid = extra.filter((w) => w === 'next%').map((w) => R5[w]);
    const kw = [...ko];
    if (mid.length) kw.splice(kw.length - 1, 0, ...mid);   // 세대 숫자 앞
    add([...before, ...kw].join(' '), 'R5');
    if (mid.length && before.length) add([...ko.slice(0, -1), ...mid, ko.at(-1)].join(' '), 'R5');   // 앞 낱말 없이 — 베이퍼플라이 넥스트% 4
  }
  return {
    model_en: en,
    model_en_source: useSx ? { code: 'SX', url: `https://stockx.com/${slug}` } : null,
    model_alias: alias.join(', ') || null,
    alias_rules: rules,
  };
}
