// 사람이 채울 작업 파일 하나(2026-10-21): 신발 하나 = 한 줄(line_key + generation). 출처는 약자 코드, 실제 URL 은 todo-sources.csv
//   코드(2026-10-23): BITR believeintherun · RSG runningshoesguru · STORE 브랜드 국내 공식몰 · PR 보도자료 · WEB 사람이 웹 검색(Claude)으로 찾음(URL 있음)
//                     · MAN 사람이 직접 확인 · DB 기존 DB(다나와 입력) · SX StockX. solereview 는 소스에서 뺐다(사람 판단에 남은 것만 SOLE)
//   WEB 과 MAN 은 decisions.json 의 via('web' | 'manual')로 가른다. WEB 의 URL 은 사람이 찾은 것이라 fetch 로 다시 읽지 않는다(차단 호스트일 수도 있다)
//   입력 칸(맨 뒤): '<필드> 입력' 에 값, '<필드> 입력출처' 에 'WEB <URL>' 또는 'MAN'(URL 이 있으면 'MAN <URL>'). 무게는 '무게 사이즈'(M9 · M10 · W7.5 …, 모르면 비움 = 기준불명)
//   값은 shoes.jsonl 의 공시값(official_weight_g · official_drop_mm · official_heel_mm)이다
//   사유(필드:사유): 충돌 · 기준불명 · 출처없음 · 미검증 · 비어있음 · 근거양쪽 · 보류. 맨 앞의 '적재:불가'는 지금 그 행이 실리지 않는다는 뜻
//   후보가 둘이면 '325 | 345', 출처도 'A | B'. 카본은 출처 면제라 출처 칸이 없다
//   대상: 이미지가 있는 행 중 사유가 하나라도 있는 행. 못 실리는 행을 먼저 둔다
import fs from 'node:fs';
import { badToeboxQuote } from './toebox-filter.mjs';
import crypto from 'node:crypto';
import { whereOnPage } from './bitr-text.mjs';

const U = (f) => new URL(`./${f}`, import.meta.url);
const R = fs.readFileSync(U('shoes.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const BASE = new Map(fs.readFileSync(U('local/work/shoes.base.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).map((r) => [`${r.line_key}#${r.generation}`, r]));
const SB = JSON.parse(fs.readFileSync(U('local/work/specbox.json'), 'utf8'));
const DEC = JSON.parse(fs.readFileSync(U('decisions.json'), 'utf8'));
const cand = new Map(fs.readFileSync(U('candidates.csv'), 'utf8').replace(/\r/g, '').trim().split('\n').slice(1).map((l) => l.split(',')).map((c) => [`${c[0]}#${c[1]}`, { en: c[5], purpose: c[7] }]));
const parseCsv = (s) => s.replace(/^﻿/, '').replace(/\r/g, '').trim().split('\n').map((l) => { const o = []; let c = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(c); c = ''; } else c += ch; } o.push(c); return o; });
const esc = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
const code = (u) => !u ? '' : u === 'manual' ? 'MAN' : /believeintherun/.test(u) ? 'BITR' : /runningshoesguru/.test(u) ? 'RSG' : /fit2run\.com/.test(u) ? 'F2R' : /solereview/.test(u) ? 'SOLE'
  : /mediahub\.puma|corp\.asics|amersports|saucony\.com/.test(u) ? 'PR' : /nbkorea|saucony\.co\.kr|brooksrunning\.co\.kr|kor\.mizuno|salomon\.co\.kr|kr\.puma\.com|altra\.co\.kr|asics\.co\.kr|merrellkorea/.test(u) ? 'STORE'
  : /db\.json|사용자 확인/.test(u) ? 'DB' : /stockx/.test(u) ? 'SX' : '?';
// 발볼(토박스) 근거가 여러 종류인 행 — solereview(소스에서 뺌) 근거는 빼고 다시 본다
const EXCL = /solereview\.com/;
const widthAmb = new Map((fs.existsSync(U('local/width.csv')) ? parseCsv(fs.readFileSync(U('local/width.csv'), 'utf8')).slice(1) : []).map((c) => {
  const ev = [[c[5], c[6]], [c[7], c[8]], [c[9], c[10]]].filter(([q, u]) => q && u && !EXCL.test(u) && !badToeboxQuote(q.replace(/^\S+:\s*/, '')));
  return [`${c[0]}#${c[1]}`, ev];
}).filter(([, ev]) => new Set(ev.map(([q]) => q.split(':')[0])).size > 1));
// 미검증으로 뗀 출처는 원래 수집 기록에서 찾아 코드로 보여 준다(값과 함께 무엇을 뗐는지 보이게)
const RAW = new Map();
for (const f of fs.readdirSync(U('local/work')).filter((x) => /^specs-.*\.jsonl$/.test(x))) for (const l of fs.readFileSync(U(`local/work/${f}`), 'utf8').split('\n')) if (l.trim()) { const s = JSON.parse(l); const k = `${s.line_key}#${s.generation}`; RAW.set(k, { ...(RAW.get(k) ?? {}), ...Object.fromEntries(Object.entries(s.sources ?? {}).filter(([, u]) => u)) }); }
// 공식값(D · E, 감사 통과) — 지금 값(스펙 상자 등)과 다르면 충돌로 보인다(2026-10-23 사용자: 펄사 4 · 맥맥스 1)
const AUD = JSON.parse(fs.readFileSync(U('local/work/audit.json'), 'utf8'));
const OFFV = new Map();
for (const f of fs.readdirSync(U('local/work')).filter((x) => /^specs-.*\.jsonl$/.test(x))) for (const l of fs.readFileSync(U(`local/work/${f}`), 'utf8').split('\n')) if (l.trim()) {
  const s = JSON.parse(l), id = `${s.line_key}#${s.generation}`, bad = AUD[`${f}::${id}`] ?? {};
  for (const k of ['weight_g', 'drop_mm', 'stack_heel_mm']) { const u = s.sources?.[k]; if (s[k] != null && u && ['STORE', 'PR'].includes(code(u)) && !bad[k] && !OFFV.has(`${id}|${k}`)) OFFV.set(`${id}|${k}`, { v: s[k], u }); }
}
const rawSrc = (id, k) => RAW.get(id)?.[{ weight: 'weight_g', drop: 'drop_mm', stackHeight: 'stack_heel_mm', midsole: 'midsole' }[k] ?? k];
const INPUT = ['무게 입력', '무게 사이즈', '무게 입력출처', '드롭 입력', '드롭 입력출처', '스택 입력', '스택 입력출처', '미드솔 입력', '미드솔 입력출처', '카본 입력', '발볼 입력', '발볼 입력출처', '와이드 입력', '와이드 입력출처'];
const DECKEY = { 무게: 'weight_g', 드롭: 'drop_mm', 스택: 'stack_heel_mm', 미드솔: 'midsole', 발볼: 'width', 와이드: 'wide_available' };
const loadable = (r) => r.status === 'ok' || r.status === 'partial';
const TOL = 0.5;

const lines = [], src = [];
for (const r of R.filter((x) => x.images.length || DEC.rows[`${x.line_key}#${x.generation}`]?.image)) {
  const id = `${r.line_key}#${r.generation}`, base = BASE.get(id) ?? r, b = SB[id]?.bitr ?? {}, g = SB[id]?.rsg ?? {};
  const why = [], cell = {};
  const d = DEC.rows[id] ?? {};
  const codeOf = (f, u, i) => (i === 0 && d[DECKEY[f]]?.action === 'use_source' && u && u === d[DECKEY[f]].source && d[DECKEY[f]].via === 'web' ? 'WEB' : i === 0 && !u && r.existing_id && f === '발볼' ? 'DB' : code(u));
  const put = (f, vals, urls) => { if (!urls.length && vals.length) urls = [undefined]; cell[f] = { v: vals.map((x) => (x === true ? '예' : x === false ? '아니오' : x)).join(' | '), s: urls.map((u, i) => codeOf(f, u, i)).join(' | ') }; urls.forEach((u, i) => u && src.push([r.line_key, r.generation, f, codeOf(f, u, i), u, vals[i]])); };
  // 숫자 세 필드
  // c = shoes.jsonl 의 공시값 이름, k = 진단(_review · _missing)의 낱말, label = 수집 기록 · decisions.json 의 이름
  for (const [f, c, k, label] of [['무게', 'official_weight_g', 'weight', 'weight_g'], ['드롭', 'official_drop_mm', 'drop', 'drop_mm'], ['스택', 'official_heel_mm', 'stackHeight', 'stack_heel_mm']]) {
    const v = r[c], u = r.sources?.[c];
    const boxB = k === 'weight' ? b.weight_g : k === 'drop' ? b.drop_mm : b.stack_heel_mm, boxG = k === 'weight' ? null : k === 'drop' ? g.drop_mm : g.stack_heel_mm;
    const human = ['keep_db', 'use_source'].includes(DEC.rows[id]?.[label]?.action);  // resolve_official 은 상자 규칙 전의 판단이라 충돌을 가리지 않는다(펄사 4: 공식 34 를 고른 뒤 상자 31 로 바뀜)
    // BITR 본문 값(상자가 못 읽은 값)이 본문 문장에서 왔거나 페이지에 없으면 확인 대상(2026-10-23 사용자 — "If I had to guess", 독자 댓글)
    const bv = base[c], bu = base.sources?.[c];
    if (!r.existing_id && !human && bv != null && /believeintherun/.test(bu ?? '')) {
      const boxV = label === 'weight_g' ? (b.weight_g ?? b.weight_any_g) : boxB;
      if (!(boxV != null && Math.abs(boxV - bv) <= TOL && b.url === bu) && whereOnPage(bu, label, bv).where !== 'box') {
        const same = v != null && Math.abs(v - bv) <= TOL && u === bu;
        put(f, v == null ? [bv] : same ? [v] : [v, bv], v == null ? [bu] : same ? [u] : [u, bu]); why.push(`${f}:본문값`); continue;
      }
    }
    if (v != null && boxB != null && boxG != null && Math.abs(boxB - boxG) > TOL && !human) {
      // 기존 20켤레의 DB 값이 두 상자 값 어느 쪽과도 다르면 DB 값을 맨 앞에 같이 보인다(Pegasus 스택 36 · 37 · 38)
      const dbOwn = r.existing_id && Math.abs(v - boxB) > TOL && Math.abs(v - boxG) > TOL;
      const vals = dbOwn ? [v, boxB, boxG] : [boxB, boxG], urls = dbOwn ? [u, b.url, g.url] : [b.url, g.url];
      const ofv = k !== 'weight' && OFFV.get(`${id}|${label}`);
      if (ofv) { vals.push(ofv.v); urls.push(ofv.u); }  // 공식값은 다른 후보와 같아도 따로 보인다(맥맥스 1: RSG 46 = 공식 46)
      put(f, vals, urls); why.push(`${f}:충돌`); continue;
    }
    // 지금 값이 BITR(상자 · 본문)인데 RSG 상자와 다르면 충돌(2026-10-23 — 우선순위 BITR → RSG 로 본문 값이 상자 값을 이기게 됐다. 본문 값은 추측 문장일 수 있다: 벨로시티 엘리트 2)
    if (v != null && boxB == null && boxG != null && /believeintherun/.test(u ?? '') && Math.abs(boxG - v) > TOL && !human) { put(f, [v, boxG], [u, g.url]); why.push(`${f}:충돌`); continue; }
    if (v != null && DEC.rows[id]?.[label]?.action === 'flag') { put(f, [v], [u]); why.push(`${f}:충돌`); continue; }  // 사람이 확인하라고 올린 값(출처 하나뿐 — 웨이브 레벨리온 프로 3 스택 61)
    const ofv = OFFV.get(`${id}|${label}`);
    if (v != null && ofv && !human && k !== 'weight' && Math.abs(ofv.v - v) > TOL && !['STORE', 'PR'].includes(code(u))) { put(f, [v, ofv.v], [u, ofv.u]); why.push(`${f}:충돌`); continue; }  // 무게는 공식몰 사이즈 미상이라 빼고 본다
    if (v != null && r.existing_id && !human) {  // 기존 20켤레: DB 값과 상자 값이 다르면
      const box = boxB ?? boxG, bu = boxB != null ? b.url : g.url;
      if (box != null && Math.abs(box - v) > TOL) { put(f, [v, box], [u, bu]); why.push(`${f}:충돌`); continue; }
    }
    if (v == null) {
      const old = base[c], ou = base.sources?.[c];
      if (old != null && r._missing?.[k] === 'unverified_removed' && !EXCL.test(ou ?? rawSrc(id, k) ?? '')) { put(f, [old], [ou ?? rawSrc(id, k)]); why.push(`${f}:미검증`); } else { put(f, [], []); why.push(`${f}:비어있음`); }
      continue;
    }
    const dd = r._review.map((x) => x.match(new RegExp(`^conflict:db_differs:${label}: db (\\S+) vs (\\S+) \\((.+)\\)$`))).find(Boolean);  // 기존 행: DB 값 vs 출처 값(880 v15 무게 300 vs RSG 303)
    if (dd && !human) { put(f, [v, Number(dd[2])], [u, dd[3]]); why.push(`${f}:충돌`); if (k === 'weight' && r.official_weight_size == null) why.push('무게:기준불명'); continue; }
    put(f, [v], [u]);
    if (r._review.some((x) => x === `no_url:${k}`)) why.push(`${f}:출처없음`);
    else if (r._review.some((x) => /^conflict/.test(x) && (x.includes(label) || x.includes(k)))) why.push(`${f}:충돌`);
    if (k === 'weight' && r.official_weight_size == null) why.push('무게:기준불명');
  }
  // 미드솔
  if (r.midsole != null) { put('미드솔', [r.midsole], [r.sources?.midsole]); if (r._review.includes('no_url:midsole')) why.push('미드솔:출처없음'); }
  else if (base.midsole != null && r._missing?.midsole === 'unverified_removed' && !EXCL.test(base.sources?.midsole ?? rawSrc(id, 'midsole') ?? '')) { put('미드솔', [base.midsole], [base.sources?.midsole ?? rawSrc(id, 'midsole')]); why.push('미드솔:미검증'); }
  else { put('미드솔', [], []); why.push('미드솔:비어있음'); }
  // 카본(출처 없음)
  cell['카본'] = { v: r.carbon === true ? '예' : r.carbon === false ? '아니오' : '' }; if (r.carbon == null) why.push('카본:비어있음');
  // 발볼
  if (r.toebox_width != null) put('발볼', [r.toebox_width], [r.sources?.toebox_width]);
  else if (widthAmb.has(id)) { const ev = widthAmb.get(id), ks = [...new Set(ev.map(([q]) => q.split(':')[0]))]; put('발볼', ks, ks.map((k) => ev.find(([q]) => q.startsWith(k))[1])); why.push('발볼:근거양쪽'); }  // 토박스 근거가 여러 종류
  else { put('발볼', [], []); why.push('발볼:비어있음'); }
  // 와이드
  if (r.wideAvailable != null) put('와이드', [r.wideAvailable], [r.sources?.wideAvailable ?? r.sources?.wide_available]); else { put('와이드', [], []); why.push('와이드:비어있음'); }
  // 이미지 보류(여성)
  const imgWhy = r._review.find((x) => x.startsWith('image:'));
  if (imgWhy) why.push(/women/.test(imgWhy) ? '이미지:보류(여성)' : `이미지:${imgWhy.slice(6)}`);
  if (!loadable(r)) why.unshift('적재:불가');
  if (why.length === (loadable(r) ? 0 : 1)) continue;
  const c = cand.get(id) ?? {};
  lines.push({ blocked: !loadable(r), row: [r.line_key, r.generation, r.model, c.en, c.purpose ?? r.purpose,
    cell['무게'].v, cell['무게'].s, cell['드롭'].v, cell['드롭'].s, cell['스택'].v, cell['스택'].s, cell['미드솔'].v, cell['미드솔'].s, cell['카본'].v, cell['발볼'].v, cell['발볼'].s, cell['와이드'].v, cell['와이드'].s, why.join(', '), ...Array(INPUT.length).fill('')] });
}
lines.sort((x, y) => (y.blocked - x.blocked) || x.row[0].localeCompare(y.row[0]) || y.row[1] - x.row[1]);
const head = ['line_key', 'generation', '모델', '영문', '용도', '무게', '무게출처', '드롭', '드롭출처', '스택', '스택출처', '미드솔', '미드솔출처', '카본', '발볼', '발볼출처', '와이드', '와이드출처', '사유', ...INPUT];
// 사람이 고친 todo.csv 는 덮어쓰지 않는다 — 마지막으로 만든 내용의 해시와 다르면 todo.new.csv 로
const GEN = U('local/work/generated.json'), gen = fs.existsSync(GEN) ? JSON.parse(fs.readFileSync(GEN, 'utf8')) : {};
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
const body = '\ufeff' + [head, ...lines.map((l) => l.row)].map((r) => r.map(esc).join(',')).join('\n') + '\n';
const cur = fs.existsSync(U('todo.csv')) ? fs.readFileSync(U('todo.csv'), 'utf8') : null;
if (cur !== null && gen['todo.csv'] && sha(cur) !== gen['todo.csv']) { fs.writeFileSync(U('todo.new.csv'), body); console.log('! todo.csv 는 사람이 고쳤다 — todo.new.csv 로 썼다'); }
else { fs.writeFileSync(U('todo.csv'), body); gen['todo.csv'] = sha(body); fs.writeFileSync(GEN, JSON.stringify(gen, null, 1)); }
fs.writeFileSync(U('todo-sources.csv'), '﻿' + [['line_key', 'generation', '필드', '코드', 'URL', '값'], ...src.filter((s) => s[3] && s[3] !== 'MAN')].map((r) => r.map(esc).join(',')).join('\n') + '\n');
// 집계
const reasons = {}; for (const l of lines) for (const w of l.row[18].split(', ')) { const k = w.split(':')[1]?.replace(/\(.*/, ''); if (w.startsWith('적재')) continue; reasons[k] = (reasons[k] ?? 0) + 1; }
console.log('todo.csv', lines.length, '줄 | 못 실림', lines.filter((l) => l.blocked).length, '| 실리지만 빈 칸 · 확인', lines.filter((l) => !l.blocked).length);
console.log('사유별 필드 수', reasons);
console.log('todo-sources.csv', src.length, '건');
