// 색상 이미지 보강 1단계(2026-11-02 사용자) — 켤레마다 같은 모델 다른 색상 후보를 KicksDB(StockX) 캐시에서 모은다. 요청하지 않는다
//   node catalog/colors-plan.mjs → local/work/colors-plan.json → python3 catalog/silhouette.py(2단계) → extra-images.json
//   규칙: 남성만 · 수집기 judge(같은 라인 · 세대) · 변형판 · 특별판 낱말(모델 이름 · 대표 제목에 있는 낱말은 예외) · 품번 모델 부분(브랜드 형식이 있는 곳) · 자리표시 이미지 제외. 관리 화면에서 고친 신발 · GOAT 대표는 건너뛴다
import fs from 'node:fs'; import crypto from 'node:crypto';
const C = new URL('./', import.meta.url).pathname;
const { judge, parseCsv } = await import(C + 'stockx.mjs');
const EXCLUDE = [/gore-?tex/i, /\bgtx\b/i, /\((gs|ps|td)\)/i, /\bkids?\b/i, /rundisney/i, /\b\d+ years\b/i, /\bkith\b/i, /stella mccartney/i,
  /post archive/i, /song for the mute/i, /girls run/i, /hermanos/i, /\bx\b [A-Z]/, /\bcollab/i, /\bsample\b/i, /\bpack\b/i, /marathon/i, /\bhyrox\b/i,
  /\bwide\b/i, /\bspikes?\b/i, /\bslide\b/i, /\bwaterproof\b/i, /\bwp\b/i, /district vision/i, /\bwmns\b|\bwomen/i, /\b(2e|4e|extra wide)\b/i];
// 특별판 낱말(2026-11-02 사용자 — 윤곽이 같아 실루엣으로 못 거른다). 모델 이름에 든 낱말은 예외(Adizero Boston · Metaspeed Sky Tokyo)
const SPECIAL = [/l'?art\b/i, /\bedition\b/i, /\blimited\b/i, /\bse\b/i, /\bcollection\b/i, /\bpremium\b|\bprm\b/i, /\bqs\b/i, /\bolympic/i, /\bchampionship/i,
  /halloween|christmas|lunar|year of the|\bcny\b|valentine/i, /\b(amsterdam|tokyo|paris|london|berlin|boston|chicago|nyc|new york|sydney|seoul|osaka|kyoto|valencia|athens)\b/i, /\bhong kong\b/i,
  /\bmita\b|\batmos\b|\bbape\b|\bsupreme\b|\bpatta\b|\baime leon\b|\bjjjjound\b|\bsatisfy\b|\bciele\b|\bbandit\b|\btracksmith\b|white mountaineering/i, /\bvaporous\b/i, /\bsc\b/i, /\bekiden\b/i, /\bls\b/i, /\bedo\b/i, /\bpride\b|\bbetrue\b/i, /\b(grvl|hike|mid|max|gts|atr|low|lightspray|evo|ultra|elite|plus|trail|lite|speed|pro|sl|x)\b/i, /\bdisney|marvel|star wars|pokemon/i];
// 예외: 모델 이름(붙여 쓴 것까지 — Ultraboost) · 대표 상품 제목에 이미 있는 낱말은 그 모델의 이름이다
const special = (title, lineEn, repTitle = '') => SPECIAL.find((re) => { const m = title.match(re); if (!m) return false;
  const w = m[0].toLowerCase(); return !re.test(lineEn ?? '') && !(lineEn ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').includes(w.replace(/[^a-z0-9]/g, '')) && !repTitle.toLowerCase().includes(w); });
const MODEL_SKU = { asics: /^(\d{4}[A-Z]\d{3})-[0-9A-Z]+$/, nike: /^([A-Z]{2}\d{4})-\d{3}$/, hoka: /^(\d{7})-[A-Z]{3,5}$/, brooks: /^(\d{6})-\d[A-Z]-\d{3}$/,
  saucony: /^(S\d{5,6})-\d{2,4}$/, puma: /^(\d{6})-\d{2}$/, altra: /^(AL0A[0-9A-Z]{4})-[0-9A-Z]{3}$/, underarmour: /^(\d{7})-\d{3}$/, on: /^(\d[A-Z]{2}\d{4})\d{4}$/, mizuno: /^([A-Z]1G[A-Z]\d{4})\d{2}$/ };
const cands = parseCsv(fs.readFileSync(C + 'candidates.csv', 'utf8'));
const allCores = [...new Set(cands.map((r) => r.line_key))];
const core = (lk) => (lk === 'nike:infinityrn' ? 'infinityrun' : lk.split(':')[1].replace(/-/g, ''));
const sx = JSON.parse(fs.readFileSync(C + 'local/work/stockx.json', 'utf8'));
const IO = JSON.parse(fs.readFileSync(C + 'decisions.json', 'utf8')).image_overrides ?? {};
const rows = fs.readFileSync(C + 'shoes.jsonl', 'utf8').trim().split('\n').map(JSON.parse).filter((r) => ['ok', 'partial'].includes(r.status) && r.images?.length);
const out = { rows: rows.length, skip: {}, groups: {}, dist: {}, perBrand: {}, list: [] };
const bump = (o, k, n = 1) => (o[k] = (o[k] ?? 0) + n);
for (const r of rows) {
  const id = `${r.line_key}#${r.generation}`; const io = IO[id]; const brand = r.line_key.split(':')[0];
  if (io?.via === 'admin' || Array.isArray(io?.images)) { bump(out.skip, '관리 화면 · 사람이 정한 여러 장'); continue; }
  if (io?.source === 'goat') { bump(out.skip, 'GOAT 이미지(StockX 캐시 없음)'); continue; }
  const s = sx[id]; const row = cands.find((c) => c.line_key === r.line_key && c.generation === String(r.generation));
  if (!s?.query || !row) { bump(out.skip, '캐시 검색어 없음'); continue; }
  const h1 = crypto.createHash('sha1').update(s.query).digest('hex') + '.json';
  const f = fs.existsSync(C + 'local/cache/kicksdb100/' + h1) ? C + 'local/cache/kicksdb100/' + h1 : C + 'local/cache/kicksdb/' + h1;
  if (!fs.existsSync(f)) { bump(out.skip, '캐시 파일 없음'); continue; }
  const c = core(r.line_key);
  const siblings = allCores.filter((lk) => lk.startsWith(brand + ':') && lk !== r.line_key && core(lk).includes(c)).map(core);
  const repSku = io?.sku ?? s.sku; const re = MODEL_SKU[brand]; const repModel = re ? re.exec(repSku ?? '')?.[1] : null;
  const repImg = r.images[0].url.split('?')[0];
  const seen = new Set([repImg]); const extra = [];
  for (const h of JSON.parse(fs.readFileSync(f, 'utf8')).data) {
    if (h.gender !== 'men') continue;
    if (judge(row, h.title ?? '', siblings) !== 'ok') continue;
    if (EXCLUDE.some((x) => x.test(h.title ?? '')) || !h.image || /Product-Placeholder/i.test(h.image)) continue;
    // '+' 판(Agravic Speed+ · Lone Peak 9+): 모델 이름에 '+' 가 없으면 다른 판
    if (/\+/.test(h.title ?? '') && !/\+/.test(row.line_en ?? '')) { (out.dropped ??= []).push({ id, sku: h.sku, title: h.title, image: h.image, why: 'B:+' }); continue; }
    if (special(h.title ?? '', row.line_en, io?.title ?? s.title ?? '')) { (out.dropped ??= []).push({ id, sku: h.sku, title: h.title, image: h.image, why: 'B:' + (h.title.match(special(h.title, row.line_en, io?.title ?? s.title ?? ''))[0]) }); continue; }
    if (re) { if (!repModel || re.exec(h.sku ?? '')?.[1] !== repModel) continue; }
    const u = h.image.split('?')[0]; if (seen.has(u)) continue; seen.add(u);
    extra.push({ sku: h.sku, title: h.title, rank: h.rank, image: h.image });
  }
  const g = re ? (repModel ? '품번 모델 부분 확인 가능' : '대표 품번이 형식에 안 맞음') : '품번에 색상이 붙은 브랜드(제목으로만 같은 모델)';
  bump(out.groups, g);
  const n = Math.min(extra.length, 5);
  bump(out.dist, `${g} | +${n}장`);
  bump(out.perBrand, `${brand} ${re ? '' : '(제목만)'}`, n);
  out.list.push({ id, g, add: n, rep: r.images[0].url, all: extra });
}
fs.writeFileSync(C + 'local/work/colors-plan.json', JSON.stringify(out, null, 1));
const { list, ...summary } = out; console.log(JSON.stringify(summary, null, 1));
