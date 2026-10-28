// 스펙 값을 출처 우선순위로 고른다(2026-10-23 사용자 규칙). 추측하지 않는다 — 값은 모두 페이지에서 정규식 · 수집으로 읽고 감사(audit.mjs)를 통과한 것.
//   우선순위: 공식(STORE 국내 공식몰 · PR 보도자료) → BITR 상자 → RSG 상자 → BITR 본문 → RSG 본문. WEB · MAN(사람의 판단, decisions.json)은 순위 밖이라 건드리지 않는다
//     'BITR 우선'은 상자 값 기준이다 — 본문 값(수집 에이전트가 문장에서 읽은 것)은 추측 · 비교 · 독자 댓글일 수 있어 RSG 상자 뒤다(2026-10-23 사용자)
//   무게는 US M9 가 먼저다: M9 로 확인된 값 → 다른 사이즈로 밝힌 값(그 사이즈 라벨) → 사이즈 불명 값. 각 묶음 안에서 위 우선순위
//   스택 · 드롭: 제조사 발표값. 공식 → BITR → RSG. 기준 사이즈는 정하지 않는다(official_spec_size null)
//   solereview 는 소스에서 뺐다(build.mjs EXCLUDED). 미드솔은 상자에서 읽지 않는다. 출처 미검증 값은 다른 후보가 없으면 null
//   발볼(토박스 너비): local/width.csv 의 제안값 — solereview · 다른 신발 근거는 빼고 다시 센다. 근거가 한 종류(좁음 · 보통 · 넓음)뿐인 행만
//   입력: local/work/shoes.base.jsonl(채우기 전 — BASE=1 node build.mjs). 결과: local/work/overrides.json · local/work/fill-log.json
import fs from 'node:fs';
import { otherShoe } from './variant.mjs';
import { badToeboxQuote } from './toebox-filter.mjs';

const U = (f) => new URL(`./${f}`, import.meta.url);
const R = fs.readFileSync(U('local/work/shoes.base.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).filter((r) => r.images.length);
const SB = JSON.parse(fs.readFileSync(U('local/work/specbox.json'), 'utf8'));
const DEC = JSON.parse(fs.readFileSync(U('decisions.json'), 'utf8'));
const AUD = JSON.parse(fs.readFileSync(U('local/work/audit.json'), 'utf8'));
const OFF = /nbkorea|saucony\.co\.kr|brooksrunning\.co\.kr|kor\.mizuno|salomon\.co\.kr|kr\.puma\.com|altra\.co\.kr|asics\.co\.kr|merrellkorea|mediahub\.puma|corp\.asics|amersports|saucony\.com/;
const EXCLUDED = /solereview\.com/;
const parseCsv = (s) => s.replace(/^﻿/, '').replace(/\r/g, '').trim().split('\n').map((l) => { const o = []; let c = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(c); c = ''; } else c += ch; } o.push(c); return o; });
const TOL = 0.5;
const SPEC = { weight: 'weight_g', drop: 'drop_mm', stackHeight: 'stack_heel_mm', midsole: 'midsole' };
const COL = { weight: 'official_weight_g', drop: 'official_drop_mm', stackHeight: 'official_heel_mm', midsole: 'midsole' };  // shoes.base.jsonl 의 이름
const CLASS = (u) => (OFF.test(u) ? 0 : /believeintherun/.test(u) ? 1 : /runningshoesguru/.test(u) ? 2 : 9);  // 상자 · 공식
const BODY = (u) => (OFF.test(u) ? 0.5 : /believeintherun/.test(u) ? 3 : /runningshoesguru/.test(u) ? 4 : 9);  // 본문 수집값
const NAME = ['공식', 'BITR', 'RSG', 'BITR', 'RSG'];

// 공식 후보 — 모든 수집 기록에서(파일마다 감사 결과가 다르다). 무게는 감사가 본 사이즈를 같이(없음 = M9 확인 · 다른 사이즈 · 불명)
const OFFC = new Map();
for (const f of fs.readdirSync(U('local/work')).filter((x) => /^specs-.*\.jsonl$/.test(x))) for (const l of fs.readFileSync(U(`local/work/${f}`), 'utf8').split('\n')) if (l.trim()) {
  const s = JSON.parse(l), id = `${s.line_key}#${s.generation}`, bad = AUD[`${f}::${id}`] ?? {};
  for (const k of ['weight_g', 'drop_mm', 'stack_heel_mm']) {
    const u = s.sources?.[k]; if (s[k] == null || !u || !OFF.test(u)) continue;
    const why = bad[k];
    if (why && !/^weight_(other_size|size_unknown)/.test(why)) continue;  // 감사에서 떨어진 값
    const size = k !== 'weight_g' ? null : !why ? 'M9' : why.startsWith('weight_other_size') ? why.split(':')[1] : null;
    const key = `${id}|${k}`; if (!OFFC.has(key)) OFFC.set(key, []);
    if (!OFFC.get(key).some((x) => x.u === u)) OFFC.get(key).push({ v: s[k], u, size, cls: 0, from: '공식' });
  }
}

// fit2run(소매점, 브랜드 스펙을 싣는다 — 2026-10-24 사용자 승인): BITR 상자 다음 · RSG 상자 앞(cls 1.5). 사이즈 표기가 없어 무게는 사이즈 불명
const F2R = fs.existsSync(U('local/work/fit2run.json')) ? JSON.parse(fs.readFileSync(U('local/work/fit2run.json'), 'utf8')) : {};

const ov = {};
const stat = { changed: 0, same_value_source_switched: 0, filled: 0, nulled_unverified: 0, by_winner: {}, replaced: [] };
const set = (id, f, value, source, why, extra = {}) => { (ov[id] ??= {})[f] = { value, source, why, ...extra }; };
const HUMAN = ['keep_db', 'use_source', 'hold', 'flag'];  // 사람이 정했거나 붙잡아 둔 필드 — 값을 바꾸지 않는다

for (const r of R) {
  const id = `${r.line_key}#${r.generation}`;
  const b = SB[id]?.bitr ?? {}, g = SB[id]?.rsg ?? {};
  const human = (f) => HUMAN.includes(DEC.rows[id]?.[SPEC[f]]?.action);
  // 미드솔: 출처가 미검증이면 비우기만(상자에서 읽지 않는다)
  if (r.midsole != null && !human('midsole') && !r.sources?.midsole && r._missing?.midsole === undefined && r._review.some((x) => /unverified_source:midsole|no_url:midsole/.test(x))) { set(id, 'midsole', null, null, 'null:unverified midsole'); stat.nulled_unverified++; }
  for (const f of ['drop', 'stackHeight', 'weight']) {
    if (human(f)) continue;
    const cur = r[COL[f]], src = r.sources?.[COL[f]] ?? '';
    const curSize = f === 'weight' ? r.official_weight_size : null;
    const C = [...(OFFC.get(`${id}|${SPEC[f]}`) ?? [])];
    if (f === 'weight') {
      if (b.weight_g != null) C.push({ v: b.weight_g, u: b.url, size: 'M9', cls: 1, from: 'BITR 상자' });
      else if (b.weight_any_g != null) C.push({ v: b.weight_any_g, u: b.url, size: b.weight_size, cls: 1, from: 'BITR 상자' });
      if (F2R[id]?.weight_g != null) C.push({ v: F2R[id].weight_g, u: F2R[id].url, size: null, cls: 1.5, from: 'fit2run' });
      if (g.weight_g_unknown_size != null) C.push({ v: g.weight_g_unknown_size, u: g.url, size: null, cls: 2, from: 'RSG 상자' });
    } else {
      const vb = f === 'drop' ? b.drop_mm : b.stack_heel_mm, vg = f === 'drop' ? g.drop_mm : g.stack_heel_mm;
      if (vb != null) C.push({ v: vb, u: b.url, cls: 1, from: 'BITR 상자' });
      const vf = f === 'drop' ? F2R[id]?.drop_mm : F2R[id]?.stack_heel_mm;
      if (vf != null) C.push({ v: vf, u: F2R[id].url, cls: 1.5, from: 'fit2run' });
      if (vg != null) C.push({ v: vg, u: g.url, cls: 2, from: 'RSG 상자' });
    }
    // 지금 값(본문 수집 · 감사 통과)도 후보 — 같은 사이트의 상자 뒤
    if (cur != null && /^https?:/.test(src) && !EXCLUDED.test(src) && !C.some((x) => x.u === src && Math.abs(x.v - cur) <= TOL)) C.push({ v: cur, u: src, size: curSize, cls: BODY(src), from: '본문' });
    const sizeRank = (x) => (x.size === 'M9' ? 0 : x.size ? 1 : 2);
    C.sort((x, y) => (f === 'weight' ? sizeRank(x) - sizeRank(y) : 0) || x.cls - y.cls);
    const best = C[0];
    if (!best) {
      // 후보가 없다 — 출처 미검증 값이면 비운다(사람 · DB 값은 둔다)
      if (cur != null && !src && r._review.some((x) => x.includes(`unverified_source:${SPEC[f]}`))) { set(id, f, null, null, 'null:unverified, no candidate'); stat.nulled_unverified++; }
      continue;
    }
    const extra = f === 'weight' ? { weight_basis: best.size ? `US_${best.size}` : 'unknown' } : {};
    const why = `${best.from}(${best.cls === 1.5 ? 'F2R' : NAME[Math.floor(best.cls)] ?? '기타'})`;
    stat.by_winner[`${f}:${why}`] = (stat.by_winner[`${f}:${why}`] ?? 0) + 1;
    if (cur == null) { set(id, f, best.v, best.u, `fill:${why}`, extra); stat.filled++; }
    else if (Math.abs(best.v - cur) > TOL) { set(id, f, best.v, best.u, `replace:${why} (was ${cur}, ${src})`, extra); stat.changed++; stat.replaced.push(`${id} ${f} ${cur}→${best.v} ${why}`); }
    else { set(id, f, best.v, best.u, `same:${why}`, extra); if (best.u !== src) stat.same_value_source_switched++; }
  }
}

// 발볼
const W = fs.existsSync(U('local/width.csv')) ? parseCsv(fs.readFileSync(U('local/width.csv'), 'utf8')).slice(1) : [];
const byId = new Map(R.map((r) => [`${r.line_key}#${r.generation}`, r]));
stat.width = 0;
for (const c of W) {
  const id = `${c[0]}#${c[1]}`, r = byId.get(id); if (!r || r.toebox_width != null || DEC.rows[id]?.width) continue;  // 사람이 정한 발볼은 그대로
  // 근거 셋(인용 · URL) 중 solereview · 다른 신발 · 모음 글을 빼고 다시 센다
  // 웹 근거와 같은 제외 필터(비교급 · 조건문 · 리뷰어 자기 발 · 표 라벨, toebox-filter.mjs — 2026-10-24 사용자 승인)
  const ev = [[c[5], c[6]], [c[7], c[8]], [c[9], c[10]]].filter(([q, u]) => q && u && !EXCLUDED.test(u) && !otherShoe(r.line_key, u) && !badToeboxQuote(q.replace(/^\S+:\s*/, '')));
  const kinds = new Set(ev.map(([q]) => q.split(':')[0]));
  if (kinds.size === 1) { const k = [...kinds][0]; set(id, 'width', k, ev[0][1], 'fill:width evidence'); stat.width++; }
}

fs.writeFileSync(U('local/work/overrides.json'), JSON.stringify(ov, null, 1));
fs.writeFileSync(U('local/work/fill-log.json'), JSON.stringify(stat, null, 1));
console.log(JSON.stringify({ ...stat, replaced: stat.replaced.length }));
