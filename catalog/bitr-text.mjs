// BITR 값이 페이지의 어디에서 왔는지(2026-10-23) — 스펙 상자가 읽지 못한 값(수집 에이전트가 문장에서 읽은 것)을 가른다
//   box      : "What You Need To Know" 상자 구역 안(형식만 달라 상자 정규식이 못 읽은 것 — 믿을 만하다)
//   body     : 본문 문장(추측 "If I had to guess" · 다른 신발과 비교 · 독자 댓글일 수 있다)
//   notfound : 단위(mm · g · oz)를 붙인 그 숫자가 페이지에 없다
//   이미 받은 페이지(local/cache)만 읽는다
import fs from 'node:fs';
import crypto from 'node:crypto';

const CACHE = new URL('./local/cache/', import.meta.url);
const memo = new Map();
function text(u) {
  if (memo.has(u)) return memo.get(u);
  let t = null;
  for (const v of [u, u.replace(/\/$/, ''), u + '/']) {
    const f = new URL(`${crypto.createHash('sha1').update(v).digest('hex')}.json`, CACHE);
    if (fs.existsSync(f)) { const j = JSON.parse(fs.readFileSync(f, 'utf8')); t = j.status === 200 ? j.body.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&#8217;|&rsquo;/g, "'").replace(/&#8211;/g, '-').replace(/\s+/g, ' ') : null; break; }
  }
  memo.set(u, t);
  return t;
}

// field: 'weight_g' | 'drop_mm' | 'stack_heel_mm'
export function whereOnPage(u, field, v) {
  const t = text(u); if (!t) return { where: 'notfound', ctx: '' };
  const box = t.search(/What You Need To Know/i);
  const unit = field === 'weight_g' ? '\\s*(?:g\\b|grams)' : '\\s*(?:mm|millimet)';
  const m = t.match(new RegExp(`(?<![\\d.])${String(v).replace('.', '\\.')}${unit}`, 'i'));
  if (!m) return { where: 'notfound', ctx: '' };
  const i = m.index, s = Math.max(t.lastIndexOf('. ', i) + 2, i - 150);
  return { where: box >= 0 && i > box && i < box + 900 ? 'box' : 'body', ctx: t.slice(s, Math.min(i + 90, (t.indexOf('. ', i) + 1) || i + 90)).trim() };
}
