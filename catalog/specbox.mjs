// 리뷰 페이지의 "스펙 상자"를 정해진 형식으로 읽는다(2026-10-21) — 에이전트가 아니라 정규식. 추측하지 않는다.
//   대상: 이미지가 있는 행의 사이트맵 색인 주소(local/work/index-hits.json) 중 BITR 리뷰 · RSG 리뷰. 받기는 local/fetch.mjs(규칙 강제)
//   BITR  "What You Need To Know": 무게 "X oz. (Y g) for a US M9" (US M9 만), "Stack Height / Drop A mm in heel, B mm in forefoot (C mm drop)", "Key Features <폼> midsole"
//   RSG   "The facts": "Weight W oz", "Drop D mm", "Stack height A mm heel · B mm toe" — 무게는 사이즈 표기가 없어 기준 미상
//   solereview 는 소스에서 뺐다(2026-10-23 사용자) — 반 켤레를 직접 달고("for a half pair") 스택도 재는 실측이라 공시값이 아니다
//   결과: local/work/specbox.json — { "<id>": { bitr: {...,url}, rsg: {...,url} } }
import fs from 'node:fs';
import { get } from './local/fetch.mjs';
import { otherShoe } from './variant.mjs';

const U = (f) => new URL(`./${f}`, import.meta.url);
const R = fs.readFileSync(U('shoes.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).filter((r) => r.images.length);
const hits = JSON.parse(fs.readFileSync(U('local/work/index-hits.json'), 'utf8'));
const text = (b) => b.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&middot;/g, '·').replace(/&#8217;/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');

export function parseBitr(t) {
  const box = t.slice(Math.max(0, t.search(/What You Need To Know/i)), (t.search(/What You Need To Know/i) + 900) || 900);
  const w = box.match(/(\d+(?:\.\d+)?)\s*oz\.?\s*\(\s*(\d{2,3})\s*g\s*\)\s*for a\s*US\s*M\s*(\d+(?:\.5)?)/i);
  // 남녀가 함께 적히면 남성 값만(2026-10-24): "Men: A mm in heel …" · "A mm in heel, B mm in forefoot (Men) / … (Women), C mm drop". "Women:" 이 먼저면 맞지 않는다(null)
  let s = box.match(/Stack Height\s*(?:\/|&|and)\s*Drop:?\s*(?:Men'?s?:\s*)?(\d+(?:\.\d)?)\s*mm in (?:the )?heel,\s*(\d+(?:\.\d)?)\s*mm in (?:the )?forefoot\s*\(\s*(\d+(?:\.\d)?)\s*(?:mm )?drop\s*\)/i);
  if (!s) { const x = box.match(/Stack Height\s*(?:\/|&|and)\s*Drop:?\s*(\d+(?:\.\d)?)\s*mm in (?:the )?heel,\s*(\d+(?:\.\d)?)\s*mm in (?:the )?forefoot\s*\(Men\).{0,90}?,\s*(\d+(?:\.\d)?)\s*mm drop/i); if (x) s = x; }
  // 상자에 성별이 없는데 본문이 남성 값을 밝히면 그것을 쓴다 — 매직 스피드 4: 상자 43.5 는 여성, 본문 "44.5 mm in the heel (for men; for women, it's 1 mm less)"
  const menBody = t.match(/(\d+(?:\.\d)?)\s*mm in the heel\s*\(\s*for men/i);
  const boxGendered = /Stack Height[^.]{0,40}\b(men|women)\b/i.test(box.slice(0, 400));
  const menHeelFromBody = s && !boxGendered && menBody && Number(menBody[1]) !== Number(s[1]) ? Number(menBody[1]) : null;
  const m = box.match(/Key Features\s+(.{3,60}?)\s+midsole/i);
  if (!w && !s && !m) return null;
  // oz 와 g 가 서로 맞는지(±5%) — BITR 상자 안에서도 "10.7 oz (199 g)" 같은 오기가 있다
  const ozOk = w && Math.abs(Number(w[1]) * 28.35 - Number(w[2])) / Number(w[2]) <= 0.05;
  return {
    weight_g: w && Number(w[3]) === 9 && ozOk ? Number(w[2]) : null, weight_size: w ? `M${w[3]}` : null,
    weight_any_g: w && ozOk ? Number(w[2]) : null,  // 사이즈가 M9 가 아니어도 — weight_size 로 기준을 붙인다(2026-10-21)
    women: (() => { const x = box.match(/(\d+(?:\.\d+)?)\s*oz\.?\s*\(\s*(\d{2,3})\s*g\s*\)\s*for a\s*US\s*W\s*(\d+(?:\.5)?)/i); return x ? { g: Number(x[2]), size: `W${x[3]}` } : null; })(), weight_box_mismatch: w && !ozOk ? `${w[1]} oz vs ${w[2]} g` : undefined,
    stack_heel_mm: menHeelFromBody ?? (s ? Number(s[1]) : null), forefoot_mm: menHeelFromBody != null ? null : s ? Number(s[2]) : null, drop_mm: s ? Number(s[3]) : null,
    ...(menHeelFromBody != null ? { stack_note: `상자 ${s[1]}mm 는 여성 — 본문의 남성 값 ${menHeelFromBody}mm` } : {}),
    midsole: m ? m[1].replace(/^(a |an |the )/i, '').replace(/[™®]/g, '').trim() : null,
  };
}
export function parseRsg(t) {
  const i = t.search(/The facts/i); if (i < 0) return null;
  const box = t.slice(i, i + 400);
  const w = box.match(/Weight\s*(\d+(?:\.\d+)?)\s*oz/i), d = box.match(/Drop\s*(\d+(?:\.\d)?)\s*mm/i), s = box.match(/Stack height\s*(\d+(?:\.\d)?)\s*mm heel(?:\s*·?\s*(\d+(?:\.\d)?)\s*mm (?:toe|forefoot))?/i);
  if (!w && !d && !s) return null;
  const n = (m) => (m && Number(m[1]) !== 999 ? Number(m[1]) : null);  // RSG 는 값이 없으면 999 를 적는다
  return { weight_g_unknown_size: n(w) != null ? Math.round(n(w) * 28.35) : null, drop_mm: n(d), stack_heel_mm: n(s), forefoot_mm: s?.[2] && Number(s[2]) < 100 ? Number(s[2]) : null };
}

async function main() {
  const jobs = { bitr: [], rsg: [] };
  for (const r of R) {
    const id = `${r.line_key}#${r.generation}`;
    // 변형 판(GRVL · GTX · Gore-Tex · Hike · Wide · Trail 이 라인 이름에 없는데 주소에 있음) 리뷰는 쓰지 않는다 — Aero Glide 4 GRVL 사고
    const variant = (u) => otherShoe(r.line_key, u) !== null;  // 다른 판 · 다른 모델 · 모음 글(variant.mjs)
    for (const u of (hits[id] ?? []).filter((u) => !variant(u))) {
      if (/believeintherun\.com\/shoe-reviews\//.test(u)) jobs.bitr.push([id, u]);
      else if (/runningshoesguru\.com\/(reviews|20\d\d)\//.test(u)) jobs.rsg.push([id, u]);
    }
  }
  const out = {}, fails = [];
  // 호스트마다 한 줄로(fetch.mjs 가 호스트 간격을 지킨다), 두 호스트는 나란히
  await Promise.all(Object.entries(jobs).map(async ([site, list]) => {
    for (const [id, u] of list) {
      let p; try { p = await get(u); } catch (e) { fails.push(`${u} ${e.message}`); continue; }
      if (p.status !== 200) { fails.push(`${u} ${p.status}`); continue; }
      const v = (site === 'bitr' ? parseBitr : parseRsg)(text(p.body));
      if (v && !(out[id] ??= {})[site]) out[id][site] = { ...v, url: u };
    }
  }));
  fs.writeFileSync(U('local/work/specbox.json'), JSON.stringify(out, null, 1));
  const n = (s, k) => Object.values(out).filter((x) => x[s]?.[k] != null).length;
  console.log('rows with spec box', Object.keys(out).length, '| BITR weight(M9)', n('bitr', 'weight_g'), 'stack', n('bitr', 'stack_heel_mm'), 'drop', n('bitr', 'drop_mm'), 'midsole', n('bitr', 'midsole'), '| RSG stack', n('rsg', 'stack_heel_mm'), 'drop', n('rsg', 'drop_mm'), 'weight(size?)', n('rsg', 'weight_g_unknown_size'));
  console.log('fetch fails', fails.length, fails.slice(0, 5));
}
if (import.meta.url === `file://${process.argv[1]}`) main();
