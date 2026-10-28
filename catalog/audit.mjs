// 수집 출처 감사 — 필드마다 단 출처 URL 이 사실인지 세 겹으로 본다(2026-10-21 사용자 지시).
//   1. 주소 출처: 매체면 사이트맵 색인(local/work/media-index.txt) · 검색 결과(local/work/search-urls.txt)에 있어야 한다. 공식몰(sources.yaml fetch)은 링크로 찾은 페이지라 통과
//   2. 실제로 읽었나: fetch.mjs 캐시(local/cache/<sha1(url)>.json)에 status 200 으로 있어야 한다
//   3. 값이 그 페이지에 있나: 숫자(무게는 g 또는 oz 환산값, 소수 · 반올림 허용) · 상표명(미드솔)이 본문에 나와야 한다
//   결과: local/work/audit.json — { "<line_key>#<gen>": { "<field>": "<사유>" } } → build.mjs 가 그 필드의 출처를 떼고 review 로 둔다
import fs from 'node:fs';
import { otherShoe } from './variant.mjs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const WORK = path.join(ROOT, 'local/work'), CACHE = path.join(ROOT, 'local/cache');
const readList = (f) => new Set((fs.existsSync(path.join(WORK, f)) ? fs.readFileSync(path.join(WORK, f), 'utf8') : '').split('\n').map((l) => l.trim().replace(/[?#].*$/, '').replace(/\/$/, '')).filter(Boolean));
const known = new Set([...readList('media-index.txt'), ...readList('press-index.txt'), ...readList('search-urls.txt')]);
const STORE = /^(www\.nbkorea\.com|saucony\.co\.kr|www\.brooksrunning\.co\.kr|kor\.mizuno\.com|salomon\.co\.kr|kr\.puma\.com|altra\.co\.kr|www\.asics\.co\.kr|www\.merrellkorea\.co\.kr)$/;

const textCache = new Map();
function pageText(url) {
  if (textCache.has(url)) return textCache.get(url);
  // 끝 / 만 다른 주소는 같은 페이지로 본다(받은 주소와 적은 주소가 / 하나 차이인 경우)
  const variants = [url, url.endsWith('/') ? url.slice(0, -1) : url + '/'];
  const f = variants.map((v) => path.join(CACHE, crypto.createHash('sha1').update(v).digest('hex') + '.json')).find((x) => fs.existsSync(x));
  let r = null;
  if (f) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    r = { status: j.status, text: j.body.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ') };
  }
  textCache.set(url, r);
  return r;
}
function valueOnPage(field, v, text) {
  const t = text.toLowerCase();
  if (typeof v === 'boolean') return true; // 참거짓(카본 · 와이드)은 숫자 대조가 안 된다 — 주소 · 읽기 검증만
  // 미드솔: 상표 표기 차이를 맞춘다 — ™ · ® 제거, '+' 와 'plus' 같게, FF = FlyteFoam, 대소문자 무시
  const mnorm = (s) => s.toLowerCase().replace(/[™®]/g, '').replace(/flytefoam/g, 'ff').replace(/\+/g, 'plus').replace(/[^a-z0-9]/g, '');
  if (field === 'midsole') return String(v).split(/\s+\+\s+/).every((m) => mnorm(text).includes(mnorm(m)));
  const nums = new Set();
  const n = Number(v);
  nums.add(String(n));
  if (field === 'weight_g') { for (const d of [-1, 0, 1]) nums.add(String(n + d)); const oz = n / 28.35; for (const x of [oz.toFixed(1), (Math.round(oz * 10) / 10 - 0.1).toFixed(1), (Math.round(oz * 10) / 10 + 0.1).toFixed(1), oz.toFixed(2)]) nums.add(x.replace(/\.0+$/, '')); }
  if (field === 'price_krw') nums.add(n.toLocaleString('en-US'));
  if (field === 'stack_heel_mm' || field === 'drop_mm') { nums.add(n.toFixed(1)); }
  // 숫자 뒤에 단위가 있어야 한다(2026-10-23 — 단위 없는 같은 숫자(평점 · 가격 · 다른 문장)로 통과하던 것: 엔돌핀 트레이너 · 클라우드붐 스트라이크 39.5)
  const unit = field === 'weight_g' ? '\\s*(?:g\\b|gms|grams|oz|ounces|그램|온스)' : field === 'price_krw' ? '' : '\\s*(?:mm|millimet)';
  //   단위가 숫자 앞 라벨에 있는 표(살로몬 공식몰 "Weight (g) 323" · "Drop (mm) 11")도 같다
  const pre = field === 'weight_g' ? '\\((?:g|grams)\\)\\s*' : field === 'price_krw' ? null : '\\(mm\\)\\s*';
  if ([...nums].some((x) => { const e = x.replace(/[.,]/g, (c) => '\\' + c); return new RegExp(`(?<![\\d.,])${e}(?![\\d])${unit}`).test(t) || (pre && new RegExp(`${pre}${e}(?![\\d])`).test(t)); })) return true;
  // 스택 · 드롭은 0.5 단위로 적는다 — 페이지의 'N.N mm' 이 ±0.5 안이면 같은 값(39.9 mm → 40)
  if (field === 'stack_heel_mm' || field === 'drop_mm') return [...t.matchAll(/(\d{1,2}(?:\.\d)?)\s*mm/g)].some((m) => Math.abs(Number(m[1]) - n) <= 0.5);
  return false;
}

// 무게 측정 사이즈(2026-10-21 사용자 규칙): US M9 만 출처로 쓴다. 다른 사이즈면 값을 버리고, 사이즈를 알 수 없으면 review.
//   값이 나온 자리 앞뒤 160자에서 사이즈 표기를 찾는다. 공식몰은 270mm(=US M9) 표기를 M9 로 본다
const SIZE_RE = /\b(?:for\s+(?:a|the)\s+)?(?:half\s+pair\s+of\s+)?(?:(?:men['’]?s|mens|m)\s*(?:us\s*)?(?:size\s*)?|us\s*m\s*|us\s*(?=\d+(?:\.5)?\s*(?:men|\/|m\b)))(\d{1,2}(?:\.5)?)\b|(\d{3})\s*mm\s*기준|(26\.5|27(?:\.0)?)\s*cm|\buk\s*(\d{1,2}(?:\.5)?)\b/gi;  // 남성 UK = US − 1(UK 8 = US M9)
function weightSize(field, v, text, store = false) {
  const n = Number(v), oz = (n / 28.35);
  const pats = [String(n), String(n - 1), String(n + 1), oz.toFixed(1), (Math.round(oz * 10) / 10 - 0.1).toFixed(1), (Math.round(oz * 10) / 10 + 0.1).toFixed(1)];
  const sizes = [];
  for (const x of pats) {
    for (const m of text.matchAll(new RegExp(`(?<![\\d.,])${x.replace('.', '\\.')}(?![\\d])\\s*(g|gms|grams|oz|ounces|온스|그램)?`, 'gi'))) {
      if (store && !m[1]) continue;  // 공식몰 페이지는 사이즈표(250 255 … 280 / 27cm)가 같이 있다 — 단위(g · oz)가 붙은 숫자만 무게로 본다(2026-10-24)
      const w = text.slice(Math.max(0, m.index - 60), m.index + 160);
      for (const s of w.matchAll(SIZE_RE)) {
        if (/w\s*\d|women/i.test(w.slice(Math.max(0, s.index - 12), s.index + 4))) continue; // 여성 사이즈 표기는 건너뜀
        sizes.push(s[1] ?? (s[2] === '270' ? '9' : s[2] ? `${s[2]}mm` : s[3] ? '9' : s[4] ? String(Number(s[4]) + 1) : null));
      }
      if (sizes.length) break;
    }
    if (sizes.length) break;
  }
  if (!sizes.length) return 'weight_size_unknown';
  return sizes[0] === '9' || sizes[0] === '9.0' ? null : `weight_other_size:M${sizes[0]}`;
}
// 여성 US W7 무게 — 이미 읽은 페이지에서 보이면 기록만 한다(따로 찾지 않는다)
const WOMEN_RE = /(\d{1,2}(?:\.\d)?)\s*oz\.?\s*\(?\s*(\d{3})\s*g\s*\)?\s*for\s+a\s+us\s*w\s*(7(?:\.5)?)\b|(\d{3})\s*(?:g|gms|grams)[^.]{0,60}?women'?s\s*(?:us\s*)?(7(?:\.5)?)\b/i;
const women = {};

const ABC = fs.existsSync(path.join(WORK, 'abcmart-rendered.json')) ? JSON.parse(fs.readFileSync(path.join(WORK, 'abcmart-rendered.json'), 'utf8')) : {};
const F = ['weight_g', 'drop_mm', 'stack_heel_mm', 'midsole', 'carbon', 'wide_available', 'price_krw'];
const out = {}, stats = {};
for (const file of fs.readdirSync(WORK).filter((x) => /^specs-.*\.jsonl$/.test(x))) {
  const g = file.replace(/^specs-|\.jsonl$/g, '');
  const st = stats[g] = { rows: 0, fields_with_source: 0, unverified_address: 0, not_read: 0, value_not_on_page: 0, other_generation: 0, variant: 0, w_other_size: 0, w_size_unknown: 0, rows_affected: new Set() };
  for (const line of fs.readFileSync(path.join(WORK, file), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line); st.rows++;
    const id = `${r.line_key}#${r.generation}`;
    for (const k of F) {
      if (r[k] === null || r[k] === undefined) continue;
      const u = r.sources?.[k];
      if (!u || u === 'manual') continue;  // 사람이 넣은 값(카본 등 출처 면제)은 페이지 검증 대상이 아니다
      st.fields_with_source++;
      let why = null;
      let url; try { url = new URL(u); } catch { why = 'bad_url'; }
      // ABC마트(2026-10-28 사용자 승인): 사이트 안 링크로 얻은 상품 주소를 Playwright 로 렌더링해 읽었다 — 렌더 기록(주소 · 정가)과 값이 같으면 통과
      if (!why && url.host === 'abcmart.a-rt.com') { const x = ABC[u]; if (!x) why = 'not_read'; else if (k !== 'price_krw' || x.list_price !== r[k]) why = 'value_not_on_page'; if (!why) continue; }
      if (!why && !STORE.test(url.host) && !known.has(u.replace(/[?#].*$/, '').replace(/\/$/, ''))) why = 'address_not_in_index_or_search';
      const p = !why || why === 'address_not_in_index_or_search' ? pageText(u) : null;
      if (!why && (!p || p.status !== 200)) why = 'not_read';
      if (!why && !valueOnPage(k, r[k], p.text)) why = 'value_not_on_page';
      if (k === 'weight_g' && p?.text && !women[id]) { const w = p.text.match(WOMEN_RE); if (w) women[id] = { g: Number(w[2] ?? w[4]), size: `W${w[3] ?? w[5]}`, source: u }; }
      //   5. 변형 판 · 다른 모델 · 모음 글이면 다른 신발(Aero Glide 4 GRVL · Hyperion 3 ← Max 3 사고)
      if (!why && !STORE.test(url.host)) {
        if (/believeintherun|runningshoesguru|solereview/.test(url.host) && otherShoe(r.line_key, u) && !(k === 'wide_available' && otherShoe(r.line_key, u) === 'variant:wide')) why = 'page_is_variant';  // 와이드 판 페이지는 와이드 판이 있다는 근거다  // variant.mjs — 다른 판 · 다른 모델 · 모음 글
      }
      //   4. 세대: 주소에 같은 라인 이름이 있는데 다른 세대 숫자만 있으면(예: kayano-31 페이지로 32 행을 채움) 의심
      if (!why && !STORE.test(url.host)) {
        const words = url.pathname.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        const core = r.line_key.split(':')[1].split('-').filter((w) => !['gel', 'fresh', 'foam', 'fuelcell'].includes(w));
        if (core.every((w) => words.includes(w))) {
          const nums = words.filter((w) => /^v?\d{1,2}$/.test(w)).map((w) => Number(w.replace('v', '')));
          if (nums.length && !nums.includes(Number(r.generation)) && Number(r.generation) !== 1) why = 'page_is_other_generation';
        }
      }
      //   무게 사이즈는 맨 끝에 본다 — 다른 신발 · 다른 세대 페이지면 사이즈와 상관없이 버린다(2026-10-23: 모음 글 무게가 '사이즈 불명'으로 남던 것)
      if (!why && k === 'weight_g') why = weightSize(k, r[k], p.text, STORE.test(url.host));
      if (why) {
        (out[`${file}::${id}`] ??= {})[k] = why + (why === 'address_not_in_index_or_search' && p?.status === 200 ? '(read 200)' : '');
        st[{ address_not_in_index_or_search: 'unverified_address', not_read: 'not_read', value_not_on_page: 'value_not_on_page', page_is_other_generation: 'other_generation', page_is_variant: 'variant', weight_size_unknown: 'w_size_unknown' }[why] ?? (why.startsWith('weight_other_size') ? 'w_other_size' : 'unverified_address')]++;
        st.rows_affected.add(id);
      }
    }
    //   발볼은 값이 문장 판단이라 페이지 대조는 못 한다 — 다른 신발 · 모음 글 근거만 뗀다(2026-10-23)
    if (r.width != null && r.sources?.width && /believeintherun|runningshoesguru|solereview/.test(r.sources.width) && otherShoe(r.line_key, r.sources.width)) { (out[`${file}::${id}`] ??= {}).width = 'page_is_variant'; st.variant++; st.rows_affected.add(id); }
  }
  st.rows_affected = st.rows_affected.size;
}
fs.writeFileSync(path.join(WORK, 'audit.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(WORK, 'women-weights.json'), JSON.stringify(women, null, 1));
console.log('women US W7/W7.5 weights recorded', Object.keys(women).length);
console.table(stats);
console.log('fields flagged', Object.values(out).reduce((n, x) => n + Object.keys(x).length, 0), '| rows', Object.keys(out).length);
