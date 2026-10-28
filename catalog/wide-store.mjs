// 와이드 판(2E · 4E · 와이드 · WIDE · SW)이 나오는지 — 국내 공식몰 검색 결과의 상품명으로 본다(2026-10-23 사용자)
//   true : 그 모델 · 세대 상품명 옆에 와이드 표기가 있다
//   false: 그 모델 · 세대의 남성 · 남녀공용 상품은 검색에 나오는데 와이드 표기가 하나도 없다(라인업을 확인했는데 없음). 리뷰에 와이드 언급이 있으면 쓰지 않는다
//   비움 : 검색 결과에 그 모델 · 세대가 없다
//   발볼과는 상관없다(와이드 제공은 브랜드 정책이지 라스트 너비가 아니다)
//   받기는 local/fetch.mjs(허용 호스트 · robots · 호스트 간격). 검색 페이지는 각 몰의 검색 기능 주소다
//   결과: local/work/specs-store-wide.jsonl · local/work/store-wide.json(행마다 판정 · 본 문맥)
import fs from 'node:fs';
import { get } from './local/fetch.mjs';

const U = (f) => new URL(`./${f}`, import.meta.url);
const R = fs.readFileSync(U('local/work/shoes.base.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).filter((r) => r.images.length);
const cand = new Map(fs.readFileSync(U('candidates.csv'), 'utf8').replace(/\r/g, '').trim().split('\n').slice(1).map((l) => l.split(',')).map((c) => [`${c[0]}#${c[1]}`, { en: c[5], ko: c[6] }]));
const reviewWide = new Set(fs.readFileSync(U('local/work/specs-wide.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse).filter((s) => s.wide_available === true).map((s) => `${s.line_key}#${s.generation}`));
const SEARCH = {
  newbalance: (q) => `https://www.nbkorea.com/product/searchResult.action?schWord=${encodeURIComponent(q)}`,
  saucony: (q) => `https://saucony.co.kr/product/search.html?keyword=${encodeURIComponent(q)}`,
  brooks: (q) => `https://www.brooksrunning.co.kr/product/search.html?keyword=${encodeURIComponent(q)}`,
  mizuno: (q) => `https://kor.mizuno.com/product/search.html?keyword=${encodeURIComponent(q)}`,
  salomon: (q) => `https://salomon.co.kr/search?q=${encodeURIComponent(q)}&type=product`,
  puma: (q) => `https://kr.puma.com/kr/ko/search?q=${encodeURIComponent(q)}`,
  altra: (q) => `https://altra.co.kr/product/search.html?keyword=${encodeURIComponent(q)}`,
  merrell: (q) => `https://www.merrellkorea.co.kr/product/search.html?keyword=${encodeURIComponent(q)}`,
};
// 우리 행은 남성이다 — 여성 전용 상품(여성 · WOMEN)은 보지 않는다("여성 글리세린 23 (WIDE)" 로 남성 와이드를 판정하던 것)
const WOMEN_ONLY = (w) => /(여성|WOMEN|\bW\b)/.test(w) && !/(남성|\bMEN\b|남녀공용|UNISEX|유니섹스)/i.test(w);
const WIDE = /(\b2E\b|\b4E\b|와이드|광폭|\bWIDE\b|\bWide\b|\bSW\b|\bSSW\b)/;
const text = (b) => b.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 검색어: 영문 라인 이름(세대 숫자 뺌), 한글 모델명(세대 숫자 뺌)
const lineName = (s, gen) => s.replace(new RegExp(`\\s*v?${gen}(\\.0)?\\s*$`, 'i'), '').replace(/^(Fresh Foam X|FuelCell|Gel-|S\/LAB)\s*/i, '').trim();
const pages = new Map();
async function search(brand, q) {
  const u = SEARCH[brand](q);
  if (pages.has(u)) return pages.get(u);
  let t = null; try { const p = await get(u); t = p.status === 200 ? text(p.body) : null; } catch { t = null; }
  pages.set(u, { u, t }); return pages.get(u);
}

const out = [], log = {};
for (const r of R) {
  const brand = r.line_key.split(':')[0]; if (!SEARCH[brand]) continue;
  const id = `${r.line_key}#${r.generation}`, c = cand.get(id) ?? {}, g = r.generation;
  const names = [lineName(c.en ?? '', g), lineName(r.model, g)].filter((x) => x && x.length >= 2);
  // 상품명에서 그 세대를 찾는 정규식: "1080 v15" · "1080v15" · "킨바라 16" · "Kinvara 16"
  const gens = names.map((n) => new RegExp(`${esc(n).replace(/\\ /g, '\\s*')}\\s*(v|V)?\\s*${g}(?![\\d.])`, 'gi'));
  let found = [], wide = [], url = null;
  for (const q of [...new Set(names)]) {
    const p = await search(brand, q); if (!p.t) continue;
    for (const re of gens) for (const m of p.t.matchAll(re)) {
      const win = p.t.slice(Math.max(0, m.index - 30), m.index + m[0].length + 40);
      if (WOMEN_ONLY(win)) continue;
      found.push(win); if (WIDE.test(win)) { wide.push(win); url = url ?? p.u; }
    }
    url = url ?? (found.length ? p.u : null);
  }
  // 다른 출처(리뷰 · 수집 기록)가 이미 와이드 true 면 false 를 내지 않는다 — 국내몰에 없을 뿐일 수 있다
  const verdict = wide.length ? true : found.length ? (reviewWide.has(id) || r.wideAvailable === true ? 'other_true' : false) : null;
  log[id] = { verdict, url, wide: wide.slice(0, 2), seen: found.slice(0, 2) };
  // false 는 내지 않는다(2026-10-24 사용자): 국내 라인업은 글로벌 라인업의 일부라, 국내몰에 와이드가 없어도 브랜드가 안 만든다는 근거가 아니다. true(국내몰에 와이드 상품이 있음)만 쓴다
  if (verdict === true) out.push({ line_key: r.line_key, generation: g, wide_available: verdict, sources: { wide_available: url }, note: verdict ? `국내 공식몰 검색 — 와이드 상품: ${wide[0].slice(0, 80)}` : `국내 공식몰 검색 — 이 세대 상품 ${found.length}건, 와이드 표기 없음` });
}
fs.writeFileSync(U('local/work/specs-store-wide.jsonl'), out.map((x) => JSON.stringify(x)).join('\n') + (out.length ? '\n' : ''));
fs.writeFileSync(U('local/work/store-wide.json'), JSON.stringify(log, null, 1));
const by = (f) => Object.values(log).reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
console.log('공식몰 대상 행', Object.keys(log).length, '| 판정', by((x) => String(x.verdict)));
