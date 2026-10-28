// shoes.jsonl → 작업 성격별 CSV 네 개(2026-10-21). 이미지(StockX)가 있는 행만.
//   decide.csv  — 값은 있고 고르기만: 출처 충돌(A vs B) · 범위 밖 · 출처 URL 없음/미검증(A 유지하려면 URL 필요) · 이미지 후보
//   carbon.csv  — 카본이 빈 행
//   weight.csv  — 무게가 비거나 측정 기준 미상(US M9 가 아님)
//   rest.csv    — 드롭 · 스택 · 미드솔까지 비는 행(여러 필드) — 기존 형식
//   한 행이 여러 파일에 나올 수 있다(무게 + 카본이 다 비면 두 파일). 기여도는 "그 파일만 끝내면 실리는 행"으로 센다
import fs from 'node:fs';
import crypto from 'node:crypto';

const U = (f) => new URL(`./${f}`, import.meta.url);
const R = fs.readFileSync(U('shoes.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const en = new Map(fs.readFileSync(U('candidates.csv'), 'utf8').replace(/\r/g, '').trim().split('\n').slice(1).map((l) => l.split(',')).map((c) => [`${c[0]}#${c[1]}`, c[5]]));
const purposeOf = new Map(fs.readFileSync(U('candidates.csv'), 'utf8').replace(/\r/g, '').trim().split('\n').slice(1).map((l) => l.split(',')).map((c) => [c[0], c[7]]));
const esc = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
// 사람이 고친 파일은 덮어쓰지 않는다(2026-10-21 — 채운 carbon.csv 를 빈 양식으로 덮어쓴 사고).
//   마지막으로 만든 내용의 해시를 local/work/generated.json 에 두고, 지금 파일이 그와 다르면(=사람이 고침) <이름>.new.csv 로 쓴다
const GEN = U('local/work/generated.json');
const gen = fs.existsSync(GEN) ? JSON.parse(fs.readFileSync(GEN, 'utf8')) : {};
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
const write = (f, head, rows) => {
  const body = '\ufeff' + [head, ...rows].map((r) => r.map(esc).join(',')).join('\n') + '\n';
  const cur = fs.existsSync(U(f)) ? fs.readFileSync(U(f), 'utf8') : null;
  if (cur !== null && (!gen[f] || sha(cur) !== gen[f])) { const nf = f.replace(/\.csv$/, '.new.csv'); fs.writeFileSync(U(nf), body); console.log(`! ${f} 는 마지막으로 만든 내용과 다르다(사람이 고쳤거나 기록 없음) — 덮어쓰지 않고 ${nf} 로 썼다`); return; }
  fs.writeFileSync(U(f), body); gen[f] = sha(body); fs.writeFileSync(GEN, JSON.stringify(gen, null, 1));
};
const id = (r) => `${r.line_key}#${r.generation}`;
const loadable = (r) => r.status === 'ok' || r.status === 'partial';
const LABEL = { weight_g: '무게', drop_mm: '드롭', stack_heel_mm: '스택', midsole: '미드솔', carbon: '카본', weight: '무게', drop: '드롭', stackHeight: '스택', price: '정가', wideAvailable: '와이드', image: '이미지' };
const FIELD = { weight_g: 'weight', drop_mm: 'drop', stack_heel_mm: 'stackHeight', midsole: 'midsole', carbon: 'carbon' };

const rows = R.filter((r) => r.images.length);
const tasks = new Map();  // id → Set(decide|carbon|weight|rest)
const add = (r, t) => (tasks.get(id(r)) ?? tasks.set(id(r), new Set()).get(id(r))).add(t);

// 1. decide — 판단 항목을 필드 단위 줄로 편다
const D = [];
for (const r of rows) {
  for (const x of r._review) {
    let m;
    if ((m = x.match(/^conflict:(weight_g|drop_mm|stack_heel_mm|midsole|carbon): (?:db )?(.+?) vs (.+?) \((https?:[^)]+)\)$/))) {
      const f = FIELD[m[1]];
      D.push([r.line_key, r.generation, r.model, LABEL[m[1]], m[2], r.sources?.[f] ?? '', m[3], m[4], '', '']); add(r, 'decide');
    } else if ((m = x.match(/^range:(\w+)=(.+)$/))) {
      D.push([r.line_key, r.generation, r.model, `${LABEL[m[1]]}(범위 밖)`, m[2], r.sources?.[m[1]] ?? '', '', '', '', '값이 맞으면 A, 아니면 B 에 바른 값과 출처']); add(r, 'decide');
    } else if ((m = x.match(/^no_url:(\w+)$/))) {
      D.push([r.line_key, r.generation, r.model, `${LABEL[m[1]]}(출처 URL 없음)`, r[m[1]], r.sources?.[m[1]] ?? '', '', '', '', 'A 를 쓰려면 출처 URL 을 B출처 칸에, 아니면 B 에 바른 값']); add(r, 'decide');
    } else if ((m = x.match(/^conflict:unverified_source:(\w+):(.+)$/))) {
      const f = FIELD[m[1]] ?? m[1];
      D.push([r.line_key, r.generation, r.model, `${LABEL[m[1]] ?? m[1]}(출처 미검증)`, r[f], `미검증: ${m[2]}`, '', '', '', '사이트맵 밖 주소 — A 를 쓰려면 허용 출처 URL 필요']); add(r, 'decide');
    } else if ((m = x.match(/^image:(.+)$/))) {
      D.push([r.line_key, r.generation, r.model, '이미지', r.images[0]?.url ?? '', `StockX: ${m[1]}`, '', '', '', '쓸 수 있으면 A, 아니면 비움(제외)']); add(r, 'decide');
    } else if ((m = x.match(/^conflict:(weight_g|drop_mm|stack_heel_mm|midsole|carbon|weight|drop|stack): *(.+?) +vs +(.+?)(?: *\((.+)\))?$/))) {
      // 에이전트가 적은 자유 형식("40 vs 42 (RSG 표 · 본문은 38.5)") — A = 지금 고른 값, B = 다른 출처 값
      const key = { weight: 'weight_g', drop: 'drop_mm', stack: 'stack_heel_mm' }[m[1]] ?? m[1];
      const f = FIELD[key];
      const b = m[4] ?? '';
      D.push([r.line_key, r.generation, r.model, LABEL[key], m[2].replace(/^db /, ''), r.sources?.[f] ?? '', m[3], /^https?:/.test(b) ? b : '', '', /^https?:/.test(b) ? '' : b]); add(r, 'decide');
    } else if (/^conflict:/.test(x) && !/weight_size_unknown/.test(x)) {
      D.push([r.line_key, r.generation, r.model, '기타', x.slice(9), '', '', '', '', '']); add(r, 'decide');
    }
  }
}
write('decide.csv', ['line_key', 'generation', '모델', '필드', '후보 A', 'A 출처', '후보 B', 'B 출처', '판단(A/B/직접값)', '메모'], D);

// 2~4. 빈 필드로 나눈다(겹치지 않게) — 카본만 → carbon, 무게만(또는 기준 미상만) → weight, 그 밖(드롭 · 스택 · 미드솔이 비거나 두 필드 이상) → rest
const F = [['weight', '무게 g(US M9)'], ['drop', '드롭 mm'], ['stackHeight', '스택 뒤꿈치 mm'], ['midsole', '미드솔'], ['carbon', '카본 예/아니오']];
const empties = (r) => F.filter(([k]) => r[k] == null).map(([k]) => k);
const kind = (r) => { const e = empties(r); if (e.length === 1 && e[0] === 'carbon') return 'carbon'; if ((e.length === 1 && e[0] === 'weight') || (!e.length && r.weight_basis === 'unknown')) return 'weight'; return e.length ? 'rest' : null; };
const C = rows.filter((r) => kind(r) === 'carbon'), W = rows.filter((r) => kind(r) === 'weight'), S = rows.filter((r) => kind(r) === 'rest');
C.forEach((r) => add(r, 'carbon')); W.filter((r) => r.weight == null).forEach((r) => add(r, 'weight')); S.forEach((r) => add(r, 'rest'));
// 카본은 출처 URL 이 선택이다(2026-10-21 사용자). 용도(레이스가 아니면 거의 '아니오')를 같이 보여 준다 — candidates.csv 에서 line_key 로
write('carbon.csv', ['line_key', 'generation', '모델', '영문', '용도', '입력 카본(예/아니오)', '출처 URL(선택)'], C.map((r) => [r.line_key, r.generation, r.model, en.get(id(r)), purposeOf.get(r.line_key) ?? r.purpose, '', '']));
write('weight.csv', ['line_key', 'generation', '모델', '영문', '현재값', '현재 출처', '기준', '입력 무게 g(US M9)', '출처 URL'],
  W.map((r) => [r.line_key, r.generation, r.model, en.get(id(r)), r.weight, r.sources?.weight ?? '', r.weight == null ? '비어 있음' : '측정 기준 미상(US M9 아님)', '', '']));
write('rest.csv', ['line_key', 'generation', '현행/직전', '브랜드', '모델', '영문', '빈 필드', ...F.flatMap(([, l]) => [`현재 ${l}`, `현재 출처 ${l}`, `입력 ${l}`, `입력 출처 URL ${l}`])],
  S.map((r) => [r.line_key, r.generation, r.is_current ? '현행' : '직전', r.brand, r.model, en.get(id(r)), F.filter(([k]) => r[k] == null).map(([, l]) => l.split(' ')[0]).join(' · '),
    ...F.flatMap(([k]) => [k === 'carbon' && r[k] != null ? (r[k] ? '예' : '아니오') : r[k], r.sources?.[k] ?? '', '', ''])]));
if (fs.existsSync(U('manual-fill.csv'))) fs.unlinkSync(U('manual-fill.csv'));

// 기여도: 지금 못 싣는 행이 어떤 파일들을 끝내야 실리는가
const blocked = rows.filter((r) => !loadable(r));
const need = (r) => {
  const s = new Set(tasks.get(id(r)) ?? []);
  const nums = ['weight', 'drop', 'stackHeight', 'price'].filter((k) => r[k] != null).length;
  if (nums >= 3) { s.delete('weight'); if (r.carbon == null) { s.delete('rest'); s.add('carbon'); } else s.delete('rest'); }  // 숫자 3개가 있으면 무게 · 드롭 · 스택은 막지 않는다(카본은 막는다)  // 숫자 3개가 이미 있으면 무게 · 드롭 · 스택 입력은 막는 이유가 아니다
  return [...s].sort().join('+') || '(막는 작업 없음)';
};
const by = blocked.reduce((m, r) => ((m[need(r)] = (m[need(r)] ?? 0) + 1), m), {});
const alone = (t) => blocked.filter((r) => need(r) === t).length;
console.log('이미지 있는 행', rows.length, '| 지금 적재 가능', rows.filter(loadable).length, '| 못 싣는 행', blocked.length);
console.log('파일별 행 수: decide', D.length, '줄(', new Set(D.map((d) => d[0] + '#' + d[1])).size, '행) · carbon', C.length, '· weight', W.length, `(빈 값 ${W.filter((r) => r.weight == null).length} + 기준 미상 ${W.filter((r) => r.weight != null).length}) · rest`, S.length);
console.log('decide 필드별', D.reduce((m, d) => ((m[d[3]] = (m[d[3]] ?? 0) + 1), m), {}));
console.log('그 파일만 끝내면 실리는 행: decide', alone('decide'), '· carbon', alone('carbon'), '· weight', alone('weight'), '· rest', alone('rest'));
console.log('필요한 작업 조합', by);
