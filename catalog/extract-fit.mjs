// 이미 읽은 페이지(캐시)에서 와이드 판 여부 · 발볼(착화감) 근거를 뽑는다(2026-10-21). 새로 받지 않는다.
//   local/work/specs-wide.jsonl — 와이드 판이 있다는 언급(사실) → wide_available: true + 출처 URL. false 는 뽑지 않는다(침묵으로 증명하지 않는다)
//   발볼과 와이드는 소스가 다르다(2026-10-23 사용자): 발볼 = 리뷰 본문의 핏 서술만, 와이드 = 와이드 판(2E · 4E · wide)이 나오는지.
//     "와이드 판이 나온다"는 발볼 근거가 아니다(브랜드 정책이지 라스트 너비가 아니다). 바닥 · 플랫폼이 넓다는 말도 발볼이 아니다.
//     RSG 의 테스터 표("Size & fit … Heel Normal Midfoot Wide Toebox Normal")는 칸 경계를 넘어 읽히므로 발볼 근거에서 뺀다
//   local/width.csv             — 발볼(토박스 너비) 제안값 + 근거 인용 + 출처 URL. 인용은 남의 글이라 공개 레포(catalog/)에 두지 않는다
//   발볼 = 토박스 너비(2026-10-23 사용자): 토박스 · 포어풋 서술만 근거다. 미드풋(끈으로 조절된다) · 힐(힐 슬립 문제) · 전체 핏("snug fit" · "narrow last")은 쓰지 않는다
//   쓰는 페이지: 그 행의 출처 페이지 · 사이트맵 색인에서 같은 세대로 맞춘 페이지. 본문 끝의 관련 글 목록은 잘라 낸다(다른 신발 이야기)
import fs from 'node:fs';
import crypto from 'node:crypto';
import { otherShoe } from './variant.mjs';

const U = (f) => new URL(`./${f}`, import.meta.url);
const R = fs.readFileSync(U('local/work/shoes.base.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).filter((r) => r.images.length);  // 채우기 전(fill 의 발볼 제안을 다시 본다)
const hits = JSON.parse(fs.readFileSync(U('local/work/index-hits.json'), 'utf8'));
// WearTesters 리뷰(2026-10-24 사용자 승인) — 사이트맵에서 그 모델 · 세대 주소만 고른 것(weartesters.mjs). 발볼 근거로만 쓴다(와이드 문장은 BITR · RSG 만)
const wtHits = fs.existsSync(U('local/work/weartesters-hits.json')) ? JSON.parse(fs.readFileSync(U('local/work/weartesters-hits.json'), 'utf8')) : {};
for (const [id, us] of Object.entries(wtHits)) hits[id] = [...new Set([...(hits[id] ?? []), ...us])];
const esc = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };

function page(u) {
  for (const v of [u, u.replace(/\/$/, ''), u + '/']) {
    const f = U(`local/cache/${crypto.createHash('sha1').update(v).digest('hex')}.json`);
    if (!fs.existsSync(f)) continue;
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (j.status !== 200) return null;
    let t = j.body.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&#8217;|&rsquo;/g, "'").replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
    t = t.replace(/Our tester'?s take[\s\S]{0,260}?Toe ?box\s+\w+/gi, ' ').replace(/Size & fit[\s\S]{0,200}?Toe ?box\s+\w+/gi, ' ');  // RSG 테스터 표
    // 독자 댓글("Ben says: December 21, 2022 at 9:25 am …")부터는 리뷰가 아니다 — 와이드 · 발볼 근거로 쓰지 않는다(2026-10-23, 아디제로 SL 1 "Their website says they don't come in wide" 가 댓글이었다)
    const cm = t.search(/\b\S+(?: \S+){0,3} says: (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}/);
    if (cm > 0) t = t.slice(0, cm);
    if (/weartesters\.com/.test(u)) { const e = t.search(/\b(How does the Author Run\?|Disclosure\b|Add a Comment)/); if (e > 0) t = t.slice(0, e); }  // WearTesters — 리뷰 본문 끝(작성자 소개 · 고지 · 댓글 · 다른 글 목록은 근거가 아니다)
    const cut = t.search(/\b(Related Posts|Related Articles|Read Next|You May Also Like|More Reviews|Similar Shoes)\b/i);
    if (cut > 2000) t = t.slice(0, cut);
    return t;
  }
  return null;
}
// 와이드 판이 나온다는 문장만(2026-10-23 다시 좁힘) — 낱말 "2E" · "와이드" 만으로는 잡지 않는다: 몰 메뉴("옴니9 와이드") · 리뷰어 자기 신발("my 10.5 2E" · "Speedgoat 5 2E") ·
//   "regular and wide" 발 이야기가 true 로 잡혔다. 국내몰 상품명은 wide-store.mjs 가 본다
const WIDE_YES = /(available in (?:a |an )?(?:2E |4E |extra )?wide\b|available in wider widths|wide (?:widths?|versions?|options?|sizing|models?) (?:is |are )?(?:also )?available|comes? in (?:a |an )?(?:2E |4E )?wide (?:versions?|options?|widths?|fit)|comes in wide and extra wide|(?:regular|standard|D) and wide versions)/i;
const TB = '(?:toe[ -]?box|toe[ -]?bed|forefoot)';
const FIT_N = new RegExp(`((?:narrow|snug|tight|cramped|tapered|pointy|shallow) ${TB}|${TB} (?:is|was|feels|felt|runs|can feel)(?: a bit| slightly| a little| quite| very| too| rather)? (?:narrow|snug|tight|cramped|tapered|pointy)|발볼이? 좁|앞볼이? 좁|토박스가? 좁)`, 'i');
// 부정문("doesn't come in a wide version" · "not currently available in a wide")은 와이드가 없다는 말이다 — true 근거로 쓰지 않는다(2026-10-23, 슈퍼블라스트 2 · 줌 플라이 6 · 스카이워드 X · 글리세린 맥스가 이것으로 true 였다)
//   없다는 언급은 local/work/wide-no.json 에 따로 모은다(적용하지 않는다 — false 를 쓸지는 사용자 판단)
const WIDE_NO = /((?:doesn't|doesn’t|does not|don't|don’t|do not|won't|isn't|isn’t|is not|aren't|not)\s+(?:currently\s+|yet\s+|also\s+)?(?:come|comes|available|offered|made|sold)\s+in\s+(?:a\s+)?wide|\bno wide (?:version|option|width|sizing|model)|only (?:comes|available|offered|made) in (?:a |one )?(?:standard|regular|medium|D) width)/i;
const FIT_W = new RegExp(`((?:wide|roomy|spacious|generous|accommodating|ample) ${TB}|${TB} (?:is|was|feels|felt)(?: a bit| slightly| quite| very| plenty| nice and)? (?:wide|roomy|spacious|generous|accommodating)|(?:plenty of|lots of|ample|enough) (?:room|space|wiggle room) (?:in|for) the (?:toe ?box|toes|forefoot)|발볼이? 넓(?!이)|앞볼이? 넓|토박스가? 넓)`, 'i');
// 다른 신발 이야기 — 문장에 다른 브랜드 이름이나 다른 라인의 이름 낱말이 있으면 토박스 근거에서 뺀다(2026-10-23: "The Deviate has a narrow toe box …" 가 보스턴 12 근거로 잡혔다)
const BRANDS = { nike: 'nike', adidas: 'adidas', asics: 'asics', hoka: 'hoka', newbalance: 'new balance', brooks: 'brooks', saucony: 'saucony', on: 'on running', mizuno: 'mizuno', puma: 'puma', salomon: 'salomon', altra: 'altra', merrell: 'merrell', underarmour: 'under armour' };
const GENERIC = new Set(['gel', 'wave', 'fresh', 'foam', 'pro', 'max', 'plus', 'elite', 'trail', 'speed', 'run', 'sl', 'ultra', 'evo', 'gts', 'nitro', 'zoom', 'air', 'x', 'v', 'flow', 'lite', 'next', 'premium', 'strike', 'sky', 'ride', 'rise', 'adizero', 'terrex', 'slab', 'acg', 'supercomp', 'fuelcell', 'cloud', 'one']);
const LINES = [...new Set(fs.readFileSync(U('candidates.csv'), 'utf8').replace(/\r/g, '').trim().split('\n').slice(1).map((l) => l.split(',')[0]))];
const lineWords = (lk) => lk.split(':')[1].split('-').filter((w) => w.length >= 4 && !GENERIC.has(w) && !/^\d+$/.test(w));
// 질문 · 가정 · 비교 문장은 토박스가 어떻다는 말이 아니다("Would I need … a wider forefoot?" · "version 2 has a wider toe box")
const notStatement = (sentence) => /\?/.test(sentence) || /^(if|would|should|could|wish)\b/i.test(sentence.trim()) || /\b(wider|narrower|roomier|snugger|tighter)\b/i.test(sentence);
function mentionsOther(lineKey, sentence) {
  if (notStatement(sentence)) return true;
  const t = ` ${sentence.toLowerCase().replace(/[^a-z0-9 ]/g, ' ')} `, own = new Set(lineWords(lineKey)), brand = lineKey.split(':')[0];
  if (Object.entries(BRANDS).some(([b, n]) => b !== brand && t.includes(` ${n} `))) return true;
  return LINES.some((lk) => lk !== lineKey && lineWords(lk).some((w) => !own.has(w) && t.includes(` ${w} `)));
}
const FIT_M = new RegExp(`((?:medium|average|standard|normal|moderate)(?:-width| width)? ${TB}|${TB} (?:is|was|feels)(?: a)? (?:medium|average|standard|normal)(?:-width| width)?)`, 'i');
// 발볼 근거로 쓰지 않는 문맥: 리뷰어 자기 발("my wide forefoot") · 와이드 판 이야기("available in wide fit") · 바닥 이야기("wide forefoot base") · 상품 정보("발볼 넓이 2E")
const NOT_FIT = (t, i, m) => /\bmy\s+$/i.test(t.slice(Math.max(0, i - 6), i)) || /(available|offered|comes|also|sold|order|in a|option|version)\s*(in\s*)?(a\s*)?$/i.test(t.slice(Math.max(0, i - 30), i))
  || /^\s*(base|platform|landing|outsole|sole|footprint)/i.test(t.slice(i + m.length, i + m.length + 15))
  || /\b(2E|4E|wide fit option)\b/i.test(t.slice(i, i + m.length + 15));
const sentenceAt = (t, i) => { const s = Math.max(t.lastIndexOf('. ', i) + 2, i - 160), e = Math.min((t.indexOf('. ', i) + 1) || t.length, i + 180); return t.slice(s, e).trim(); };

// 다른 세대 페이지(울트라 글라이드 4 리뷰가 3 의 근거로 잡혔다) — 주소의 세대 숫자가 그 행 세대와 다르면 와이드 · 발볼 근거로 쓰지 않는다.
//   라인 이름의 숫자(1080 · x1)와 연도(2021)는 세대가 아니다
const otherGen = (lineKey, g, u) => { const line = new Set(lineKey.split(':')[1].split('-')); const n = new URL(u).pathname.toLowerCase().split(/[^a-z0-9]+/).filter((w) => /^\d{1,2}$/.test(w) && !line.has(w)).map(Number).filter((x) => x >= 1 && x <= 40); return n.length > 0 && !n.includes(g); };
const wideOut = [], widthRows = [], wideNoOut = {}, wideYesOut = {};
let wideFound = 0;
for (const r of R) {
  const id = `${r.line_key}#${r.generation}`;
  const urls = [...new Set([...Object.values(r.sources ?? {}).filter((u) => /^https?:/.test(u)), ...(hits[id] ?? [])])];
  const core = r.line_key.split(':')[1].split('-').filter((w) => !['gel', 'fresh', 'foam', 'fuelcell', 'slab'].includes(w));
  const dedicated = (u) => { const w = new URL(u).pathname.toLowerCase().split(/[^a-z0-9]+/); return core.every((c) => w.includes(c)); };
  const nearLine = (t, i) => { const win = t.slice(Math.max(0, i - 250), i + 250).toLowerCase().replace(/[^a-z0-9 ]/g, ' '); return core.every((c) => win.includes(c)); };
  const N = [], W = [], M = [];
  let wide = null, wideNo = null;
  for (const u of urls) {
    if (/solereview\.com/.test(u)) continue;  // 소스에서 뺐다(2026-10-23)
    if (otherGen(r.line_key, r.generation, u)) continue;
    const fitOk = !/believeintherun|runningshoesguru/.test(u) || !otherShoe(r.line_key, u);  // 다른 신발 · 모음 글은 발볼 근거가 아니다(와이드 판 근거로는 쓴다)
    const t = page(u); if (!t) continue;
    const ok = (i) => dedicated(u) || nearLine(t, i);
    // 와이드: 값이 이미 있어도 근거를 낸다 — 바탕 데이터가 지난 근거로 채워져 있으면 그 근거가 다음 빌드에서 사라진다
    if (!wide && /believeintherun|runningshoesguru/.test(u) && !otherShoe(r.line_key, u)) for (const m of t.matchAll(new RegExp(WIDE_YES.source, 'gi'))) { const q = sentenceAt(t, m.index); if (ok(m.index) && !WIDE_NO.test(q) && !/\?|\b(hope|wish|would love|needs? to)\b|\bsays:|\bReply\b/i.test(q)) { wide = { url: u, quote: q }; break; } }
    if (!wideNo && /believeintherun|runningshoesguru/.test(u) && !otherShoe(r.line_key, u)) { const m = t.match(WIDE_NO); if (m && ok(m.index) && !/\?/.test(sentenceAt(t, m.index))) wideNo = { url: u, quote: sentenceAt(t, m.index) }; }
    if (r.toebox_width == null && fitOk) {
      for (const m of t.matchAll(new RegExp(FIT_N.source, 'gi'))) if (ok(m.index) && !mentionsOther(r.line_key, sentenceAt(t, m.index)) && !NOT_FIT(t, m.index, m[0]) && N.length < 2 && !N.some((x) => x.url === u)) N.push({ url: u, quote: sentenceAt(t, m.index) });
      for (const m of t.matchAll(new RegExp(FIT_W.source, 'gi'))) if (ok(m.index) && !mentionsOther(r.line_key, sentenceAt(t, m.index)) && !NOT_FIT(t, m.index, m[0]) && W.length < 2 && !W.some((x) => x.url === u)) W.push({ url: u, quote: sentenceAt(t, m.index) });
      for (const m of t.matchAll(new RegExp(FIT_M.source, 'gi'))) if (ok(m.index) && !mentionsOther(r.line_key, sentenceAt(t, m.index)) && M.length < 2 && !M.some((x) => x.url === u)) M.push({ url: u, quote: sentenceAt(t, m.index) });
    }
  }
  if (wideNo) wideNoOut[id] = { ...wideNo, alsoYes: wide?.url ?? null };
  if (wide) wideYesOut[id] = wide;
  if (wide) { wideFound++; wideOut.push({ line_key: r.line_key, generation: r.generation, wide_available: true, sources: { wide_available: wide.url }, note: '페이지에 와이드 판 언급(extract-fit.mjs)' }); }
  if (r.toebox_width == null && (N.length || W.length || M.length)) {
    const kinds = [N.length && '좁음', W.length && '넓음', M.length && '보통'].filter(Boolean);
    const proposal = kinds.length === 1 ? kinds[0] : `판단 필요(${kinds.join(' · ')} 근거가 함께)`;
    const ev = [...N.map((x) => ({ ...x, k: '좁음' })), ...W.map((x) => ({ ...x, k: '넓음' })), ...M.map((x) => ({ ...x, k: '보통' }))].slice(0, 3);
    widthRows.push([r.line_key, r.generation, r.model, r.purpose, proposal, ...ev.flatMap((e) => [`${e.k}: ${e.quote}`, e.url]), ...Array((3 - ev.length) * 2).fill(''), '']);
  }
}
fs.writeFileSync(U('local/work/specs-wide.jsonl'), wideOut.map((x) => JSON.stringify(x)).join('\n') + (wideOut.length ? '\n' : ''));
fs.writeFileSync(U('local/work/wide-no.json'), JSON.stringify(wideNoOut, null, 1));
// 와이드 false 근거(2026-10-23 사용자 승인: 리뷰의 "no wide" 언급은 확실한 근거) — 그 모델 · 세대 리뷰(BITR · RSG)의 부정문만.
//   때를 한정한 말("yet" · "currently" · "for now" · "at launch")은 뒤에 와이드가 나올 수 있어 쓰지 않는다. 같은 행에 true 근거가 있으면 내지 않는다(build 가 비운다)
const TIMED = /\b(yet|currently|for now|at launch|at the moment|at this time|so far)\b/i;
const wideNoRows = Object.entries(wideNoOut).filter(([, v]) => !TIMED.test(v.quote) && !v.alsoYes).map(([id, v]) => { const [lk, g] = id.split('#'); return { line_key: lk, generation: Number(g), wide_available: false, sources: { wide_available: v.url }, note: '리뷰에 와이드 판이 없다는 언급(extract-fit.mjs)' }; });
fs.writeFileSync(U('local/work/wide-no.jsonl'), wideNoRows.map((x) => JSON.stringify(x)).join('\n') + (wideNoRows.length ? '\n' : ''));
fs.writeFileSync(U('local/work/wide-yes.json'), JSON.stringify(wideYesOut, null, 1));  // 와이드 true 근거 문장(검토용 — 남의 글이라 local 에만)
fs.writeFileSync(U('local/width.csv'), '﻿' + [['line_key', 'generation', '모델', '용도', '제안값', '근거 1', '출처 1', '근거 2', '출처 2', '근거 3', '출처 3', '승인 값(좁음/보통/넓음, 비우면 null) — 토박스 너비'], ...widthRows].map((r) => r.map(esc).join(',')).join('\n') + '\n');
const by = (a, f) => a.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
console.log('이미지 행', R.length, '| 와이드 true 새 근거', wideFound, '| 와이드 없음 언급', Object.keys(wideNoOut).length, '| width 후보', widthRows.length, by(widthRows, (x) => x[4].split('(')[0]));
console.log('토박스 근거 없는 빈 행', R.filter((r) => r.toebox_width == null).length - widthRows.length);
