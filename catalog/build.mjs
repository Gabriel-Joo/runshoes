// candidates.csv + local/work/stockx.json + local/work/specs-*.jsonl → shoes.jsonl, 그리고 집계.
//   node catalog/build.mjs        — 규칙은 docs/CATALOG_PIPELINE.md 6장(표기 · 중간 포맷 · status)
// 스펙 파일 한 줄: { line_key, generation, exists: true|false|null, line_en_official?, weight_g, drop_mm, stack_heel_mm, midsole,
//                   carbon, wide_available, price_krw, sources: { 필드: URL }, conflicts?: [..], note? }
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseCsv } from './stockx.mjs';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const WORK = path.join(ROOT, 'local/work');
const RANGE = { weight: [80, 400], drop: [0, 14], stackHeight: [10, 65], price: [10000, 600000] };
// 가격 하한 1만 원(2026-10-28 사용자 — 범위는 0원 · 1원 같은 오류를 거르는 것이지 싼 입문화를 빼는 게 아니다. 상한 60만 원 유지)
// 2026-10-21 사용자: 무게 80~400(아디오스 프로 에보 3 95g대) · 드롭 0~14(알트라 0) · 스택 10~65(맥시멀 61mm 웨이브 레벨리온 프로 3, 레이싱 플랫은 20mm 아래도 있다)
// 모델명: 한글 · 숫자 · 공백 · 가운뎃점이 기본, 라틴 낱말은 허용 목록만(6.1)
const LATIN_OK = new Set(['X', 'GTS', 'GT-1000', 'GT-2000', 'GT-4000', 'ACG', 'AMP', 'BYD', 'SL', 'ST', 'TR', 'TT', 'S/LAB', 'XA', '3D', 'V9', 'VIA', 'X1', '160X', 'TR3', 'XX', 'R', 'FWD', 'AC']);
function modelOk(m) {
  return m.split(' ').every((t) => /^[가-힣·]+$/.test(t) || /^V\d+$/.test(t) || /^v?\d+(\.\d+)?\+?$/.test(t) || LATIN_OK.has(t));
}

const cands = parseCsv(fs.readFileSync(path.join(ROOT, 'candidates.csv'), 'utf8'));
const stockx = fs.existsSync(path.join(WORK, 'stockx.json')) ? JSON.parse(fs.readFileSync(path.join(WORK, 'stockx.json'), 'utf8')) : {};
// 사람이 화면에서 찾은 이미지 문제(2026-10-28): 박스 사진 · 자리표시 이미지 → 다른 색상으로 바꾸거나(image) 이미지 없음(none)으로. stockx.mjs 를 다시 돌려도 이것이 먼저다
for (const [id, o] of Object.entries(JSON.parse(fs.readFileSync(path.join(ROOT, 'decisions.json'), 'utf8')).image_overrides ?? {})) {
  if (o.none) stockx[id] = { status: 'review', reason: o.reason ?? 'no_clean_image' };
  else stockx[id] = { ...(stockx[id] ?? {}), status: 'ok', reason: undefined, image: o.image, sku: o.sku, title: o.title, gender: 'men' };
}
// 감사(audit.mjs) 결과는 파일 · 행마다 있다(<file>::<id>) — 읽을 때 그 기록에 먼저 적용한 뒤 합친다
const audit = fs.existsSync(path.join(WORK, 'audit.json')) ? JSON.parse(fs.readFileSync(path.join(WORK, 'audit.json'), 'utf8')) : {};
let auditDropped = 0;
function applyAudit(f, s) {
  const fields = audit[`${f}::${s.line_key}#${s.generation}`] ?? {};
  for (const [k, why] of Object.entries(fields)) {
    if (why.startsWith('weight_other_size')) { s._weightBasis = `US_${why.split(':')[1]}`; continue; }  // M9 가 아닌 사이즈 — 값은 두고 그 사이즈를 기준으로 표시(2026-10-21 사용자: 'M10' 같은 실제 값)
    if (why === 'weight_size_unknown') { s._weightBasis = 'unknown'; continue; }  // 값은 두고 partial + weight_basis=unknown
    if (k === 'width' && s.sources?.width) { s.width = null; delete s.sources.width; auditDropped++; (s.conflicts ??= []).push(`unverified_source:width:${why}`); continue; }  // 발볼 근거가 다른 신발 · 모음 글
    if (s.sources?.[k]) { delete s.sources[k]; auditDropped++; (s.conflicts ??= []).push(`unverified_source:${k}:${why}`); }
  }
  return s;
}
// 소스에서 뺀 곳(2026-10-23 사용자: solereview) — 거기서 온 값은 지운다(다른 기록 · 스펙 상자가 채운다). 카본은 출처 면제라 값은 두고 출처만 뗀다
//   decisions.json 의 사람 판단은 출처가 solereview 여도 그대로 둔다(사람이 정한 것)
const EXCLUDED = /solereview\.com/;
let excludedDropped = 0, excludedCarbon = 0;
function stripExcluded(s) {
  for (const [k, u] of Object.entries(s.sources ?? {})) {
    if (!EXCLUDED.test(u ?? '')) continue;
    delete s.sources[k];
    if (k === 'exists') continue;
    if (k === 'carbon') { excludedCarbon++; continue; }
    if (s[k] !== null && s[k] !== undefined) { s[k] = null; (s.missing ??= {})[k] = 'source_excluded'; excludedDropped++; }
  }
  if (s.conflicts) s.conflicts = s.conflicts.filter((c) => !EXCLUDED.test(c));
  return s;
}
const STORE_HOST = /^https?:\/\/(www\.nbkorea\.com|saucony\.co\.kr|www\.brooksrunning\.co\.kr|kor\.mizuno\.com|salomon\.co\.kr|kr\.puma\.com|altra\.co\.kr|www\.asics\.co\.kr|www\.merrellkorea\.co\.kr)\//;
const DEC = JSON.parse(fs.readFileSync(path.join(ROOT, 'decisions.json'), 'utf8'));
// 가격 메타(V5, 2026-10-28 사용자): 정가만 — 출처 '공식몰' | 'ABC마트', 읽은 날, 종류는 늘 '정가'. 다나와 · 쿠팡 참고가는 취소했다(docs 2.2.2)
//   읽은 날: 공식몰은 받은 페이지 캐시의 fetched_at, ABC마트는 렌더 기록(local/work/abcmart-rendered.json)의 rendered_at
const ABC_RENDER = fs.existsSync(path.join(WORK, 'abcmart-rendered.json')) ? JSON.parse(fs.readFileSync(path.join(WORK, 'abcmart-rendered.json'), 'utf8')) : {};
const CACHE_DIR = path.join(ROOT, 'local/cache');
function fetchedAt(url) {
  const f = path.join(CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex') + '.json');
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')).fetched_at?.slice(0, 10) ?? null; } catch { return null; }
}
function priceMeta(url, note) {
  if (!/^https?:\/\//.test(url ?? '')) return { source: null, checked_at: null, kind: null };  // 시드 20켤레의 운영 값(db.json) — 어디서 읽었는지 기록이 없다
  if (/^https:\/\/abcmart\.a-rt\.com\//.test(url)) return { source: 'ABC마트', checked_at: ABC_RENDER[url]?.rendered_at ?? null, kind: '정가' };
  if (STORE_HOST.test(url)) return { source: '공식몰', checked_at: fetchedAt(url) ?? (note?.match(/\((20\d\d-\d\d-\d\d)\)/) ?? [])[1] ?? null, kind: '정가' };
  return { source: null, checked_at: null, kind: null };
}
const specs = new Map();
for (const f of fs.existsSync(WORK) ? fs.readdirSync(WORK).filter((x) => /^specs-.*\.jsonl$/.test(x)) : []) {
  for (const line of fs.readFileSync(path.join(WORK, f), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const s = stripExcluded(applyAudit(f, JSON.parse(line)));
    // 발볼(토박스 너비)은 토박스 근거(local/width.csv → fill) · 사람 판단만 — 수집 에이전트가 적은 발볼은 토박스로 한정한 값이 아니다(2026-10-23)
    if (s.width != null) { s.width = null; if (s.sources) delete s.sources.width; }
    // 사람이 '공식값을 택한다'로 정리한 충돌은 지운다(지금 값이 공식 출처) — decisions.json resolve_official
    for (const [fk, d] of Object.entries(DEC.rows[`${s.line_key}#${s.generation}`] ?? {})) if (d.action === 'resolve_official' && s.conflicts) s.conflicts = s.conflicts.filter((c) => !c.startsWith(fk + ':') && !c.startsWith(fk.replace('_g', '').replace('stack_heel_mm', 'stack') + ':'));
    const id = `${s.line_key}#${s.generation}`;
    const prev = specs.get(id);
    if (!prev) { specs.set(id, { ...s, _file: f }); continue; }
    // 같은 행의 기록이 여러 파일에 있으면(그룹 수집 + 보도자료) 빈 필드만 채우고, 값이 다르면 충돌로 남긴다
    for (const k of ['weight_g', 'drop_mm', 'stack_heel_mm', 'midsole', 'carbon', 'wide_available', 'price_krw']) {
      if (s[k] === undefined || s[k] === null) continue;
      if (prev[k] === undefined || prev[k] === null) { prev[k] = s[k]; (prev.sources ??= {})[k] = s.sources?.[k]; if (prev.missing) delete prev.missing[k]; if (k === 'weight_g') { if (s._weightBasis) prev._weightBasis = s._weightBasis; else delete prev._weightBasis; } }  // 무게 사이즈 판정(감사)도 값과 함께 옮긴다(2026-10-24: 공식몰 '사이즈 불명' 값이 M9 로 붙던 것)
      // 와이드: 증명되지 않은 false(공식몰 확인이 아닌 것)는 페이지 근거가 있는 true 에 진다 — 충돌이 아니다
      else if (k === 'wide_available' && prev[k] === false && s[k] === true && !prev._wideProven) { prev[k] = true; prev.sources[k] = s.sources?.[k]; }  // 증명되지 않은 false 는 페이지 근거가 있는 true 에 진다
      else if (prev[k] !== s[k]) (prev.conflicts ??= []).push(`${k}: ${prev[k]} vs ${s[k]} (${s.sources?.[k]})`);
      else if (k === 'weight_g' && prev._weightBasis === 'unknown' && s._weightBasis !== 'unknown' && s.sources?.[k]) { prev.sources[k] = s.sources[k]; delete prev._weightBasis; }  // 같은 값을 US M9 출처가 확인
    }
    prev._file += '+' + f;
  }
}

// 기존 20켤레: 값은 DB 시드(db.json = V2, 운영과 같다 — 다나와를 보며 손으로 채운 값)에서 온다. 다시 수집하지 않는다
const basisM9 = new Set();  // 사람이 US M9 실측 출처로 확정한 무게
const decBasis = new Map();  // 사람이 적은 무게 측정 사이즈(decisions.json weight_basis — 'US_M9' · 'US_M10' · 'unknown'). 노트 추정보다 먼저다(2026-10-23)
for (const [id, f] of Object.entries(DEC.rows)) if (f.weight_g?.action === 'use_source' && f.weight_g.weight_basis) decBasis.set(id, f.weight_g.weight_basis);
const seed = new Map(JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'db.json'), 'utf8')).shoes.map((s) => [s.id, s]));
for (const c of cands) {
  if (!c.existing_id) continue;
  //   값은 운영과 같은 DB 값을 유지하고, 따로 모은 값(specs-existing)이 같으면 그 URL 을 출처로 단다.
  //   다르면(0.5 넘게, 문자 · 참거짓은 불일치) conflicts 로 → review. 출처를 못 찾은 필드는 db.json 표시가 남는다(no_url)
  const id = `${c.line_key}#${c.generation}`;
  const got = specs.get(id);
  const s = seed.get(Number(c.existing_id)), dbsrc = `db.json#shoes/${c.existing_id}`;
  const v = { weight_g: s.weight, drop_mm: s.drop, stack_heel_mm: s.stackHeight, midsole: s.midsole, carbon: s.carbon, wide_available: s.wideAvailable, price_krw: s.price };
  // 출처 URL 은 그 페이지에 같은 값이 있을 때만 단다 — 0.5 차이도 다른 값이다(2026-10-23: 님버스 27 DB 43.5 에 BITR(44) URL 이 붙었다)
  const tol = { weight_g: 0.01, stack_heel_mm: 0.01, drop_mm: 0.01, price_krw: 1 };
  const sources = {}, conflicts = [], noUrl = [];
  for (const [k, x] of Object.entries(v)) {
    const y = got?.[k], u = got?.sources?.[k];
    const d0 = DEC.rows[id]?.[k];  // 사람의 판단이 수집값보다 먼저다(수집값이 없어도, DB 값이 비어 있어도 적용 — 클라우드 10 스택)
    if (x === null && d0?.action !== 'use_source') continue;
    if (d0?.action === 'keep_db') { sources[k] = `${dbsrc} (사용자 확인: ${d0.note})`; continue; }
    if (d0?.action === 'use_source') { v[k] = d0.value ?? y; sources[k] = d0.source ?? u; if (k === 'weight_g' && /M9/.test(d0.note)) basisM9.add(id); continue; }
    if (y === undefined || y === null || !u) { sources[k] = dbsrc; noUrl.push(k); continue; }
    const same = typeof x === 'number' ? Math.abs(x - y) < tol[k] : String(x).toLowerCase().replace(/\s/g, '') === String(y).toLowerCase().replace(/\s/g, '');
    const d = DEC.rows[id]?.[k];
    if (d?.action === 'keep_db') { sources[k] = `${dbsrc} (사용자 확인: ${d.note})`; continue; }
    if (d?.action === 'review') { sources[k] = dbsrc; conflicts.push(`decision_pending:${k}: ${d.note}`); continue; }
    if (d?.action === 'use_source') { v[k] = d.value ?? y; sources[k] = d.source ?? u; if (k === 'weight_g') basisM9.add(id); continue; }
    if (same) sources[k] = u; else { sources[k] = dbsrc; conflicts.push(`db_differs:${k}: db ${x} vs ${y} (${u})`); }  // 운영에 있는 값이라 적재를 막지 않는다 — todo 에 충돌로만 올린다(사람이 웹 검색으로 확인)
  }
  // 기존 행 정가는 비운다(출처 URL 없음 · 다나와는 쓰지 않는다)
  if (DEC.existing_price?.action === 'clear') { v.price_krw = null; delete sources.price_krw; }
  const dw = DEC.rows[id]?.width?.action === 'use_source' ? DEC.rows[id].width : null;  // 토박스 판단(사람 · Claude 웹 검색)은 기존 행에도
  if (dw) sources.width = dw.source;
  specs.set(id, { line_key: c.line_key, generation: Number(c.generation), exists: true, ...v, width: dw?.value ?? null, sources, conflicts,  // 발볼은 토박스로 다시 판정한다 — DB(다나와) 발볼은 토박스 판정이 아니다(2026-10-23)
   
    missing: Object.fromEntries(Object.entries(v).filter(([, x]) => x === null).map(([k]) => [k, k === 'price_krw' && DEC.existing_price?.action === 'clear' ? 'no_source(cleared)' : 'not_published'])),
    _noUrl: noUrl, _file: got ? 'db.json+specs-existing' : 'db.json' });
}

// 와이드: true 는 출처 페이지의 언급으로, false 는 1단계 브랜드 국내 공식몰에서 와이드 제품이 없음을 확인한 경우만(2026-10-21 사용자).
//   그 밖의 false(매체 · DB 값)는 침묵으로 증명한 것이라 null 로 둔다
let wideFalseDropped = 0;
function wideOf(s) {
  const v = s?.wide_available;
  if (v === true) return true;
  // false 는 리뷰의 "no wide" 명시 · 사람 판단 · 브랜드 글로벌 라인업 근거(decisions)만 — 국내 공식몰 라인업에 없다는 것은 근거가 아니다(2026-10-24 사용자: 국내 유통사가 들여놓지 않았을 뿐일 수 있다)
  if (v === false) { if (s._wideProven) return false; wideFalseDropped++; (s.missing ??= {}).wide_available = STORE_HOST.test(s.sources?.wide_available ?? '') ? 'domestic_lineup_not_evidence' : 'false_not_proven'; return null; }
  return null;
}

// fill.mjs 의 결과(정해진 출처 순서로 채운 값)를 합친 기록 위에 얹는다. 기존 20켤레는 빈 필드만
const OVR = fs.existsSync(path.join(WORK, 'overrides.json')) ? JSON.parse(fs.readFileSync(path.join(WORK, 'overrides.json'), 'utf8')) : {};
const SPECK = { weight: 'weight_g', drop: 'drop_mm', stackHeight: 'stack_heel_mm', midsole: 'midsole', width: 'width' };
const BASE = process.env.BASE === '1';  // fill.mjs 가 읽을 바탕(채우기 전) 데이터
for (const [id, fields] of Object.entries(BASE ? {} : OVR)) {
  const s = specs.get(id); if (!s) continue;
  const existing = s._file?.startsWith('db.json');
  for (const [f, o] of Object.entries(fields)) {
    const k = SPECK[f];
    if (existing && s[k] != null) continue;
    s[k] = o.value; s.sources ??= {};
    if (o.source) s.sources[k] = o.source; else delete s.sources[k];
    if (o.value === null) (s.missing ??= {})[k] = 'unverified_removed'; else if (s.missing) delete s.missing[k];
    if (f === 'weight') { if (o.weight_basis && o.weight_basis !== 'US_M9') s._weightBasis = o.weight_basis; else delete s._weightBasis; }
    if (s.conflicts) s.conflicts = s.conflicts.filter((c) => !new RegExp(`(^|:)(${k}|${f}|${f === 'stackHeight' ? 'stack' : f})\\b`).test(c));
    if (existing && f !== 'width') s.sources[k] = o.source;
  }
}

// 사람의 판단(decisions.json use_source)은 모든 행에 마지막으로 적용한다 — 기존 20켤레는 아래 기존 행 블록이 같은 일을 한다
for (const [id, fields] of Object.entries(DEC.rows)) {
  const s = specs.get(id); if (!s || s._file?.startsWith('db.json')) continue;
  for (const [k, d] of Object.entries(fields)) {
    // hold · flag: 값은 두고 사람이 확인한다 — 수집 기록의 충돌 메모는 적재를 막지 않는다(todo · conflict-todo 에는 남는다)
    if ((d.action === 'hold' || d.action === 'flag') && s.conflicts) { s.conflicts = s.conflicts.filter((c) => !c.includes(k) && !c.includes(k.replace('_g', '').replace('stack_heel_mm', 'stack'))); continue; }
    // review: 값은 두되 사람이 다시 볼 때까지 적재하지 않는다(status review) — 본디 8 스택처럼 다른 세대와 맞지 않는 값(2026-10-24)
    if (d.action === 'review') { (s.conflicts ??= []).push(`decision_pending:${k}: ${d.note}`); continue; }
    if (d.action === 'clear') { s[k] = null; if (s.sources) delete s.sources[k]; (s.missing ??= {})[k] = 'cleared_by_user'; continue; }  // 근거 부족 — 비운다(발볼 · 카본 …, 2026-10-24 모든 필드로 넓힘)
    if (d.action !== 'use_source') continue;
    s[k] = d.value; (s.sources ??= {})[k] = d.source; if (s.missing) delete s.missing[k];
    if (s.conflicts) s.conflicts = s.conflicts.filter((c) => !c.includes(k) && !c.includes(k.replace('_g', '').replace('stack_heel_mm', 'stack')));
    if (k === 'weight_g') { if (/M9/.test(d.note)) { delete s._weightBasis; basisM9.add(id); } else s._weightBasis = 'unknown'; }
  }
}

// 와이드 false — 리뷰의 "no wide" 언급(local/work/wide-no.jsonl, extract-fit 이 냄 · 2026-10-23 사용자 승인). 사람 · Claude 판단(decisions)이 있으면 그것이 먼저.
//   같은 행에 true 근거가 있으면 두 근거가 맞지 않으니 비운다(충돌로 남긴다)
const WIDE_NO = fs.existsSync(path.join(WORK, 'wide-no.jsonl')) ? fs.readFileSync(path.join(WORK, 'wide-no.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse) : [];
let wideNoSet = 0, wideNoClash = 0;
for (const w of WIDE_NO) {
  const id = `${w.line_key}#${w.generation}`, s = specs.get(id); if (!s || DEC.rows[id]?.wide_available) continue;
  if (s.wide_available === true) { s.wide_available = null; if (s.sources) delete s.sources.wide_available; (s.missing ??= {}).wide_available = 'yes_and_no_disagree'; wideNoClash++; continue; }
  s.wide_available = false; (s.sources ??= {}).wide_available = w.sources.wide_available; s._wideProven = true; if (s.missing) delete s.missing.wide_available; wideNoSet++;
}
for (const [id, f] of Object.entries(DEC.rows)) if (f.wide_available?.action === 'use_source' && f.wide_available.value === false && specs.get(id)) specs.get(id)._wideProven = true;

// DB 컬럼 이름으로 낸다(V4, 2026-10-23): 수집한 스펙은 모두 제조사 공시값 → official_*. 실측(measured_*)은 지금 모두 null
//   official_weight_size: 'M9' · 'M10.5' …, 출처가 사이즈를 밝히지 않으면 null. official_spec_size(스택 · 드롭 기준 사이즈)는 제조사가 밝히지 않아 null — M9 라고 단정하지 않는다
//   _review · _missing 의 낱말(weight · drop · stackHeight)은 안쪽 진단용으로 그대로 둔다
const SRC_DB = { weight: 'official_weight_g', drop: 'official_drop_mm', stackHeight: 'official_heel_mm', width: 'toebox_width' };
//   측정값은 사람이 decisions.json 에 적은 것만(measured_weight_g: {value, size, source}) — 공식값과 측정값이 다를 때 둘 다 둔다(2026-10-23 사용자).
//   어느 쪽을 화면에 쓸지는 비교 페이지에서 정한다
function toDb(row) {
  const { weight, weight_basis, drop, stackHeight, sources, width, ...rest } = row;
  const mw = DEC.rows[`${row.line_key}#${row.generation}`]?.measured_weight_g;
  const spec = {
    official_weight_g: weight, official_weight_size: weight === null || !weight_basis || weight_basis === 'unknown' ? null : weight_basis.replace(/^US_/, ''),
    official_heel_mm: stackHeight, official_drop_mm: drop, official_spec_size: null,
    measured_weight_g: mw?.value ?? null, measured_weight_size: mw?.size ?? null, measured_heel_mm: null, measured_drop_mm: null,
    measured_source: mw?.source ?? null, measured_count: mw ? (mw.count ?? 1) : null,
  };
  const o = {};
  for (const [k, v] of Object.entries(rest)) { o[k] = v; if (k === 'midsole') Object.assign(o, spec, { toebox_width: width }); }  // 스펙 · 발볼(토박스 너비, V4 toebox_width)은 midsole 다음에
  o.sources = Object.fromEntries(Object.entries(sources).map(([k, v]) => [SRC_DB[k] ?? k, v]));
  return o;
}
const out = [], dropped = [];
const today = new Date().toISOString().slice(0, 10);
for (const c of cands) {
  const id = `${c.line_key}#${c.generation}`;
  const s = specs.get(id);
  const sx = stockx[id];
  // 직전 세대가 실제로 없으면(스펙 조사 · StockX 둘 다 못 찾음) 행을 만들지 않는다 — 실패가 아니다
  if (c.is_current === 'false' && s?.exists === false) { dropped.push({ id, why: 'previous generation does not exist', note: s.note }); continue; }
  const missing = {}, reasons = [];
  const src = { ...(s?.sources ?? {}) };
  const specKey = { weight: 'weight_g', drop: 'drop_mm', stackHeight: 'stack_heel_mm', price: 'price_krw', midsole: 'midsole' };
  const val = (k, v) => { if (v === null || v === undefined || v === '') { missing[k] = s ? (s.missing?.[specKey[k]] ?? s.missing?.[k] ?? 'not_found') : 'not_collected'; return null; } const sk = src[k] ?? src[srcKey[k]]; if (!sk || !(/^https?:\/\//.test(sk) || /사용자 확인/.test(sk) || sk === 'manual')) reasons.push(/^db\.json#/.test(sk) ? `db_value:${k}` : `no_url:${k}`); return v; };  // db_value = 기존 행의 운영 값(다나와, 출처 URL 없음). 적재를 막지 않고 todo 에 X 로 보인다(2026-10-23)  // manual = 사용자가 직접 확인
  const srcKey = { weight: 'weight_g', drop: 'drop_mm', stackHeight: 'stack_heel_mm', price: 'price_krw', wideAvailable: 'wide_available' };
  for (const [a, b] of Object.entries(srcKey)) if (src[b] && !src[a]) { src[a] = src[b]; delete src[b]; }
  const row = {
    catalog_key: id.replace('#', ':'),
    line_key: c.line_key, generation: Number(c.generation), is_current: c.is_current === 'true',
    brand: c.brand, model: c.model,
    purpose: c.purpose, stability: c.stability,
    midsole: val('midsole', s?.midsole),
    weight: val('weight', s?.weight_g),
    weight_basis: null, drop: val('drop', s?.drop_mm), stackHeight: val('stackHeight', s?.stack_heel_mm),
    // 발볼 · 와이드는 기본값으로 메우지 않는다(2026-10-21 — 기본값 '보통' / false 가 결손을 가렸다). 비면 null + _missing
    width: s?.width ?? null,
    wideAvailable: wideOf(s),
    carbon: s?.carbon ?? null,  // 후보 초안(라인업 조사)의 카본 칸은 출처가 없어 쓰지 않는다
    // 가격은 참고가(다나와 공식판매처 · 쿠팡, 2026-10-28 사용자)만 — 공식몰 정가(specs-store-price · 시드 DB)는 쓰지 않는다. 기준이 둘이 되지 않게
    price: val('price', s?.price_krw), price_source: null, price_checked_at: null, price_kind: null,
    summary: '', description: '',
    sku: sx?.sku ?? null, slug: sx?.slug ?? null,
    images: sx?.image ? [{ url: sx.image, source: 'stockx' }] : [],
    sources: src,
    status: 'ok', _missing: missing, _review: reasons,
    _editorial: [...(s?.width ? [] : ['width:default']), ...(s?.wide_available === undefined || s?.wide_available === null ? ['wideAvailable:default'] : [])],
    existing_id: c.existing_id ? Number(c.existing_id) : null,
    checked_at: today,
  };
  // 무게 측정 기준: 감사에서 사이즈 불명이거나 출처가 DB(다나와 수동)면 unknown, 아니면 US_M9
  if (row.weight !== null) {
    const ws = row.sources.weight ?? '';
    row.weight_basis = decBasis.get(id) ?? (basisM9.has(id) ? 'US_M9' : s?._weightBasis ? s._weightBasis : !/^https?:\/\//.test(ws) ? 'unknown' : 'US_M9');
  }
  if (row.price !== null) { const m = priceMeta(src.price, s?.note); row.price_source = m.source; row.price_checked_at = m.checked_at; row.price_kind = m.kind; }
  if (row.width === null) missing.width = 'not_found';
  if (row.wideAvailable === null) missing.wideAvailable = s?.missing?.wide_available ?? 'not_found';
  if (row.carbon === null) { missing.carbon = s?.missing?.carbon ?? 'not_found'; }
  // 카본은 출처 URL 을 요구하지 않는다(2026-10-21 사용자 — 예/아니오, 모델 · 용도로 거의 정해진다). 수동 입력이면 sources.carbon = 'manual'
  for (const [k, [lo, hi]] of Object.entries(RANGE)) if (row[k] !== null && (row[k] < lo || row[k] > hi)) reasons.push(`range:${k}=${row[k]}`);
  if (!modelOk(row.model)) reasons.push('model_spelling');
  if (s?.conflicts?.length) reasons.push(...s.conflicts.map((x) => `conflict:${x}`));
  if ((!sx || sx.status !== 'ok') && !(DEC.rows[id]?.image?.action === 'accept_image' && sx?.image)) reasons.push(`image:${sx?.reason ?? 'not_matched'}`);  // 사람이 받아들인 이미지는 통과
  // 최소 스펙: 무게 · 드롭 · 스택 3개 중 2개 이상(2026-10-24 사용자 — 정가는 소스가 막혀 못 채우는 필드라 적재를 막지 않는다)
  const nums = ['weight', 'drop', 'stackHeight'].filter((k) => row[k] !== null).length;
  if (!s) row.status = 'failed';
  else if (nums === 0 && !row.midsole) row.status = 'failed';
  // 와이드 · 발볼은 비어도 되는 필드라 근거를 뗀 것만으로는 막지 않는다(값은 null). 카본도 출처 면제 항목이라 막지 않는다(2026-10-24)
  else if (reasons.some((x) => !x.startsWith('conflict:db_differs:') && !x.startsWith('db_value:') && !/^conflict:unverified_source:(wide_available|width|carbon):/.test(x)) || nums < 2) row.status = 'review';  // 카본이 비었다고 막지 않는다(2026-10-24 사용자 — 카본은 출처 면제 항목, 화면은 "정보 없음")
  else if (Object.keys(missing).length) row.status = 'partial';
  if (nums < 2 && s) reasons.push(`min_fields:${nums}/3`);
  out.push(toDb(row));
}
fs.writeFileSync(BASE ? path.join(WORK, 'shoes.base.jsonl') : path.join(ROOT, 'shoes.jsonl'), out.map((r) => JSON.stringify(r)).join('\n') + '\n');
fs.writeFileSync(path.join(WORK, 'dropped.json'), JSON.stringify(dropped, null, 1));

// 집계
const by = (f) => out.reduce((m, r) => ((m[f(r)] = (m[f(r)] ?? 0) + 1), m), {});
const pct = (n, d) => `${n}/${d} (${d ? Math.round((n / d) * 100) : 0}%)`;
console.log('audit: sources removed', auditDropped, '| wide false → null(증명 안 됨)', wideFalseDropped, '| 리뷰 no wide → false', wideNoSet, '· true 와 맞지 않아 비움', wideNoClash, '| solereview 값 지움', excludedDropped, '· 카본 출처만 뗌', excludedCarbon);
console.log('rows', out.length, '| lines', new Set(out.map((r) => r.line_key)).size, '| dropped(no previous gen)', dropped.length);
console.log('status', by((r) => r.status));
console.log('status × current', by((r) => `${r.is_current ? 'cur' : 'prev'}:${r.status}`));
for (const k of ['official_weight_g', 'official_drop_mm', 'official_heel_mm', 'price', 'midsole', 'carbon', 'toebox_width', 'wideAvailable']) console.log(`missing ${k.padEnd(11)}`, pct(out.filter((r) => r[k] === null).length, out.length));
console.log('official_weight_size', by((r) => String(r.official_weight_size)));
console.log('image missing', pct(out.filter((r) => !r.images.length).length, out.length));
const rv = {}; for (const r of out) for (const x of r._review) { const k = x.split(':')[0] + ':' + (x.split(':')[1] ?? '').split('=')[0]; rv[k] = (rv[k] ?? 0) + 1; }
console.log('review reasons', rv);
