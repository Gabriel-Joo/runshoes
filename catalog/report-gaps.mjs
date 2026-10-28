// shoes.jsonl → 사람이 채울 결손 목록 CSV 두 개(2026-10-21)
//   manual-fill.csv  — 숫자를 넣으면 풀리는 행: (가) 이미지는 있는데 숫자가 모자라 못 싣는 행 (나) 실을 수 있지만 드롭 · 스택이 빈 행
//   review-list.csv  — 입력이 아니라 판단이 필요한 행(출처 충돌 · 미검증 출처 · 이상치 · 출처 URL 없음)
//   이미지(StockX)가 없는 행은 숫자를 넣어도 실리지 않으므로 두 목록에서 뺀다(수만 센다)
import fs from 'node:fs';
const R = fs.readFileSync(new URL('./shoes.jsonl', import.meta.url), 'utf8').trim().split('\n').map(JSON.parse);
const en = new Map(fs.readFileSync(new URL('./candidates.csv', import.meta.url), 'utf8').replace(/\r/g, '').trim().split('\n').slice(1).map((l) => l.split(',')).map((c) => [`${c[0]}#${c[1]}`, c[5]]));
const esc = (v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
const F = [['official_weight_g', '무게 g(US M9)'], ['official_drop_mm', '드롭 mm'], ['official_heel_mm', '스택 뒤꿈치 mm'], ['midsole', '미드솔'], ['carbon', '카본 예/아니오']];
const loadable = (r) => r.status === 'ok' || r.status === 'partial';
const dataOnly = (r) => r._review.every((x) => /^min_fields/.test(x)) || r.status === 'failed';
const show = (r, k) => (k === 'carbon' && r[k] != null ? (r[k] ? '예' : '아니오') : r[k]);

// 2026-10-21: 하나의 파일로 — 이미지가 있는 행 중 ok 가 아니거나 빈 필드가 있는 행 전부. 입력할 것과 판단할 것을 같은 줄에
const base = ['line_key', 'generation', '현행/직전', '브랜드', '모델', '영문', 'status'];
const rows = R.filter((r) => r.images.length && (!loadable(r) || F.some(([k]) => r[k] == null) || r.official_weight_size == null));
const noImg = R.filter((r) => !r.images.length);
const reason = (x) => x.startsWith('min_fields') ? null : x.startsWith('conflict:unverified_source') ? `미검증 출처(${x.split(':')[2]})` : x.startsWith('conflict:decision_pending') ? `판단 대기: ${x.split(':').slice(2).join(':')}` : x.startsWith('conflict:') ? `출처 충돌 ${x.slice(9)}` : x.startsWith('no_url') ? `출처 URL 없음(${x.split(':')[1]})` : x.startsWith('range') ? `범위 밖 ${x.slice(6)}` : x;
const head = [...base, '할 일', '빈 필드', '판단할 것', '무게 기준 미상', ...F.flatMap(([k, l]) => [`현재 ${l}`, `현재 출처 ${l}`, `입력 ${l}`, `입력 출처 URL ${l}`])];
const out = [head.map(esc).join(',')];
for (const r of rows) {
  const miss = F.filter(([k]) => r[k] == null).map(([, l]) => l.split(' ')[0]).join(' · ');
  const judge = r._review.map(reason).filter(Boolean).join(' | ');
  const todo = !loadable(r) && !judge ? '입력(숫자가 모자라 못 실림)' : !loadable(r) ? '판단 + 입력' : judge ? '판단' : '입력(실리지만 빈 칸)';
  out.push([r.line_key, r.generation, r.is_current ? '현행' : '직전', r.brand, r.model, en.get(`${r.line_key}#${r.generation}`), r.status, todo, miss, judge, r.weight != null && r.official_weight_size == null ? '예' : '',
    ...F.flatMap(([k]) => [show(r, k), r.sources?.[k] ?? '', '', ''])].map(esc).join(','));
}
fs.writeFileSync(new URL('./manual-fill.csv', import.meta.url), '\ufeff' + out.join('\n') + '\n');
if (fs.existsSync(new URL('./review-list.csv', import.meta.url))) fs.unlinkSync(new URL('./review-list.csv', import.meta.url));
const fill = rows, judgeRows = rows.filter((r) => r._review.some((x) => reason(x)));
const by = (a, f) => a.reduce((m, x) => ((m[f(x)] = (m[f(x)] ?? 0) + 1), m), {});
console.log('적재 가능', R.filter(loadable).length, '행 /', new Set(R.filter(loadable).map((r) => r.line_key)).size, '라인 | 이미지 있는 행', R.filter((r) => r.images.length).length);
console.log('manual-fill', rows.length, '행 /', new Set(rows.map((r) => r.line_key)).size, '라인');
const todoOf = (r) => { const j = r._review.map(reason).filter(Boolean).length; return !loadable(r) && !j ? '입력(못 실림)' : !loadable(r) ? '판단+입력' : j ? '판단' : '입력(실림·빈 칸)'; };
console.log('  할 일', by(rows, todoOf));
console.log('  못 실리는 행 중 빈 필드 조합', by(rows.filter((r) => !loadable(r)), (r) => F.filter(([k]) => r[k] == null).map(([, l]) => l.split(' ')[0]).join('·') || '(빈 칸 없음 — 판단만)'));
console.log('  판단 사유', by(rows.flatMap((r) => [...new Set(r._review.map(reason).filter(Boolean).map((x) => x.split(/[ (:]/)[0]))]), (x) => x));
console.log('이미지 없어 제외', noImg.length);
