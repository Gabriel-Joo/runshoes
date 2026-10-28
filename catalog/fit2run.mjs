// fit2run(미국 러닝 소매점) 상품 페이지의 스펙 블록에서 무게 · 드롭 · 스택을 읽는다 → local/work/fit2run.json
//   2026-10-24 사용자 승인(sources-media.yaml). 주소는 사이트맵에 있는 것만(local/work/retail-index.txt). 읽기는 fetch.mjs(robots · 5초 · 캐시)로만.
//   남성 상품만, 변형판(GTX · 와이드 · 콜라보 …)은 뺀다: 주소 낱말에서 브랜드 · 라인 · 세대 · mens · 채움말을 지우고 남는 낱말이 없어야 같은 신발이다.
//   사이즈 표기가 없다 → 무게는 '사이즈 불명'(fill 이 M9 뒤에 둔다). 우선순위는 BITR 상자 다음 · RSG 상자 앞(fill.mjs).
import fs from 'node:fs';
import { get } from './local/fetch.mjs';

const U = (p) => new URL(p, import.meta.url);
const R = fs.readFileSync(U('shoes.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const BRAND = { newbalance: ['new', 'balance'], underarmour: ['under', 'armour'] };
const FILL0 = ['fresh', 'foam', 'fuel', 'cell', 'fuelcell', 'gel', 'air', 'zoom', 'mens'];  // 이름에 붙었다 빠졌다 하는 낱말
// 브랜드에 따라서만 채움말인 것 — 'x' 는 NB 'Fresh Foam X' 에서만(호카 Mach X 는 다른 신발), 'next' 는 나이키 'Next%' 에서만(온 Cloudsurfer Next 는 다른 신발)
const FILLB = { newbalance: ['x'], nike: ['next'] };
const EN = new Map(fs.readFileSync(U('candidates.csv'), 'utf8').replace(/\r/g, '').trim().split('\n').slice(1).map((l) => l.split(',')).map((c) => [`${c[0]}#${c[1]}`, c[5]]));

// 1. 사이트맵 → 상품 주소 색인
const idx = U('local/work/retail-index.txt');
if (!fs.existsSync(idx) || process.env.REFRESH) {
  const top = await get('https://www.fit2run.com/sitemap.xml', { useCache: !process.env.REFRESH });
  const subs = [...top.body.matchAll(/<loc>([^<]*sitemap_products[^<]*)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  const urls = [];
  for (const s of subs) { const r = await get(s, { useCache: !process.env.REFRESH }); for (const m of r.body.matchAll(/<loc>(https:\/\/www\.fit2run\.com\/products\/[^<]+)<\/loc>/g)) urls.push(m[1]); }
  fs.writeFileSync(idx, urls.join('\n') + '\n');
}
const P = fs.readFileSync(idx, 'utf8').trim().split('\n');

// 2. 행 ↔ 상품 주소(남성 · 변형판 제외)
const match = (r) => {
  const [b, line] = r.line_key.split(':');
  const FILL = new Set([...FILL0, ...(FILLB[b] ?? [])]);
  const want = new Set([...(BRAND[b] ?? [b]), ...line.split('-')]);
  if (/\+/.test(EN.get(`${r.line_key}#${r.generation}`) ?? '')) want.add('plus');  // Lone Peak 9+ — 'plus' 가 있어야 한다(9 와 다른 신발)
  const gen = String(r.generation);
  return P.filter((u) => {
    const t = u.split('/products/')[1].toLowerCase().split('-');
    if (!t.includes('mens') || t.includes('womens')) return false;
    if (![...want].filter((w) => !FILL0.includes(w)).every((w) => t.includes(w))) return false;
    const nums = t.filter((x) => /^v?\d{1,2}$/.test(x)).map((x) => x.replace(/^v/, ''));
    if (r.generation === 1 ? nums.some((n) => n !== '1') : !nums.includes(gen)) return false;
    return t.every((x) => want.has(x) || FILL.has(x) || x.replace(/^v/, '') === gen || (r.generation === 1 && x === '1'));
  });
};

// 3. 스펙 블록(fit-specs) · 상품 설명의 "Specs:" 문장
const num = (s) => (s == null ? null : Number(s));
function parse(html) {
  const block = {};
  for (const m of html.matchAll(/fit-specs__label">\s*([^<]+?)\s*<\/div>([\s\S]*?)(?=fit-specs__item|fit-specs__label|<\/section>)/g)) {
    block[m[1].trim()] = m[2].replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const w = block.Weight?.match(/^(\d+(?:\.\d+)?)\s*(g|oz)\b/i);
  const d = block['Heel-to-Toe Drop']?.match(/^(\d+(?:\.\d+)?)\s*mm/i);
  const st = (block['Stack Height'] ?? block.Stack ?? '').match(/(\d+(?:\.\d+)?)\s*mm(?:[^\d]{1,20}(\d+(?:\.\d+)?)\s*mm)?/i);
  return {
    weight_g: w ? Math.round(w[2].toLowerCase() === 'oz' ? Number(w[1]) * 28.35 : Number(w[1])) : null,
    drop_mm: d ? num(d[1]) : null,
    stack_heel_mm: st ? num(st[1]) : null,
    forefoot_mm: st?.[2] ? num(st[2]) : null,
    raw: { weight: block.Weight ?? null, drop: block['Heel-to-Toe Drop'] ?? null, stack: block['Stack Height'] ?? block.Stack ?? null },
  };
}

const out = {}, log = { rows: 0, matched: 0, ambiguous: [], fetched: 0, failed: [] };
for (const r of R) {
  log.rows++;
  const m = match(r);
  if (!m.length) continue;
  if (m.length > 1) { log.ambiguous.push(`${r.catalog_key}: ${m.map((u) => u.split('/products/')[1]).join(' | ')}`); continue; }  // 같은 신발로 보이는 주소가 둘 이상이면 고르지 않는다
  log.matched++;
  if (process.env.DRY) { console.log('match', r.catalog_key, m[0].split('/products/')[1]); continue; }
  let page; try { page = await get(m[0]); log.fetched++; } catch (e) { log.failed.push(`${r.catalog_key}: ${e.message}`); continue; }
  if (page.status !== 200) { log.failed.push(`${r.catalog_key}: HTTP ${page.status}`); continue; }
  // 페이지 제목의 세대 숫자도 맞아야 한다(번호 없는 주소가 다른 세대일 수 있다)
  const title = ((page.body.match(/<meta property="og:title" content="([^"]*)"/) ?? [])[1] ?? '').replace(/&#\d+;|&[a-z]+;/g, "'");  // Men&#39;s 의 39 를 세대로 읽지 않게
  const tnums = [...title.matchAll(/v(\d{1,2})\b|\b(\d{1,2})\b/gi)].map((m) => m[1] ?? m[2]);  // '1080v14' 처럼 붙여 쓴 v 세대도
  if (/women/i.test(title)) { log.failed.push(`${r.catalog_key}: title is women's`); continue; }
  if (r.generation === 1 ? tnums.some((x) => x !== '1') : !tnums.includes(String(r.generation))) { log.failed.push(`${r.catalog_key}: title "${title}" generation mismatch`); continue; }
  const v = parse(page.body);
  if (v.weight_g == null && v.drop_mm == null && v.stack_heel_mm == null) continue;
  out[`${r.line_key}#${r.generation}`] = { url: m[0], ...v };
}
if (!process.env.DRY) fs.writeFileSync(U('local/work/fit2run.json'), JSON.stringify(out, null, 1));  // DRY(주소 맞추기만)는 결과를 덮지 않는다
const n = (k) => Object.values(out).filter((x) => x[k] != null).length;
console.log(JSON.stringify({ ...log, ambiguous: log.ambiguous.length, failed: log.failed.length, with_value: Object.keys(out).length, weight: n('weight_g'), drop: n('drop_mm'), stack: n('stack_heel_mm') }));
if (log.ambiguous.length) console.log('ambiguous:\n  ' + log.ambiguous.join('\n  '));
if (log.failed.length) console.log('failed:\n  ' + log.failed.join('\n  '));
