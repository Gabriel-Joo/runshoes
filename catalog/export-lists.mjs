// 사람이 웹 검색(W)으로 채울 목록 두 개(2026-10-23). 이미지가 있는 행만. todo.mjs 다음에 돌린다
//   weight-todo.csv   — 무게가 US M9 가 아닌 행 전부(다른 사이즈 · 사이즈 불명 · 비어 있음). 무게 기준은 US M9 만 쓴다
//   conflict-todo.csv — todo.csv 의 '충돌' 필드 하나 = 한 줄. 후보가 셋이면 값C · 출처C
//   출처 칸은 '<코드> <URL>'(입력 형식 'WEB <URL>' 과 같다). 코드는 todo.mjs 머리말(BITR · RSG · STORE · PR · WEB · MAN · DB). DB 는 기존 DB(다나와 입력, URL 없음)
//   입력 칸(맨 뒤, 사람이 채운다)
//     weight-todo   : 입력무게(g) · 입력사이즈(M9 · M10 …) · 입력출처('WEB <URL>' 또는 'MAN')
//     conflict-todo : 판단(A · B · C · 직접) · 입력값(직접일 때만) · 입력출처('WEB <URL>' 또는 'MAN')
//       A · B · C = 그 값을 쓴다. 웹 검색으로 확인했으면 입력출처에 그 URL — 비우면 그 값의 원래 출처를 쓴다
//       직접 = 목록에 없는 값. 입력값과 입력출처가 둘 다 있어야 한다
//   사람이 고친 파일은 덮어쓰지 않는다 — local/work/generated.json 해시와 다르면 *.new.csv
import fs from 'node:fs';
import crypto from 'node:crypto';

const U = (f) => new URL(`./${f}`, import.meta.url);
const R = fs.readFileSync(U('shoes.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).filter((r) => r.images.length);
const cand = new Map(fs.readFileSync(U('candidates.csv'), 'utf8').replace(/\r/g, '').trim().split('\n').slice(1).map((l) => l.split(',')).map((c) => [`${c[0]}#${c[1]}`, c[5]]));
const parseCsv = (s) => s.replace(/^﻿/, '').replace(/\r/g, '').trim().split('\n').map((l) => { const o = []; let c = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(c); c = ''; } else c += ch; } o.push(c); return o; });
const esc = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
const GEN = U('local/work/generated.json'), gen = fs.existsSync(GEN) ? JSON.parse(fs.readFileSync(GEN, 'utf8')) : {};
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
const write = (f, head, rows) => {
  const body = '﻿' + [head, ...rows].map((r) => r.map(esc).join(',')).join('\n') + '\n';
  const cur = fs.existsSync(U(f)) ? fs.readFileSync(U(f), 'utf8') : null;
  if (cur !== null && (!gen[f] || sha(cur) !== gen[f])) { const nf = f.replace(/\.csv$/, '.new.csv'); fs.writeFileSync(U(nf), body); console.log(`! ${f} 는 사람이 고쳤다 — ${nf} 로 썼다`); return; }
  fs.writeFileSync(U(f), body); gen[f] = sha(body); fs.writeFileSync(GEN, JSON.stringify(gen, null, 1));
};

// todo.mjs 와 같은 코드 · 출처 표기(todo-sources.csv 에서 URL 을 찾는다)
const TS = parseCsv(fs.readFileSync(U('todo-sources.csv'), 'utf8')).slice(1);
const urlOf = (lk, g, field, code, value) => TS.find((s) => s[0] === lk && s[1] === String(g) && s[2] === field && s[3] === code && s[5] === String(value))?.[4]
  ?? TS.find((s) => s[0] === lk && s[1] === String(g) && s[2] === field && s[3] === code)?.[4];
const label = (code, url) => (!code ? '' : code === 'DB' ? 'DB (기존 DB, 다나와 입력)' : url ? `${code} ${url}` : code);

// 1. weight-todo
const T = parseCsv(fs.readFileSync(U('todo.csv'), 'utf8'));
const H = T[0], todo = new Map(T.slice(1).map((c) => [`${c[0]}#${c[1]}`, c]));
const W = [];
for (const r of R) {
  if (r.official_weight_size === 'M9') continue;
  const id = `${r.line_key}#${r.generation}`, t = todo.get(id);
  const code = t ? t[H.indexOf('무게출처')].split(' | ')[0] : '';
  const size = r.official_weight_g == null ? '비어 있음' : r.official_weight_size ?? '불명';
  W.push([r.line_key, r.generation, r.model, cand.get(id), r.official_weight_g, size, r.official_weight_g == null ? '' : label(code, /^https?:/.test(r.sources?.official_weight_g ?? '') ? r.sources.official_weight_g : null), '', '', '']);
}
W.sort((a, b) => a[0].localeCompare(b[0]) || b[1] - a[1]);
write('weight-todo.csv', ['line_key', 'generation', '모델', '영문', '현재무게', '현재사이즈', '현재출처', '입력무게', '입력사이즈', '입력출처'], W);

// 공시값 확인(2026-10-23): 허용 소스 안에서 제조사 발표값을 찾았는지. 못 찾으면 '확인 불가' + 까닭(브랜드별 — 다시 찾으면 고친다)
//   실측(RunRepeat · RTINGS)은 쓰지 않는다. Fleet Feet 는 약관 9조(spider · crawl · scrape 금지)로 수집하지 않는다 — 사람이 웹 검색으로 본 것(WEB)만
const OFFICIAL_CHECK = {
  nike: '확인 불가 — 나이키 공식몰 · 뉴스룸은 약관 차단',
  adidas: '확인 불가 — 허용 공식 출처 없음(국내 공식몰 수집 대상 밖)',
  hoka: '확인 불가 — 허용 공식 출처 없음(국내 공식몰 수집 대상 밖)',
  on: '확인 불가 — 허용 공식 출처 없음(press.on-running.com 보류)',
  asics: '확인 불가 — 아식스 보도자료 색인에 이 모델 없음, 국내 공식몰 수집 대상 밖',
  brooks: '확인 불가 — 브룩스 국내몰은 스펙을 글자로 적지 않음',
  saucony: '확인 불가 — 사우코니 국내몰 스펙은 이미지, 뉴스룸 색인에 없음',
  mizuno: '확인 불가 — 미즈노 국내몰 스펙은 이미지',
  merrell: '확인 불가 — 머렐 국내몰 스펙은 이미지',
  puma: '확인 불가 — 푸마 국내몰은 현행 세대만(지난 세대 상세 없음), 보도자료 색인에 없음',
  newbalance: '확인 불가 — 뉴발란스 국내몰에 스택 · 드롭 칸 없음',
  salomon: '확인 불가 — 살로몬 국내몰 검색에 이 모델 없음',
};
const officialCheck = (lineKey, srcs) => (srcs.some((x) => /^(STORE|PR) /.test(x)) ? '공시값 있음(STORE · PR 칸)' : OFFICIAL_CHECK[lineKey.split(':')[0]] ?? '확인 불가');

// 2. conflict-todo
const C = [];
for (const c of T.slice(1)) {
  for (const w of c[H.indexOf('사유')].split(', ').filter((x) => x.endsWith(':충돌') || x.endsWith(':본문값'))) {
    const f = w.split(':')[0], vals = c[H.indexOf(f)].split(' | '), codes = c[H.indexOf(`${f}출처`)].split(' | ');
    const src = vals.map((v, i) => label(codes[i], urlOf(c[0], c[1], f, codes[i], v)));
    C.push([c[0], c[1], c[2], c[3], w.endsWith(':본문값') ? `${f}(BITR 본문)` : f, vals[0], src[0], vals[1] ?? '', src[1] ?? '', vals[2] ?? '', src[2] ?? '', '', '', '']);
  }
}
// 포어풋 정합성(check-forefoot.mjs) — 지금 쓰는 출처가 힐 - 드롭 ≠ 포어풋이면 확인 대상(2026-10-23 사용자). 값A = 그 출처의 '힐 / 포어풋 / 드롭'
if (fs.existsSync(U('forefoot-check.csv'))) for (const c of parseCsv(fs.readFileSync(U('forefoot-check.csv'), 'utf8')).slice(1).filter((c) => c[10] === '예')) {
  const t = todo.get(`${c[0]}#${c[1]}`);
  const flag = JSON.parse(fs.readFileSync(U('decisions.json'), 'utf8')).rows[`${c[0]}#${c[1]}`]?.forefoot_mm?.action === 'flag';
  C.push([c[0], c[1], c[2], t?.[3] ?? cand.get(`${c[0]}#${c[1]}`), flag ? '포어풋(힐-드롭≠포어풋, 사용자 플래그)' : '포어풋(힐-드롭≠포어풋)', `${c[5]} / ${c[6]} / ${c[7]}`, label(c[3], c[4]), '', '', '', '', '', '', '']);
}
// 사람 판단인데 출처가 소스에서 뺀 곳(solereview)인 것 — 다시 확인(2026-10-23 사용자). 값B · C = 지금 상자에 있는 다른 값
const SB = JSON.parse(fs.readFileSync(U('local/work/specbox.json'), 'utf8'));
const DEC = JSON.parse(fs.readFileSync(U('decisions.json'), 'utf8'));
const FN = { weight_g: '무게', drop_mm: '드롭', stack_heel_mm: '스택' };
for (const [id, f] of Object.entries(DEC.rows)) for (const [k, d] of Object.entries(f)) {
  if (d.action !== 'use_source' || !/solereview\.com/.test(d.source ?? '') || !FN[k]) continue;
  const r = R.find((x) => `${x.line_key}#${x.generation}` === id); if (!r) continue;
  const b = SB[id]?.bitr ?? {}, g = SB[id]?.rsg ?? {};
  const alt = k === 'weight_g' ? [[b.weight_g ?? b.weight_any_g, b.url, b.weight_g ? 'M9' : b.weight_size], [g.weight_g_unknown_size, g.url, '사이즈 불명']] : [[b[k], b.url], [g[k], g.url]];
  const o = alt.filter(([v]) => v != null).map(([v, u, sz]) => [sz ? `${v} (${sz})` : v, label(u.includes('believeintherun') ? 'BITR' : 'RSG', u)]);
  C.push([r.line_key, r.generation, r.model, cand.get(id), `${FN[k]}(판단 출처 SOLE)`, d.value, label('SOLE', d.source), o[0]?.[0] ?? '', o[0]?.[1] ?? '', o[1]?.[0] ?? '', o[1]?.[1] ?? '', '', '', '']);
}
write('conflict-todo.csv', ['line_key', 'generation', '모델', '영문', '필드', '값A', '출처A', '값B', '출처B', '값C', '출처C', '공시값 확인', '판단', '입력값', '입력출처'], C.map((x) => [...x.slice(0, 11), officialCheck(x[0], [x[6], x[8], x[10]]), ...x.slice(11)]));

const by = (a, f) => a.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
console.log('weight-todo.csv', W.length, '행', by(W, (x) => (['비어 있음', '불명'].includes(x[5]) ? x[5] : '다른 사이즈')));
console.log('conflict-todo.csv', C.length, '행', by(C, (x) => x[4]), '| 후보 셋', C.filter((x) => x[9]).length);
