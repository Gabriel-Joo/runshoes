// 정합성: 출처가 힐 · 포어풋 · 드롭을 모두 적었으면 힐 - 드롭 = 포어풋(±0.5)인지(2026-10-23). 이미 읽은 페이지만, 새로 받지 않는다
//   BITR · RSG — 스펙 상자(specbox.json). 공식몰 · 보도자료 — 수집 기록의 공식 출처 페이지에서 "스택 38mm/30mm · 드롭 8mm" 꼴
//   결과: forefoot-check.csv — 안 맞는 것만. '지금 씀' 은 그 출처가 shoes.jsonl 의 힐 · 드롭 출처인지
import fs from 'node:fs';
import crypto from 'node:crypto';

const U = (f) => new URL(`./${f}`, import.meta.url);
const R = new Map(fs.readFileSync(U('shoes.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).filter((r) => r.images.length).map((r) => [`${r.line_key}#${r.generation}`, r]));
const SB = JSON.parse(fs.readFileSync(U('local/work/specbox.json'), 'utf8'));
const OFF = /nbkorea|saucony\.co\.kr|brooksrunning\.co\.kr|kor\.mizuno|salomon\.co\.kr|kr\.puma\.com|altra\.co\.kr|asics\.co\.kr|merrellkorea|mediahub\.puma|corp\.asics|amersports|saucony\.com/;
const esc = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
const text = (u) => {
  for (const v of [u, u.replace(/\/$/, ''), u + '/']) {
    const f = U(`local/cache/${crypto.createHash('sha1').update(v).digest('hex')}.json`);
    if (fs.existsSync(f)) { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return j.status === 200 ? j.body.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ') : null; }
  }
  return null;
};
const OFF_RE = /(?:스택|stack)[^0-9]{0,40}?(\d+(?:\.\d)?)\s*mm\s*\/\s*(\d+(?:\.\d)?)\s*mm[^0-9]{0,60}?(?:드롭|drop)[^0-9]{0,40}?(\d+(?:\.\d)?)\s*mm/i;

const checks = [];
for (const [id, r] of R) {
  const b = SB[id]?.bitr, g = SB[id]?.rsg;
  if (b?.stack_heel_mm != null && b.forefoot_mm != null && b.drop_mm != null) checks.push({ id, code: 'BITR', u: b.url, heel: b.stack_heel_mm, fore: b.forefoot_mm, drop: b.drop_mm });
  if (g?.stack_heel_mm != null && g.forefoot_mm != null && g.drop_mm != null) checks.push({ id, code: 'RSG', u: g.url, heel: g.stack_heel_mm, fore: g.forefoot_mm, drop: g.drop_mm });
}
// 공식 출처 — 수집 기록에 공식 URL 이 붙은 행의 그 페이지
const seen = new Set();
for (const f of fs.readdirSync(U('local/work')).filter((x) => /^specs-.*\.jsonl$/.test(x))) for (const l of fs.readFileSync(U(`local/work/${f}`), 'utf8').split('\n')) if (l.trim()) {
  const s = JSON.parse(l), id = `${s.line_key}#${s.generation}`; if (!R.has(id)) continue;
  for (const u of new Set(Object.values(s.sources ?? {}).filter((u) => OFF.test(u ?? '')))) {
    if (seen.has(id + u)) continue; seen.add(id + u);
    const m = (text(u) ?? '').match(OFF_RE); if (!m) continue;
    checks.push({ id, code: /mediahub|corp\.asics|amersports|saucony\.com/.test(u) ? 'PR' : 'STORE', u, heel: Number(m[1]), fore: Number(m[2]), drop: Number(m[3]) });
  }
}
// 사람 판단(decisions.json forefoot_mm): use_source = 그 행의 포어풋을 판단값으로 보고 다시 잰다(에보 SL 39/32/7). flag = 불일치를 그대로 남긴다
const DEC = JSON.parse(fs.readFileSync(U('decisions.json'), 'utf8')).rows;
for (const c of checks) { const d = DEC[c.id]?.forefoot_mm; if (d?.action === 'use_source') c.fore = d.value; }
const bad = checks.filter((c) => Math.abs(c.heel - c.drop - c.fore) > 0.5);
const head = ['line_key', 'generation', '모델', '출처', 'URL', '힐', '포어풋', '드롭', '힐-드롭', '차이', '지금 씀'];
const rows = bad.map((c) => { const r = R.get(c.id); const used = [r.sources?.official_heel_mm, r.sources?.official_drop_mm].includes(c.u);
  return [r.line_key, r.generation, r.model, c.code, c.u, c.heel, c.fore, c.drop, +(c.heel - c.drop).toFixed(1), +(c.heel - c.drop - c.fore).toFixed(1), used ? '예' : '아니오']; });
rows.sort((a, b) => (a[10] === '예' ? 0 : 1) - (b[10] === '예' ? 0 : 1) || a[0].localeCompare(b[0]));
fs.writeFileSync(U('forefoot-check.csv'), '﻿' + [head, ...rows].map((x) => x.map(esc).join(',')).join('\n') + '\n');
const by = (a, f) => a.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
console.log('검사', checks.length, by(checks, (c) => c.code), '| 안 맞음', bad.length, by(bad, (c) => c.code), '| 그중 지금 쓰는 출처', rows.filter((x) => x[10] === '예').length);
