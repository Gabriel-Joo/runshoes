// candidates.csv 의 세대마다 KicksDB(StockX) 에서 대표 이미지를 찾는다 — 규칙은 docs/CATALOG_PIPELINE.md 3.4.
//   node catalog/stockx.mjs [--only <line_key>] [--limit N]
//   키: KICKSDB_KEY_FILE(한 줄, 권한 600) — git · 로그에 남기지 않는다. 응답은 catalog/local/cache/kicksdb/ 에 두고 다시 묻지 않는다.
//   결과: catalog/local/work/stockx.json — { "<line_key>#<generation>": { status, image, sku, slug, title, gender, matched, reason } }
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const CACHE = path.join(ROOT, 'local/cache/kicksdb');
const OUT = path.join(ROOT, 'local/work/stockx.json');
const API = 'https://api.kicks.dev/v3/stockx/products';
const GAP_MS = 1500;

// 콜라보 · 특별판 · 변형 표시(제목에 있으면 대표 색상에서 뺀다)
const EXCLUDE = [/gore-?tex/i, /\bgtx\b/i, /\((gs|ps|td)\)/i, /\bkids?\b/i, /rundisney/i, /\b\d+ years\b/i, /\bkith\b/i, /stella mccartney/i,
  /post archive/i, /song for the mute/i, /girls run/i, /hermanos/i, /\bx\b [A-Z]/, /\bcollab/i, /\bsample\b/i, /\bpack\b/i, /marathon/i, /\bhyrox\b/i,
  /\bwide\b/i, /\bspikes?\b/i, /\bslide\b/i,
  // 2026-10-24: 방수판(클라우드서퍼 트레일 1 ← "Cloudsurfer Trail Waterproof") · 콜라보 색(1080 v15 ← "District Vision")
  /\bwaterproof\b/i, /\bwp\b/i, /district vision/i];

export function parseCsv(text) {
  const [head, ...lines] = text.replace(/\r/g, '').trim().split('\n');
  const cols = head.split(',');
  return lines.map((l) => {
    const v = []; let cur = '', q = false;
    for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { v.push(cur); cur = ''; } else cur += ch; }
    v.push(cur);
    return Object.fromEntries(cols.map((c, i) => [c, v[i] ?? '']));
  });
}
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9%.+ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const squash = (s) => norm(s).replace(/ /g, '');

// 라인 핵심 낱말: line_key 의 라인 부분(asics:gel-kayano → gelkayano)
// StockX 가 라인 이름을 다르게 쓰는 곳: 매칭 낱말을 덮어쓴다
const CORE_ALIAS = { 'nike:infinityrn': 'infinityrun' };
const core = (lineKey) => CORE_ALIAS[lineKey] ?? lineKey.split(':')[1].replace(/-/g, '');

const BRAND_WORD = { asics: 'asics', nike: 'nike', adidas: 'adidas', hoka: 'hoka', newbalance: 'new balance', saucony: 'saucony', brooks: 'brooks', on: 'on', mizuno: 'mizuno', salomon: 'salomon', puma: 'puma', altra: 'altra', underarmour: 'under armour', merrell: 'merrell', lining: 'li-ning', xtep: 'xtep' };
export function judge(row, title, siblings) {
  const t = norm(title), ts = squash(title);
  // 브랜드가 제목 첫머리에 있어야 한다(브랜드 없는 검색어가 다른 브랜드 상품을 끌어오는 것을 막는다 — Bally Axony, Genesis Footwear 사고)
  const bw = BRAND_WORD[row.line_key.split(':')[0]];
  if (bw && !t.startsWith(norm(bw)) && !(bw === 'on' && t.startsWith('on running'))) return 'brand';
  const c = core(row.line_key);
  // 세대 숫자가 이름 가운데 끼는 라인(Cloudmonster 3 Hyper, Feidian 6 Elite): 숫자를 빼고 한 번 더 본다
  const tsNoNum = norm(title).split(' ').filter((w) => !/^v?\d+(\.0)?$/.test(w)).join('');
  if (ts.indexOf(c) < 0 && tsNoNum.indexOf(c) < 0) return 'line';
  for (const s of siblings) if (ts.includes(s)) return 'sibling';
  const g = Number(row.generation);
  // 세대 숫자: 낱말 하나 — 뒤에 % · 소수점이 붙으면 다른 신발(Vaporfly 4%)
  // "3.0" 은 3 이다(Prime X 3.0 Strung, Cielo X1 3.0). 그 밖의 소수점은 다른 신발(4.5)
  //   글자에 붙은 숫자(X1 · 3D)는 세대가 아니다. 880v15 처럼 라인 숫자에 붙은 v 세대는 떼어 읽는다
  const t2 = t.replace(/(\d+)\.0(?![\d])/g, '$1').replace(/(\d)v(\d)/g, '$1 v$2');
  const nums = [...t2.matchAll(/(?<![\w.])v?(\d+)(?![\w.%])(?!\s*%)/g)].map((m) => Number(m[1]));
  const pct = /(?<![\d.])\d+\s*%/.test(t);
  if (pct && !/next%/.test(t)) return 'percent';
  const lineNums = new Set((row.line_en.match(/\b\d{3,4}\b/g) ?? []).map(Number)); // 880 · 1080 같은 라인 숫자
  const gens = nums.filter((n) => !lineNums.has(n) && n < 100);
  if (g === 1) { if (gens.length && !gens.includes(1)) return 'generation'; return 'ok'; }
  if (!gens.includes(g)) return 'generation';
  if (gens.some((n) => n !== g && Math.abs(n - g) <= 2)) return 'other-generation';
  return 'ok';
}

function key() {
  const f = process.env.KICKSDB_KEY_FILE;
  if (!f || !fs.existsSync(f)) throw new Error('KICKSDB_KEY_FILE 가 없다');
  return fs.readFileSync(f, 'utf8').trim();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;
async function search(q, k) {
  const file = path.join(CACHE, crypto.createHash('sha1').update(q).digest('hex') + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const wait = lastCall + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const res = await fetch(`${API}?${new URLSearchParams({ query: q, limit: '20' })}`, { headers: { Authorization: `Bearer ${k}` } });
  if (res.status === 429) throw new Error('KicksDB 429 — 한도');
  if (!res.ok) throw new Error(`KicksDB ${res.status}`);
  const body = await res.json();
  const out = { q, at: new Date().toISOString(), quota: res.headers.get('x-quota-current'), data: body.data ?? [] };
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out));
  return out;
}
const bigImage = (u) => u && u.replace(/([?&])w=\d+&h=\d+/, '$1w=700&h=500');
const GENDER_RANK = { men: 0, unisex: 1, women: 2 };

export function pick(row, hits, siblings) {
  const passed = hits.filter((h) => judge(row, h.title ?? '', siblings) === 'ok');
  if (!passed.length) {
    const why = hits.slice(0, 3).map((h) => `${judge(row, h.title ?? '', siblings)}:${h.title}`);
    return { status: 'review', reason: 'not_on_stockx', matched: 0, near: why };
  }
  // sku 계열 교차 확인 — 같은 성별 안에서 품번 앞 5자 최빈값(남녀 품번이 다르다: M880… / W880…).
  //   아디다스는 색상마다 품번이 따로라 계열이 없다 → 확인하지 않는다
  const pre = (s) => (s ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase();
  const familyCheck = !row.line_key.startsWith('adidas:');
  const majorOf = (gender) => {
    const counts = {}; for (const h of passed.filter((x) => x.gender === gender)) counts[pre(h.sku)] = (counts[pre(h.sku)] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  // StockX 자리표시 이미지(Product-Placeholder-Default)는 이미지가 아니다 — 화면에서 X 로 보였다(2026-10-28 사용자)
  const clean = passed.filter((h) => !EXCLUDE.some((re) => re.test(h.title)) && h.image && !/Product-Placeholder/i.test(h.image));
  const pool = clean.length ? clean : [];
  if (!pool.length) return { status: 'review', reason: 'only_variants', matched: passed.length, near: passed.slice(0, 3).map((h) => h.title) };
  pool.sort((a, b) => (GENDER_RANK[a.gender] ?? 3) - (GENDER_RANK[b.gender] ?? 3)
    || (pre(a.sku) === majorOf(a.gender) ? 0 : 1) - (pre(b.sku) === majorOf(b.gender) ? 0 : 1)
    || (a.rank ?? 1e9) - (b.rank ?? 1e9));
  const best = pool[0];
  const notes = [];
  if (best.gender !== 'men' && best.gender !== 'unisex') notes.push(`gender=${best.gender}`);
  if (familyCheck && pre(best.sku) !== majorOf(best.gender)) notes.push('sku_family_differs');
  return {
    status: notes.length ? 'review' : 'ok', reason: notes.join(',') || undefined, matched: passed.length,
    image: bigImage(best.image), sku: best.sku, slug: best.slug, title: best.title, gender: best.gender, gallery360: (best.gallery_360 ?? []).length,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
  const rows = parseCsv(fs.readFileSync(path.join(ROOT, 'candidates.csv'), 'utf8')).filter((r) => !only || r.line_key === only);
  const allCores = [...new Set(parseCsv(fs.readFileSync(path.join(ROOT, 'candidates.csv'), 'utf8')).map((r) => r.line_key))];
  const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const k = key();
  let n = 0;
  for (const row of rows) {
    if (n >= limit) break;
    const id = `${row.line_key}#${row.generation}`;
    const brand = row.line_key.split(':')[0];
    const c = core(row.line_key);
    const siblings = allCores.filter((lk) => lk.startsWith(brand + ':') && lk !== row.line_key && core(lk).includes(c)).map(core);
    const res = await search(row.stockx_query, k);
    n++;
    let r = pick(row, res.data, siblings);
    // 번호 없이 나온 첫 세대: "… 1" 로 못 찾으면 번호 없는 검색어로 한 번 더
    if (r.status !== 'ok' && row.generation === '1' && /\s1$/.test(row.stockx_query)) {
      const res2 = await search(row.stockx_query.replace(/\s1$/, ''), k); n++;
      const r2 = pick(row, res2.data, siblings);
      if (r2.status === 'ok' || !r.image) r = r2;
    }
    out[id] = { ...r, query: row.stockx_query, quota: res.quota };
    console.log(`${r.status.padEnd(6)} ${id.padEnd(40)} ${r.title ?? r.reason}`);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
}

// 이미지 없는 행 다시 찾기(2026-10-21): 검색어를 바꾸고, 공식몰 페이지(이미 읽은 캐시)의 품번으로도 찾는다
const SHORT = { 'Hoka One One': 'Hoka', 'On Running': 'On', 'New Balance': 'New Balance', ASICS: 'Asics' };
function altQueries(row, codes) {
  const brand = row.stockx_query.split(' ').slice(0, row.stockx_query.startsWith('Hoka One One') || row.stockx_query.startsWith('On Running') || row.stockx_query.startsWith('New Balance') || row.stockx_query.startsWith('Under Armour') ? (row.stockx_query.startsWith('Hoka One One') ? 3 : 2) : 1).join(' ');
  const rest = row.stockx_query.slice(brand.length).trim();
  const noGen = rest.replace(/\s*v?\d+(\.\d)?\+?(?=\s|$)/, '').trim();
  const qs = [SHORT[brand] && SHORT[brand] !== brand ? `${SHORT[brand]} ${rest}` : null, rest, `${SHORT[brand] ?? brand} ${noGen}`, ...codes];
  return [...new Set(qs.filter((q) => q && q !== row.stockx_query))];
}
async function retryMissing() {
  const k = key();
  const out = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const rows = parseCsv(fs.readFileSync(path.join(ROOT, 'candidates.csv'), 'utf8'));
  const codesFile = path.join(ROOT, 'local/work/store-codes.json');
  const codes = fs.existsSync(codesFile) ? JSON.parse(fs.readFileSync(codesFile, 'utf8')) : {};
  const allCores = [...new Set(rows.map((r) => r.line_key))];
  let calls = 0, found = 0;
  for (const row of rows) {
    const id = `${row.line_key}#${row.generation}`;
    if (out[id]?.status === 'ok' || out[id]?.image) continue;
    const brand = row.line_key.split(':')[0], c = core(row.line_key);
    const siblings = allCores.filter((lk) => lk.startsWith(brand + ':') && lk !== row.line_key && core(lk).includes(c)).map(core);
    let best = null;
    for (const q of altQueries(row, codes[id] ?? [])) {
      const res = await search(q, k); calls++;
      const r = pick(row, res.data, siblings);
      if (r.image && (!best || r.status === 'ok')) best = { ...r, query: q, quota: res.quota, retried: true };
      if (r.status === 'ok') break;
    }
    if (best) { out[id] = best; found++; }
    console.log(`${best ? best.status.padEnd(6) : 'none  '} ${id.padEnd(40)} ${best?.title ?? ''} ${best ? '← ' + best.query : ''}`);
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('retry calls', calls, 'found', found);
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes('--retry-missing')) retryMissing().catch((e) => { console.error(e.message); process.exit(1); });
else if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
