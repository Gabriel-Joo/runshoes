// WearTesters 리뷰(2026-10-24 사용자 승인) — 사이트맵에서 그 모델 · 세대의 리뷰 주소만 골라 받는다. 발볼(토박스) 근거는 extract-fit 이 같은 규칙으로 읽는다.
//   주소는 사이트맵에 있는 것만(local/work/weartesters-index.txt). 읽기는 fetch.mjs(robots · 5초 · 캐시)로만.
//   같은 신발: 주소 낱말에 라인 이름이 다 있고, 세대 숫자가 맞고(1세대는 숫자 없음), 남은 낱말이 브랜드 · 채움말 · 리뷰 낱말뿐이어야 한다(다른 판 · 비교 글을 뺀다)
import fs from 'node:fs';
import { get } from './local/fetch.mjs';

const U = (p) => new URL(p, import.meta.url);
const R = fs.readFileSync(U('shoes.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const BRAND = { newbalance: ['new', 'balance'], underarmour: ['under', 'armour'] };
const FILL0 = ['fresh', 'foam', 'fuelcell', 'fuel', 'cell', 'gel', 'air', 'zoom', 'performance', 'review', 'mens'];
// 'x' 는 NB 'Fresh Foam X' 에서만 채움말(호카 Mach X · Skyward X 는 다른 신발)

const idx = U('local/work/weartesters-index.txt');
if (!fs.existsSync(idx) || process.env.REFRESH) {
  const top = await get('https://weartesters.com/sitemap_index.xml', { useCache: !process.env.REFRESH });
  const subs = [...top.body.matchAll(/<loc>([^<]*post-sitemap\d*\.xml)<\/loc>/g)].map((m) => m[1]);
  const urls = [];
  for (const s of subs) { const r = await get(s, { useCache: !process.env.REFRESH }); for (const m of r.body.matchAll(/<loc>(https:\/\/weartesters\.com\/[^<]+)<\/loc>/g)) if (/review/i.test(m[1])) urls.push(m[1]); }
  fs.writeFileSync(idx, urls.join('\n') + '\n');
}
const P = fs.readFileSync(idx, 'utf8').trim().split('\n');

const match = (r) => {
  const [b, line] = r.line_key.split(':');
  const FILL = new Set([...FILL0, ...(b === 'newbalance' ? ['x'] : [])]);
  const brand = BRAND[b] ?? [b], words = line.split('-');
  const want = new Set([...brand, ...words]), gen = String(r.generation);
  return P.filter((u) => {
    const t = u.replace('https://weartesters.com/', '').replace(/\/$/, '').toLowerCase().split('-');
    if (!t.includes('review') || t.includes('womens') || t.includes('vs')) return false;
    if (!words.filter((w) => !FILL.has(w)).every((w) => t.includes(w))) return false;
    const nums = t.filter((x) => /^v?\d{1,2}$/.test(x)).map((x) => x.replace(/^v/, ''));
    if (r.generation === 1 ? nums.some((n) => n !== '1') : !nums.includes(gen)) return false;
    return t.every((x) => want.has(x) || FILL.has(x) || x.replace(/^v/, '') === gen || (r.generation === 1 && x === '1'));
  });
};

const hits = {}, log = { rows: R.length, matched: 0, ambiguous: [], fetched: 0, failed: [] };
for (const r of R) {
  const m = match(r);
  if (!m.length) continue;
  if (m.length > 1) { log.ambiguous.push(`${r.catalog_key}: ${m.join(' | ')}`); continue; }
  log.matched++;
  try { const p = await get(m[0]); if (p.status === 200) { log.fetched++; hits[`${r.line_key}#${r.generation}`] = [m[0]]; } else log.failed.push(`${r.catalog_key}: HTTP ${p.status}`); }
  catch (e) { log.failed.push(`${r.catalog_key}: ${e.message}`); }
}
fs.writeFileSync(U('local/work/weartesters-hits.json'), JSON.stringify(hits, null, 1));
console.log(JSON.stringify({ ...log, ambiguous: log.ambiguous.length, failed: log.failed.length }));
if (log.ambiguous.length) console.log('ambiguous:\n  ' + log.ambiguous.join('\n  '));
if (log.failed.length) console.log('failed:\n  ' + log.failed.join('\n  '));
