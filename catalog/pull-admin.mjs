// 관리 화면 수정 가져오기 — 진짜 관리자가 화면에서 고친 값을 카탈로그 판단으로 옮긴다(2026-10-29 사용자: "적재 때 되돌아가면 안 된다").
//   node pull-admin.mjs [--base http://127.0.0.1:3200] [--host <Host 헤더>]          # 건조 실행 — 무엇을 옮길지만 낸다
//   node pull-admin.mjs … --write                                                       # decisions.json · copy.json 에 쓴다 → node build.mjs
//   load.mjs --apply 가 적재 전에 저절로 --write 로 부른다(2026-10-30 사용자 — 멈추지 말고 끌어와서 진행, 로그에 남긴다). 결과는 local/work/pull-admin-last.json
// 알아보는 법: 적재기가 적재 직후에 둔 스냅숏(local/work/snapshot-<호스트>.json)과 지금 운영 값이 다른 칸 = 사람이 화면에서 고친 칸.
//   데모 관리자는 서버가 쓰기를 막는다 — 바뀐 칸은 진짜 관리자 계정의 수정이다. 읽기만 한다(GET), 운영에 쓰지 않는다.
// 옮기는 곳(2026-10-30 사용자 — 관리 화면 수정은 전부 의도한 수정이다, 다 옮기고 로그에 남긴다):
//   스펙 · 가격 → decisions.json rows(by: "user", via: "admin", 출처 "manual" = MAN), 문구 → copy.json, 대표 · 추가 이미지 → decisions.json image_overrides
//   브랜드 · 모델명 · 안정성 · 현행 · 라인키 · 세대 · 성별 · 실측 · 스펙 기준 사이즈 → decisions.json rows(build.mjs 가 후보 목록 값을 덮는다)
//   라인키 · 세대를 바꾼 행도 판단 행 키는 처음 후보 목록의 키(shoes.jsonl source_key)다. 카탈로그 밖 시드는 seed_only_images · seed_only_price_meta · copy.json
//   숨긴 신발(V8 — 관리 화면의 삭제) → decisions.json rows.hidden(빌드가 적재 대상에서 뺀다), 되살리면 지운다. 새로 넣은 신발(구조 변경)만 옮기지 않는다 — 적재기가 멈춘다
import fs from 'node:fs';
import http from 'node:http';
import { TRACKED, snapFile, canon } from './live-fields.mjs';

const U = (p) => new URL(p, import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:3200'), HOST = arg('--host', null), WRITE = process.argv.includes('--write');

function get(path) {
  if (!HOST) return fetch(BASE + path).then((r) => r.json());
  return new Promise((resolve, reject) => http.get(BASE + path, { headers: { Host: HOST } }, (res) => {
    let t = ''; res.setEncoding('utf8'); res.on('data', (c) => (t += c)); res.on('end', () => (res.statusCode === 200 ? resolve(JSON.parse(t)) : reject(new Error(`GET ${path} → ${res.statusCode}`))));
  }).on('error', reject));
}

const SNAP_FILE = snapFile(BASE, HOST);
if (!fs.existsSync(SNAP_FILE)) { console.error(`스냅숏이 없다(${SNAP_FILE.pathname}) — 운영 값이 카탈로그와 같을 때 node load.mjs --snapshot 으로 먼저 적는다`); process.exit(2); }
const SNAP = JSON.parse(fs.readFileSync(SNAP_FILE, 'utf8'));
const live = await get('/api/shoes');
const eq = (a, b) => canon(a ?? null) === canon(b ?? null);

// 칸 → 판단 키(decisions.json rows 의 필드 이름 — build.mjs 가 읽는 이름)
const SPEC = { weight: 'weight_g', drop: 'drop_mm', stackHeight: 'stack_heel_mm', midsole: 'midsole', width: 'width', wideAvailable: 'wide_available', carbon: 'carbon' };
const SPEC_FIELD = { weight: 'weight', drop: 'drop', stackHeight: 'stackHeight', midsole: 'midsole', width: 'width', wideAvailable: 'wideAvailable' };  // specSources 의 칸 이름
const PRICE = ['price', 'priceSource', 'priceCheckedAt', 'priceKind'];
const COPYK = ['summary', 'description'];
const LIST = { brand: 'brand', model: 'model', stability: 'stability', isCurrent: 'is_current' };  // 후보 목록 칸 — 판단으로 덮는다(build.mjs)
const IDENT = { lineKey: 'line_key', generation: 'generation', gender: 'gender' };  // 세대 구조 칸 — 판단으로 덮는다(build.mjs). 판단 행 키는 처음 후보 목록의 키(source_key) 그대로
const MEASURED = ['measuredWeight', 'measuredWeightSize', 'measuredSource', 'measuredCount'];  // → measured_weight_g { value, size, source, count }
const SINGLE = { measuredStackHeight: 'measured_heel_mm', measuredDrop: 'measured_drop_mm', specSize: 'official_spec_size' };
const IMG = ['image', 'images'];  // 대표 · 추가 이미지는 함께 옮긴다(build.mjs 가 둘 다 그대로 낸다)
// 운영 키(lineKey:generation) → 후보 목록 행 키. 관리 화면에서 라인키 · 세대를 바꾼 행은 둘이 다르다(build.mjs source_key)
//   스냅숏이 바꾸기 전 키를 들고 있을 수 있다(적재가 멈춰 스냅숏을 새로 못 적었다) — catalog_key 로 못 찾으면 source_key 로 찾는다
const BUILT = fs.readFileSync(U('shoes.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const SOURCE = new Map([...BUILT.map((r) => [r.source_key ?? r.catalog_key, r.source_key ?? r.catalog_key]), ...BUILT.map((r) => [r.catalog_key, r.source_key ?? r.catalog_key])]);

const DEC = JSON.parse(fs.readFileSync(U('decisions.json'), 'utf8'));
const COPY = JSON.parse(fs.readFileSync(U('copy.json'), 'utf8'));
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });  // 한국 날짜
const note = `관리 화면 수정(진짜 관리자 계정, 운영 ${HOST ?? new URL(BASE).host}, 스냅숏 ${SNAP.at.slice(0, 16)}Z 뒤 · 가져온 날 ${today})`;
const out = { moved: [], untouched: [], reportOnly: [], newShoes: [], hidden: [], restored: [] };
const fields = [];   // 새로 옮긴 칸 — { key, field, from, to, file } (적재기 로그 · pull-admin-last.json)
const same = (a, b) => ['action', 'value', 'weight_basis', 'price_source', 'price_checked_at', 'price_kind', 'size', 'source', 'count'].every((k) => eq(a?.[k], b?.[k]));
let already = 0;
const put = (id, field, d) => {
  const row = (DEC.rows[id] ??= {});
  if (row[field]?.via === 'admin' && same(row[field], d)) { already++; return false; }  // 이미 가져온 것(같은 스냅숏으로 다시 돌렸다)
  if (row[field]) d.previous = { ...row[field], previous: undefined };
  row[field] = d;
  return true;
};
const moved = (isNew, text, f) => { out.moved.push(text); if (isNew) fields.push(f); };

for (const s of live) {
  const was = SNAP.shoes[s.id];
  if (!was) {
    // 스냅숏에 없는 신발 — 숨겼다가 되살린 카탈로그 행이면 숨김 판단을 지운다. 아니면 관리 화면에서 새로 넣은 신발(구조 변경 — 적재기가 멈춘다)
    const rk = s.lineKey && s.generation != null ? SOURCE.get(`${s.lineKey}:${s.generation}`) : null, rid = rk?.replace(/:(?=[^:]*$)/, '#');
    if (rid && DEC.rows[rid]?.hidden?.action === 'hide') {
      DEC.rows[rid].hidden = { action: 'show', via: 'admin', by: 'user', note, previous: { ...DEC.rows[rid].hidden, previous: undefined } };
      out.restored.push(`${s.id} ${s.model} (${rk})`);
      fields.push({ key: rk, field: 'hidden', from: true, to: false, file: 'decisions.json' });
      continue;
    }
    out.newShoes.push(`${s.id} ${s.brand} ${s.model} (${s.lineKey ?? '-'}:${s.generation ?? '-'})`);
    continue;
  }
  const changed = TRACKED.filter((k) => !eq(was[k], s[k]));
  if (!changed.length) continue;
  const lk = was.lineKey ?? s.lineKey, gen = was.generation ?? s.generation;
  if (!lk || gen == null) { out.reportOnly.push(`${s.id} ${s.model}: lineKey 가 없어 카탈로그 행을 모른다 — ${changed.join(', ')}`); continue; }
  const liveKey = `${lk}:${gen}`, key = SOURCE.get(liveKey);
  const done = new Set();
  const imgMove = (target, label) => {  // 대표 · 추가 이미지를 함께 — 적재기가 둘 다 이 값으로 낸다
    IMG.forEach((x) => done.add(x));
    const cur = target[label], f = IMG.filter((x) => changed.includes(x));
    const isNew = !(cur?.via === 'admin' && eq(cur.image, s.image) && eq(cur.images, s.images));
    if (isNew) target[label] = { ...(cur ? { previous: { ...cur, previous: undefined } } : {}), image: s.image ?? null, images: s.images ?? [], via: 'admin', by: 'user', note, was: { image: was.image ?? null, images: was.images ?? [] } };
    else already++;
    moved(isNew, `${key ?? liveKey} ${f.join(' · ')}`, { key: key ?? liveKey, field: f.join(' · '), from: f.map((x) => was[x] ?? null), to: f.map((x) => s[x] ?? null), file: 'decisions.json' });
  };
  if (!key) {
    // 카탈로그 밖의 신발(엔돌핀 스피드 4 같은 시드) — 적재기가 덮는 칸은 이미지 · 가격 출처 · 문구뿐이다. 나머지는 덮지 않으니 그대로 둔다
    for (const k of changed) {
      if (done.has(k)) continue;
      if (IMG.includes(k)) { imgMove((DEC.seed_only_images ??= {}), String(s.id)); continue; }
      if (['priceSource', 'priceCheckedAt', 'priceKind'].includes(k)) {
        ['priceSource', 'priceCheckedAt', 'priceKind'].forEach((x) => done.add(x));
        const m = { price_source: s.priceSource ?? null, price_checked_at: s.priceCheckedAt ?? null, price_kind: s.priceKind ?? null }, cur = DEC.seed_only_price_meta?.[s.id];
        const isNew = !(cur?.via === 'admin' && ['price_source', 'price_checked_at', 'price_kind'].every((x) => eq(cur[x], m[x])));
        if (isNew) (DEC.seed_only_price_meta ??= {})[s.id] = { ...m, via: 'admin', by: 'user', note }; else already++;
        const f = ['priceSource', 'priceCheckedAt', 'priceKind'].filter((x) => changed.includes(x));
        moved(isNew, `${liveKey} ${f.join(' · ')}`, { key: liveKey, field: f.join(' · '), from: f.map((x) => was[x] ?? null), to: f.map((x) => s[x] ?? null), file: 'decisions.json' });
        continue;
      }
      if (COPYK.includes(k) && s.id <= 20) {
        COPYK.forEach((x) => done.add(x));
        const prev = COPY[liveKey], cf = changed.filter((x) => COPYK.includes(x));
        const isNew = !(eq(prev?.summary, s.summary) && eq(prev?.description, s.description) && prev?.seed_choice);
        if (isNew) COPY[liveKey] = { ...(prev ?? {}), summary: s.summary, description: s.description, seed_choice: 'admin', seed_id: s.id, admin_note: note }; else already++;
        moved(isNew, `${liveKey} 문구(${cf.join(' · ')})`, { key: liveKey, field: cf.join(' · '), from: cf.map((x) => was[x] ?? null), to: cf.map((x) => s[x] ?? null), file: 'copy.json' });
        continue;
      }
      out.untouched.push(`${s.id} ${s.model} ${k}: ${JSON.stringify(was[k])} → ${JSON.stringify(s[k])} (카탈로그 밖 신발 — 적재기가 덮지 않는다)`);
    }
    continue;
  }
  const id = key.replace(/:(?=[^:]*$)/, '#');  // 'brand:line:gen' → 'brand:line#gen'(마지막 콜론)
  for (const k of changed) {
    if (done.has(k)) continue;
    if (k === 'purpose') { out.untouched.push(`${key} purpose: ${JSON.stringify(was[k])} → ${JSON.stringify(s[k])} (적재기는 기존 행의 용도를 덮지 않는다)`); continue; }
    if (IDENT[k]) {
      moved(put(id, IDENT[k], { action: 'use_source', value: s[k] ?? null, via: 'admin', by: 'user', note }),
        `${key} ${k} ${JSON.stringify(was[k])} → ${JSON.stringify(s[k])}`, { key, field: k, from: was[k] ?? null, to: s[k] ?? null, file: 'decisions.json' });
      continue;
    }
    if (MEASURED.includes(k)) {
      MEASURED.forEach((x) => done.add(x));
      const f = MEASURED.filter((x) => changed.includes(x)), none = MEASURED.every((x) => s[x] == null);
      moved(put(id, 'measured_weight_g', none ? { action: 'clear', by: 'user', via: 'admin', note }
        : { action: 'use_source', value: s.measuredWeight ?? null, size: s.measuredWeightSize ?? null, source: s.measuredSource ?? null, count: s.measuredCount ?? null, via: 'admin', by: 'user', note }),
        `${key} ${f.join(' · ')}`, { key, field: f.join(' · '), from: f.map((x) => was[x] ?? null), to: f.map((x) => s[x] ?? null), file: 'decisions.json' });
      continue;
    }
    if (SINGLE[k]) {
      moved(put(id, SINGLE[k], s[k] == null ? { action: 'clear', by: 'user', via: 'admin', note } : { action: 'use_source', value: s[k], via: 'admin', by: 'user', note }),
        `${key} ${k} ${JSON.stringify(was[k])} → ${JSON.stringify(s[k])}`, { key, field: k, from: was[k] ?? null, to: s[k] ?? null, file: 'decisions.json' });
      continue;
    }
    if (IMG.includes(k)) { imgMove((DEC.image_overrides ??= {}), id); continue; }
    if (k === 'weight' || k === 'weightSize') {
      done.add('weight'); done.add('weightSize');
      moved(put(id, 'weight_g', s.weight == null ? { action: 'clear', by: 'user', via: 'admin', note }
        : { action: 'use_source', value: s.weight, source: 'manual', via: 'admin', by: 'user', weight_basis: s.weightSize ? `US_${s.weightSize}` : 'unknown', note }),
        `${key} 중량 ${JSON.stringify(was.weight)} ${was.weightSize ?? ''} → ${JSON.stringify(s.weight)} ${s.weightSize ?? '불명'}`,
        { key, field: 'weight · weightSize', from: [was.weight ?? null, was.weightSize ?? null], to: [s.weight ?? null, s.weightSize ?? null], file: 'decisions.json' });
      continue;
    }
    if (LIST[k]) {
      moved(put(id, LIST[k], { action: 'use_source', value: s[k], via: 'admin', by: 'user', note }),
        `${key} ${k} ${JSON.stringify(was[k])} → ${JSON.stringify(s[k])}`, { key, field: k, from: was[k] ?? null, to: s[k] ?? null, file: 'decisions.json' });
      continue;
    }
    if (k === 'specSources') {
      moved(put(id, 'spec_sources', { action: 'use_source', value: s.specSources ?? null, via: 'admin', by: 'user', note }),
        `${key} specSources ${JSON.stringify(was.specSources)} → ${JSON.stringify(s.specSources)}`, { key, field: k, from: was.specSources ?? null, to: s.specSources ?? null, file: 'decisions.json' });
      continue;
    }
    if (SPEC[k]) {
      const sk = SPEC_FIELD[k], url = s.specSources?.[sk]?.url;   // 관리 화면에서 고른 출처 주소가 있으면 그것이 근거다(없으면 manual = MAN)
      moved(put(id, SPEC[k], s[k] == null ? { action: 'clear', by: 'user', via: 'admin', note } : { action: 'use_source', value: s[k], source: url ?? 'manual', via: 'admin', by: 'user', note }),
        `${key} ${k} ${JSON.stringify(was[k])} → ${JSON.stringify(s[k])}`, { key, field: k, from: was[k] ?? null, to: s[k] ?? null, file: 'decisions.json' });
      continue;
    }
    if (PRICE.includes(k)) {
      PRICE.forEach((x) => done.add(x));
      const pf = PRICE.filter((x) => changed.includes(x));
      moved(put(id, 'price_krw', s.price == null ? { action: 'clear', by: 'user', via: 'admin', note }
        : { action: 'use_source', value: s.price, source: 'manual', price_source: s.priceSource ?? null, price_checked_at: s.priceCheckedAt ?? null, price_kind: s.priceKind ?? null, via: 'admin', by: 'user', note }),
        `${key} 가격 ${was.price} ${was.priceSource ?? ''} ${was.priceCheckedAt ?? ''} → ${s.price} ${s.priceSource ?? ''} ${s.priceCheckedAt ?? ''}`,
        { key, field: pf.join(' · '), from: pf.map((x) => was[x] ?? null), to: pf.map((x) => s[x] ?? null), file: 'decisions.json' });
      continue;
    }
    if (COPYK.includes(k)) {
      COPYK.forEach((x) => done.add(x));
      const prev = COPY[key], cf = changed.filter((x) => COPYK.includes(x));
      const isNew = !(eq(prev?.summary, s.summary) && eq(prev?.description, s.description) && (s.id > 20 || prev?.seed_choice));
      if (isNew) COPY[key] = { ...(prev ?? {}), summary: s.summary, description: s.description, ...(s.id <= 20 ? { seed_choice: 'admin', seed_id: s.id } : {}), admin_note: note };
      else already++;
      moved(isNew, `${key} 문구(${cf.join(' · ')})`, { key, field: cf.join(' · '), from: cf.map((x) => was[x] ?? null), to: cf.map((x) => s[x] ?? null), file: 'copy.json' });
      continue;
    }
  }
}
// 스냅숏에 있는데 지금 없는 신발 = 관리 화면에서 숨긴 신발(V8 — 지우지 않고 숨긴다). 카탈로그 행이면 숨김 판단으로 옮겨 적재기가 다시 넣지 않게
for (const sid of Object.keys(SNAP.shoes)) {
  if (live.some((s) => String(s.id) === sid)) continue;
  const w = SNAP.shoes[sid], rk = w.lineKey && w.generation != null ? SOURCE.get(`${w.lineKey}:${w.generation}`) : null, rid = rk?.replace(/:(?=[^:]*$)/, '#');
  const label = `${sid} ${w.model} (${w.lineKey ?? '-'}:${w.generation ?? '-'})`;
  if (!rid) { out.hidden.push(`${label} — 카탈로그 밖(적재기가 넣지 않는다)`); continue; }
  const row = (DEC.rows[rid] ??= {});
  if (row.hidden?.action === 'hide') { already++; out.hidden.push(`${label} — 이미 반영`); continue; }
  row.hidden = { action: 'hide', shoe_id: Number(sid), via: 'admin', by: 'user', note, ...(row.hidden ? { previous: { ...row.hidden, previous: undefined } } : {}) };
  out.hidden.push(label);
  fields.push({ key: rk, field: 'hidden', from: false, to: true, file: 'decisions.json' });
}

console.log(`${WRITE ? '썼다' : '건조 실행'} — ${HOST ?? BASE} | 스냅숏 ${SNAP.at} | 옮김 ${out.moved.length}(그중 이미 옮긴 것 ${already}) · 덮지 않는 칸 ${out.untouched.length} · 보고만 ${out.reportOnly.length} · 새 신발 ${out.newShoes.length} · 숨긴 신발 ${out.hidden.length} · 되살린 신발 ${out.restored.length}`);
for (const [t, a] of [['옮김', out.moved], ['적재기가 덮지 않는 칸(그대로 둔다)', out.untouched], ['보고만(스냅숏에 lineKey 가 없어 행을 모른다)', out.reportOnly], ['관리 화면에서 새로 넣은 신발(구조 변경 — 적재기가 멈춘다. 후보 목록에 넣을지 사람이 정한다)', out.newShoes], ['관리 화면에서 숨긴 신발(decisions.json hidden — 적재기가 다시 넣지 않는다)', out.hidden], ['관리 화면에서 되살린 신발(hidden 판단을 지웠다)', out.restored]])
  if (a.length) { console.log(`\n${t}`); for (const x of a) console.log('  ' + x); }
fs.mkdirSync(U('local/work/'), { recursive: true });
fs.writeFileSync(U('local/work/pull-admin-last.json'), JSON.stringify({ at: new Date().toISOString(), host: HOST ?? new URL(BASE).host, snapshot: SNAP.at, write: WRITE, fields, already, ...out }, null, 1));
if (WRITE && fields.length) {
  fs.writeFileSync(U(`local/work/decisions.before-pull-admin-${Date.now()}.json`), fs.readFileSync(U('decisions.json')));
  fs.writeFileSync(U('decisions.json'), JSON.stringify(DEC, null, 1) + '\n');
  fs.writeFileSync(U('copy.json'), JSON.stringify(COPY, null, 1) + '\n');
  console.log('\n다음: node build.mjs → node load.mjs(건조 실행 — 옮긴 칸은 바뀔 것이 없어야 한다)');
}
