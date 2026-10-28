// 적재기 — shoes.jsonl → 관리자 API(docs/CATALOG_PIPELINE.md 7장). 기본은 건조 실행(읽기만): 무엇을 POST · PATCH 할지 계획만 낸다.
//   node load.mjs [--base http://127.0.0.1:3200] [--host <Host 헤더>] [--only <catalog_key,…>] [--limit N]
//   운영은 MetalLB VIP 로 — --base http://192.168.122.240 --host runshoes.ronanlab.dev(fetch 는 Host 를 못 바꿔 node:http 로 보낸다)
//   ADMIN_EMAIL=… ADMIN_PASSWORD=… node load.mjs --apply      # 쓴다 — 넣은 id 와 바꾸기 전 값을 loads/<시각>.json 에
//   ADMIN_EMAIL=… ADMIN_PASSWORD=… node load.mjs --revert loads/<시각>.json   # 되돌린다(리뷰가 붙기 전까지만 깔끔하다)
// 대상: 적재 가능 행(이미지 있음 · status ok | partial). 운영 신발과는 lineKey + generation 으로 맞춘다(V4 가 시드 20켤레에 채웠다).
//   없으면 POST(id 는 앱이 max+1). 있으면 사실 값만 비교해 다르면 PATCH — 시드 20켤레의 요약 · 설명(운영 콘텐츠)은 사용자가 고른 것(copy.json seed_choice)만 쓴다.
//   gender 는 'men'(2026-10-24 사용자: 수집한 값이 전부 남성 대표 색상 기준이다 — null 이면 세대 중복 검사도 안 걸린다).
//   운영 행의 purpose 는 사람이 검수한 분류라 덮지 않는다(후보 목록 purpose 는 초안 — 2026-10-24 사용자). 새 행에는 초안을 그대로 넣는다.
import fs from 'node:fs';
import http from 'node:http';

const U = (p) => new URL(p, import.meta.url);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:3200');
const HOST = arg('--host', null);
const APPLY = process.argv.includes('--apply');
const REVERT = arg('--revert', null);
const ONLY = arg('--only', null)?.split(',');
const LIMIT = Number(arg('--limit', 0)) || Infinity;

// 비교하는 사실 값(API 이름) — 이것이 다를 때만 PATCH
const FACTS = ['brand', 'model', 'stability', 'midsole', 'weight', 'drop', 'stackHeight', 'width', 'wideAvailable', 'carbon', 'price',
  'lineKey', 'generation', 'isCurrent', 'gender', 'weightSize', 'specSize', 'measuredWeight', 'measuredWeightSize', 'measuredStackHeight', 'measuredDrop', 'measuredSource', 'measuredCount',
  'priceSource', 'priceCheckedAt', 'priceKind'];  // V5 가격 메타

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
    image: urls[0] ?? null, images: urls,
    summary: COPY[r.catalog_key]?.summary ?? r.summary ?? '', description: COPY[r.catalog_key]?.description ?? r.description ?? '',
    lineKey: r.line_key, generation: r.generation, isCurrent: r.is_current, gender: 'men',
    weightSize: r.official_weight_size, specSize: r.official_spec_size,
    measuredWeight: r.measured_weight_g, measuredWeightSize: r.measured_weight_size, measuredStackHeight: r.measured_heel_mm,
    measuredDrop: r.measured_drop_mm, measuredSource: r.measured_source, measuredCount: r.measured_count,
  };
}

const same = (a, b) => (a ?? null) === (b ?? null) || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9);

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
const CATALOG_KEYS = new Set(LOADABLE.map((r) => r.catalog_key));
const R = LOADABLE
  .filter((r) => !ONLY || ONLY.includes(r.catalog_key)).slice(0, LIMIT);
const live = await api('GET', '/api/shoes');
// V4 전 DB(시드에 lineKey 가 없다)에 돌리면 시드 19켤레를 새 행으로 또 넣는다 — 멈춘다
if (live.some((s) => s.id <= 20 && !s.lineKey)) { console.error('운영 시드에 lineKey 가 없다 — V4 가 적용되기 전이다. 멈춘다'); process.exit(2); }
const byKey = new Map(live.filter((s) => s.lineKey && s.generation != null).map((s) => [`${s.lineKey}:${s.generation}`, s]));

const plan = { base: BASE, at: new Date().toISOString(), rows: R.length, live: live.length, post: [], patch: [], skip: [] };
for (const r of R) {
  const body = toBody(r), cur = byKey.get(r.catalog_key);
  if (!cur) { plan.post.push({ catalog_key: r.catalog_key, body }); continue; }
  const changes = {};
  for (const k of FACTS) if (!same(cur[k], body[k])) changes[k] = { from: cur[k] ?? null, to: body[k] ?? null };
  if (!r.existing_id || COPY[r.catalog_key]?.seed_choice) for (const k of ['summary', 'description']) if (COPY[r.catalog_key] && !same(cur[k], body[k])) changes[k] = { from: cur[k] ?? null, to: body[k] };
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
  if (JSON.stringify(cur.images ?? []) !== JSON.stringify([d.image])) changes.images = { from: cur.images ?? [], to: [d.image] };
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

fs.mkdirSync(U('local/work/'), { recursive: true });
fs.writeFileSync(U('local/work/load-plan.json'), JSON.stringify(plan, null, 1));
const fieldCount = {};
for (const p of plan.patch) for (const k of Object.keys(p.changes)) fieldCount[k] = (fieldCount[k] ?? 0) + 1;
console.log(`${APPLY ? '적용' : '건조 실행'} — ${BASE} | 대상 ${plan.rows} · 운영 ${plan.live} | POST ${plan.post.length} · PATCH ${plan.patch.length} · 같음 ${plan.skip.length}`);
console.log('PATCH 필드별', JSON.stringify(fieldCount));
console.log('운영에만 있는 신발', plan.liveNotInCatalog.length, plan.liveNotInCatalog.slice(0, 5).join(' | '));

if (APPLY) {
  const token = await login(), log = { base: BASE, at: plan.at, created: [], patched: [] };
  const file = U(`loads/${plan.at.replace(/[:.]/g, '-')}.json`);
  fs.mkdirSync(U('loads/'), { recursive: true });
  const save = () => fs.writeFileSync(file, JSON.stringify(log, null, 1));
  for (const p of plan.patch) {
    const body = Object.fromEntries(Object.entries(p.changes).map(([k, v]) => [k, v.to]));
    const before = Object.fromEntries(Object.entries(p.changes).map(([k, v]) => [k, v.from]));
    await api('PATCH', `/api/shoes/${p.id}`, body, token); log.patched.push({ id: p.id, catalog_key: p.catalog_key, before }); save();
  }
  for (const p of plan.post) { const s = await api('POST', '/api/shoes', p.body, token); log.created.push(s.id); save(); }
  console.log(`썼다: PATCH ${log.patched.length} · POST ${log.created.length} → ${file.pathname}`);
}
