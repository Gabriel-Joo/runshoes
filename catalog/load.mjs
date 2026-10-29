// 적재기 — shoes.jsonl → 관리자 API(docs/CATALOG_PIPELINE.md 7장). 기본은 건조 실행(읽기만): 무엇을 POST · PATCH 할지 계획만 낸다.
//   node load.mjs [--base http://127.0.0.1:3200] [--host <Host 헤더>] [--only <catalog_key,…>] [--limit N]
//   운영은 MetalLB VIP 로 — --base http://192.168.122.240 --host runshoes.ronanlab.dev(fetch 는 Host 를 못 바꿔 node:http 로 보낸다)
//   ADMIN_EMAIL=… ADMIN_PASSWORD=… node load.mjs --apply      # 쓴다 — 넣은 id 와 바꾸기 전 값을 loads/<시각>.json 에
//   ADMIN_EMAIL=… ADMIN_PASSWORD=… node load.mjs --revert loads/<시각>.json   # 되돌린다(리뷰가 붙기 전까지만 깔끔하다)
//   node load.mjs --snapshot   # 지금 운영 값을 스냅숏으로 적는다(적재 없이). --apply 뒤에는 저절로 적는다
// 관리 화면 수정 보호(2026-10-29 사용자 — "진짜 관리자가 고친 값이 적재 때 되돌아가면 안 된다"):
//   적재 직후 운영 값을 local/work/snapshot-<호스트>.json 에 둔다. 그 뒤 운영 값이 스냅숏과 달라진 칸 = 사람이 관리 화면에서 고친 칸.
//   --apply 는 적재 전에 node pull-admin.mjs --write 로 그런 칸을 decisions.json · copy.json 에 옮기고 build 한 뒤 진행한다
//   (2026-10-30 사용자 — 멈추지 말고 끌어와서 진행, "어드민 수정 N건을 decisions.json에 반영했다"와 바뀐 칸을 로그에 남긴다 · CronJob 은 나중에).
//   2026-10-30 사용자 — 이미지 · 라인키 · 세대 · 현행 · 성별 · 스펙 출처도 전부 끌어온다. 숨긴 신발(V8)은 hidden 판단으로 — 다시 넣지 않는다.
//   멈추는 건 관리 화면에서 새로 넣은 신발뿐(--structure-ok 로 진행, exit 3).
// 대상: 적재 가능 행(이미지 있음 · status ok | partial). 운영 신발과는 lineKey + generation 으로 맞춘다(V4 가 시드 20켤레에 채웠다).
//   없으면 POST(id 는 앱이 max+1). 있으면 사실 값만 비교해 다르면 PATCH — 시드 20켤레의 요약 · 설명(운영 콘텐츠)은 사용자가 고른 것(copy.json seed_choice)만 쓴다.
//   gender 는 'men'(2026-10-24 사용자: 수집한 값이 전부 남성 대표 색상 기준이다 — null 이면 세대 중복 검사도 안 걸린다).
//   운영 행의 purpose 는 사람이 검수한 분류라 덮지 않는다(후보 목록 purpose 는 초안 — 2026-10-24 사용자). 새 행에는 초안을 그대로 넣는다.
import fs from 'node:fs';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FACTS, TRACKED, snapFile, specSourcesOf, canon } from './live-fields.mjs';

const U = (p) => new URL(p, import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:3200');
const HOST = arg('--host', null);
const APPLY = process.argv.includes('--apply');
const REVERT = arg('--revert', null);
const ONLY = arg('--only', null)?.split(',');
const LIMIT = Number(arg('--limit', 0)) || Infinity;
const SNAP_ONLY = process.argv.includes('--snapshot');

// 스냅숏 — 관리 화면 수정을 알아보려고 적재 직후의 운영 값을 둔다(pull-admin.mjs 와 같은 칸)
const SNAP_FILE = snapFile(BASE, HOST);
const snapOf = (list) => ({ base: BASE, host: HOST, at: new Date().toISOString(), shoes: Object.fromEntries(list.map((s) => [s.id, Object.fromEntries(TRACKED.map((k) => [k, s[k] ?? null]))])) });
// 관리 화면 수정 끌어오기 — 적용 때만 쓴다(건조 실행은 무엇을 끌어올지만 낸다). copy.json · shoes.jsonl 을 읽기 전에 한다
let adminPulled = null;
if (!REVERT && !SNAP_ONLY && fs.existsSync(SNAP_FILE)) {
  const pa = ['pull-admin.mjs', '--base', BASE, ...(HOST ? ['--host', HOST] : []), ...(APPLY ? ['--write'] : [])];
  const node = (a) => execFileSync(process.execPath, a, { cwd: fileURLToPath(new URL('.', import.meta.url)), stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
  node(pa);   // 자기 보고는 pull-admin-last.json 으로 받는다
  adminPulled = JSON.parse(fs.readFileSync(U('local/work/pull-admin-last.json'), 'utf8'));
  const show = (x) => (Array.isArray(x) ? x.map((v) => JSON.stringify(v)).join(' · ') : JSON.stringify(x));
  const F = adminPulled.fields;
  if (APPLY) console.log(`어드민 수정 ${F.length}건을 decisions.json에 반영했다${adminPulled.already ? ` (이미 반영돼 있던 것 ${adminPulled.already}건)` : ''}`);
  else console.log(`건조 실행 — 적용하면 어드민 수정 ${F.length}건을 decisions.json에 반영한다${adminPulled.already ? ` (이미 반영돼 있는 것 ${adminPulled.already}건)` : ''}`);
  for (const f of F) console.log(`  ${f.key} ${f.field}: ${show(f.from)} → ${show(f.to)}${f.file !== 'decisions.json' ? ` (${f.file})` : ''}`);
  if (adminPulled.untouched.length) console.log(`적재기가 덮지 않는 칸 ${adminPulled.untouched.length}개(그대로 둔다)`);
  for (const [t, xs] of [['적재기가 덮지 않는 칸', adminPulled.untouched], ['보고만(스냅숏에 lineKey 가 없어 행을 모른다)', adminPulled.reportOnly], ['관리 화면에서 새로 넣은 신발(구조 변경)', adminPulled.newShoes], ['관리 화면에서 숨긴 신발(다시 넣지 않는다)', adminPulled.hidden], ['관리 화면에서 되살린 신발', adminPulled.restored]])
    if (xs.length) { console.log(t); for (const x of xs) console.log('  ' + x); }
  if (APPLY && (adminPulled.moved.length || adminPulled.hidden.length || adminPulled.restored.length)) { console.log('build.mjs 를 다시 돌린다'); node(['build.mjs']); }
}
// 카드 한 줄(summary) · 상세 문단(description) — 우리가 쓴 글(catalog/copy.json, 2026-10-24).
//   시드 20켤레는 seed_choice 가 있는 것만(2026-10-29 사용자가 원본 · 재작성 중 골랐다 — seed_id 는 운영 id)
const COPY = fs.existsSync(U('copy.json')) ? JSON.parse(fs.readFileSync(U('copy.json'), 'utf8')) : {};

function toBody(r) {
  const urls = (r.images ?? []).map((x) => (typeof x === 'string' ? x : x.url)).filter(Boolean);
  return {
    brand: r.brand, model: r.model, purpose: r.purpose, stability: r.stability, midsole: r.midsole,
    weight: r.official_weight_g, drop: r.official_drop_mm, stackHeight: r.official_heel_mm,
    width: r.toebox_width, wideAvailable: r.wideAvailable, carbon: r.carbon, price: r.price,
    priceSource: r.price_source ?? null, priceCheckedAt: r.price_checked_at ?? null, priceKind: r.price_kind ?? null,
    image: 'image' in r ? r.image : urls[0] ?? null, images: urls,  // r.image = 관리 화면에서 고친 대표 이미지(build.mjs)
    summary: COPY[r.source_key ?? r.catalog_key]?.summary ?? r.summary ?? '', description: COPY[r.source_key ?? r.catalog_key]?.description ?? r.description ?? '',
    lineKey: r.line_key, generation: r.generation, isCurrent: r.is_current, gender: 'gender' in r ? r.gender : 'men',  // r.gender = 관리 화면 판단
    weightSize: r.official_weight_size, specSize: r.official_spec_size,
    measuredWeight: r.measured_weight_g, measuredWeightSize: r.measured_weight_size, measuredStackHeight: r.measured_heel_mm,
    measuredDrop: r.measured_drop_mm, measuredSource: r.measured_source, measuredCount: r.measured_count,
    specSources: 'spec_sources' in r ? r.spec_sources : specSourcesOf(r),  // r.spec_sources = 관리 화면에서 고른 출처(build.mjs)
  };
}

const same = (a, b) => (a ?? null) === (b ?? null) || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9)
  || (a && b && typeof a === 'object' && typeof b === 'object' && canon(a) === canon(b));   // specSources — 키 순서는 보지 않는다

function send(method, url, headers, data) {
  if (!HOST) return fetch(url, { method, headers, body: data }).then(async (res) => ({ status: res.status, text: await res.text() }));
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers: { ...headers, Host: HOST, ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } }, (res) => {
      let text = ''; res.setEncoding('utf8'); res.on('data', (c) => (text += c)); res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}
async function api(method, path, body, token) {
  const res = await send(method, BASE + path, { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body ? JSON.stringify(body) : undefined);
  if (res.status < 200 || res.status >= 300) throw new Error(`${method} ${path} → ${res.status} ${res.text.slice(0, 200)}`);
  return res.text ? JSON.parse(res.text) : null;
}
async function login() {
  const email = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error('ADMIN_EMAIL · ADMIN_PASSWORD 가 필요하다(--apply · --revert)');
  return (await api('POST', '/api/auth/login', { email, password })).accessToken;
}

if (REVERT) {
  const log = JSON.parse(fs.readFileSync(REVERT, 'utf8')), token = await login();
  for (const p of [...log.patched].reverse()) await api('PATCH', `/api/shoes/${p.id}`, p.before, token);
  for (const id of [...log.created].reverse()) await api('DELETE', `/api/shoes/${id}`, null, token);
  console.log(`되돌림: PATCH ${log.patched.length} · DELETE ${log.created.length}`);
  process.exit(0);
}

const LOADABLE = fs.readFileSync(U('shoes.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
  .filter((r) => r.images.length && (r.status === 'ok' || r.status === 'partial'));
const CATALOG_KEYS = new Set(LOADABLE.map((r) => r.source_key ?? r.catalog_key));  // 문구(copy.json) 키 = 후보 목록 키
const R = LOADABLE
  .filter((r) => !ONLY || ONLY.includes(r.catalog_key)).slice(0, LIMIT);
const live = await api('GET', '/api/shoes');
// V4 전 DB(시드에 lineKey 가 없다)에 돌리면 시드 19켤레를 새 행으로 또 넣는다 — 멈춘다
if (live.some((s) => s.id <= 20 && !s.lineKey)) { console.error('운영 시드에 lineKey 가 없다 — V4 가 적용되기 전이다. 멈춘다'); process.exit(2); }
// V6 전 앱(응답에 specSources 가 없다)에 --apply 하면 출처는 버려지고 스냅숏만 바뀐다 — 멈춘다. 건조 실행은 그대로(PATCH specSources 로 보인다)
if (APPLY && live.length && !('specSources' in live[0])) { console.error('운영 응답에 specSources 가 없다 — V6 가 적용되기 전이다. --apply 하지 않는다'); process.exit(2); }
if (SNAP_ONLY) { fs.writeFileSync(SNAP_FILE, JSON.stringify(snapOf(live), null, 1)); console.log(`스냅숏 ${live.length}켤레 → ${SNAP_FILE.pathname}`); process.exit(0); }
const byKey = new Map(live.filter((s) => s.lineKey && s.generation != null).map((s) => [`${s.lineKey}:${s.generation}`, s]));

const plan = { base: BASE, at: new Date().toISOString(), rows: R.length, live: live.length, post: [], patch: [], skip: [] };
for (const r of R) {
  const body = toBody(r), cur = byKey.get(r.catalog_key);
  if (!cur) { plan.post.push({ catalog_key: r.catalog_key, body }); continue; }
  const changes = {};
  for (const k of FACTS) if (!same(cur[k], body[k])) changes[k] = { from: cur[k] ?? null, to: body[k] ?? null };
  const ck = r.source_key ?? r.catalog_key;
  if (!r.existing_id || COPY[ck]?.seed_choice) for (const k of ['summary', 'description']) if (COPY[ck] && !same(cur[k], body[k])) changes[k] = { from: cur[k] ?? null, to: body[k] };
  // 이미지 — 시드 20켤레도 StockX 1장으로 통일한다(2026-10-24 사용자: 카드 · 모달이 제각각이었다)
  if (!same(cur.image, body.image)) changes.image = { from: cur.image ?? null, to: body.image };
  if (JSON.stringify(cur.images ?? []) !== JSON.stringify(body.images)) changes.images = { from: cur.images ?? [], to: body.images };
  if (Object.keys(changes).length) plan.patch.push({ catalog_key: r.catalog_key, id: cur.id, changes });
  else plan.skip.push(r.catalog_key);
}
// 카탈로그 밖의 시드 신발(엔돌핀 스피드 4)의 이미지 — decisions.json seed_only_images
const DEC = JSON.parse(fs.readFileSync(U('decisions.json'), 'utf8'));
for (const [id, d] of Object.entries(DEC.seed_only_images ?? {})) {
  const cur = live.find((s) => String(s.id) === id); if (!cur) continue;
  const changes = {};
  if (!same(cur.image, d.image)) changes.image = { from: cur.image ?? null, to: d.image };
  const di = d.images ?? [d.image];  // 관리 화면에서 고친 추가 이미지(pull-admin.mjs)
  if (JSON.stringify(cur.images ?? []) !== JSON.stringify(di)) changes.images = { from: cur.images ?? [], to: di };
  if (Object.keys(changes).length) plan.patch.push({ catalog_key: `seed#${id}`, id: cur.id, changes });
}
// 카탈로그 밖의 시드 신발의 가격 출처 — decisions.json seed_only_price_meta(값은 그대로, 출처 · 날짜만)
for (const [id, m] of Object.entries(DEC.seed_only_price_meta ?? {})) {
  const cur = live.find((s) => String(s.id) === id); if (!cur || (ONLY && !ONLY.includes(`seed#${id}`))) continue;
  const want = { priceSource: m.price_source ?? null, priceCheckedAt: m.price_checked_at ?? null, priceKind: m.price_kind ?? null };
  const changes = {};
  for (const [k, v] of Object.entries(want)) if (!same(cur[k], v)) changes[k] = { from: cur[k] ?? null, to: v };
  if (Object.keys(changes).length) plan.patch.push({ catalog_key: `seed#${id}`, id: cur.id, changes });
}
// 카탈로그 밖의 시드 신발의 문구 — copy.json seed_choice + seed_id
for (const [key, c] of Object.entries(COPY)) {
  if (!c.seed_choice || CATALOG_KEYS.has(key)) continue;   // 카탈로그 안의 시드는 위 행 비교가 맡는다(--limit 밖이어도)
  if (ONLY && !ONLY.includes(key)) continue;
  const cur = live.find((s) => s.id === c.seed_id); if (!cur) continue;
  const changes = {};
  for (const k of ['summary', 'description']) if (!same(cur[k], c[k])) changes[k] = { from: cur[k] ?? null, to: c[k] };
  if (Object.keys(changes).length) plan.patch.push({ catalog_key: `seed#${cur.id}`, id: cur.id, changes });
}
// 운영에 있는데 카탈로그(적재 대상)에 없는 신발 — 지우지 않는다, 보고만
const want = new Set(R.map((r) => r.catalog_key));
plan.liveNotInCatalog = live.filter((s) => !(s.lineKey && want.has(`${s.lineKey}:${s.generation}`))).map((s) => `${s.id} ${s.brand} ${s.model} (${s.lineKey ?? '-'}:${s.generation ?? '-'})`);

// 관리 화면에서 고친 칸을 되돌리려는가 — 스냅숏 뒤 운영 값이 바뀐 칸 중 이번 계획이 바꾸려는 것. 스냅숏에 없는 신발(관리 화면에서 새로 넣은 것)도 같다
const SNAP = fs.existsSync(SNAP_FILE) ? JSON.parse(fs.readFileSync(SNAP_FILE, 'utf8')) : null;
plan.adminEdits = [];
if (SNAP) for (const p of plan.patch) {
  const cur = live.find((s) => s.id === p.id), was = SNAP.shoes[p.id];
  if (was) for (const k of Object.keys(p.changes)) if (JSON.stringify(was[k] ?? null) !== JSON.stringify(cur[k] ?? null)) plan.adminEdits.push({ id: p.id, catalog_key: p.catalog_key, field: k, snapshot: was[k] ?? null, live: cur[k] ?? null, catalog: p.changes[k].to });  // 스냅숏에 없는 신발은 아래 구조 변경이 맡는다
}
fs.mkdirSync(U('local/work/'), { recursive: true });
fs.writeFileSync(U('local/work/load-plan.json'), JSON.stringify(plan, null, 1));
const fieldCount = {};
for (const p of plan.patch) for (const k of Object.keys(p.changes)) fieldCount[k] = (fieldCount[k] ?? 0) + 1;
console.log(`${APPLY ? '적용' : '건조 실행'} — ${BASE} | 대상 ${plan.rows} · 운영 ${plan.live} | POST ${plan.post.length} · PATCH ${plan.patch.length} · 같음 ${plan.skip.length}`);
console.log('PATCH 필드별', JSON.stringify(fieldCount));
console.log('운영에만 있는 신발', plan.liveNotInCatalog.length, plan.liveNotInCatalog.slice(0, 5).join(' | '));

if (!SNAP) console.log(`스냅숏 없음(${SNAP_FILE.pathname}) — 관리 화면 수정을 알아볼 수 없다. 운영 값이 카탈로그와 같을 때 --snapshot 으로 먼저 적는다`);
if (plan.adminEdits.length) {
  // 적용: 끌어오고 build 했는데도 남은 것 = pull-admin 이 옮기지 못하는 칸 — 사람이 정한다. 건조 실행: 위에서 끌어올 칸도 여기 보인다(적용 때는 사라진다)
  console.log(APPLY ? `끌어온 뒤에도 관리 화면에서 고친 칸 ${plan.adminEdits.length}개를 이번 적재가 되돌린다 — 옮기지 못한 칸이다(위 '보고만' 또는 pull-admin · build 의 빈틈). 멈춘다`
    : `관리 화면에서 고친 칸 ${plan.adminEdits.length}개 — 적용하면 위에서 끌어온 것은 되돌리지 않는다`);
  for (const e of plan.adminEdits.slice(0, 20)) console.log(`  ${e.catalog_key} ${e.field}: 스냅숏 ${JSON.stringify(e.snapshot)} → 운영 ${JSON.stringify(e.live)} (카탈로그 ${JSON.stringify(e.catalog)})`);
  if (APPLY) process.exit(3);
}
// 관리 화면에서 새로 넣은 신발(구조 변경)은 끌어오지 않고 멈춘다(2026-10-30 사용자 — "그건 구조가 바뀌는 거라 다르다").
//   사람이 후보 목록을 고친 뒤 --structure-ok 로 진행한다(스냅숏이 새로 적혀 다음부터는 안 멈춘다).
//   삭제는 숨김(V8)이 됐다 — pull-admin 이 decisions.json hidden 으로 옮기고 빌드가 적재 대상에서 빼므로 멈추지 않는다(2026-10-30 사용자)
const structure = adminPulled ? adminPulled.newShoes.map((x) => `추가 ${x}`) : [];
if (structure.length) {
  console.log(`관리 화면에서 새 신발을 넣었다 ${structure.length}건 — ${APPLY && !process.argv.includes('--structure-ok') ? '멈춘다' : '진행한다'}`);
  for (const x of structure) console.log('  ' + x);
  if (APPLY && !process.argv.includes('--structure-ok')) { console.log('  후보 목록(candidates.csv)에 넣을지 정한 뒤 --structure-ok'); process.exit(3); }
}
// 숨긴 신발이 그래도 POST 에 있으면(빌드 전 · 판단 누락) 멈춘다 — 다시 넣지 않는다
const reAdd = (adminPulled?.hidden ?? []).filter((x) => plan.post.some((p) => x.includes(`(${p.catalog_key})`)));
if (reAdd.length) { console.log(`숨긴 신발을 다시 넣으려 한다 ${reAdd.length}건 — 멈춘다: ${reAdd.join(' | ')}`); if (APPLY) process.exit(3); }
if (APPLY && !SNAP && !process.argv.includes('--no-snapshot-ok')) { console.error('스냅숏 없이 --apply 하지 않는다(관리 화면 수정이 되돌아갈 수 있다). 처음이면 운영 값을 확인하고 --no-snapshot-ok'); process.exit(3); }
if (APPLY) {
  const token = await login(), log = { base: BASE, at: plan.at, adminPulled: adminPulled && { count: adminPulled.fields.length, already: adminPulled.already, fields: adminPulled.fields }, created: [], patched: [] };
  const file = U(`loads/${plan.at.replace(/[:.]/g, '-')}.json`);
  fs.mkdirSync(U('loads/'), { recursive: true });
  const save = () => fs.writeFileSync(file, JSON.stringify(log, null, 1));
  save();   // 바꿀 것이 없어도 남긴다 — 끌어온 어드민 수정 기록(adminPulled)
  for (const p of plan.patch) {
    const body = Object.fromEntries(Object.entries(p.changes).map(([k, v]) => [k, v.to]));
    const before = Object.fromEntries(Object.entries(p.changes).map(([k, v]) => [k, v.from]));
    await api('PATCH', `/api/shoes/${p.id}`, body, token); log.patched.push({ id: p.id, catalog_key: p.catalog_key, before }); save();
  }
  for (const p of plan.post) { const s = await api('POST', '/api/shoes', p.body, token); log.created.push(s.id); save(); }
  console.log(`썼다: PATCH ${log.patched.length} · POST ${log.created.length} → ${file.pathname}`);
  const after = await api('GET', '/api/shoes');
  fs.writeFileSync(SNAP_FILE, JSON.stringify(snapOf(after), null, 1)); console.log(`스냅숏 ${after.length}켤레 → ${SNAP_FILE.pathname}`);
}
