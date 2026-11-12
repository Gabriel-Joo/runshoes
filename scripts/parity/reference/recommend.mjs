// 추천 계산의 기준 사본 — 서버(compare/RecommendPolicy)가 이것과 === 로 같아야 한다(check.mjs).
// 작업 3-1(2026-11-10 사용자) — 데이터 없음을 중립으로(docs/10_recommend.md):
//   - 판단할 수 없는 조건은 점수 · 만점에서 함께 뺀다 → 비율(score / max)로 순위
//   - 비율이 같으면 판단한 조건이 많은 쪽(max 큰 쪽) 먼저, 그다음 평점 · 리뷰 · 찜
//   - 하한선: 물어본 조건 중 못 본 것이 2개 이상이면 후보에서 뺀다
//   - 발볼: "보통"을 고르면 발볼을 보지 않는다(정보 줄만). "넓음"은 그대로, 발볼 · 와이드 모두 모르면 못 본 조건
//   - 못 본 조건은 notes 한 줄로 밝힌다(reasons 는 판단한 조건 · 정보 줄)
//   - 예산은 상한(작업 3-2): 20만원까지 · 30만원까지, "30만원 이상도 괜찮아요"(high)는 조건이 아니다
// 작업 3-3(2026-11-11 사용자) — 문구만 고쳤다(점수 · 만점 · 순위는 3-2 와 같다, history/recommend-budgetcap-20261111.mjs):
//   - 가격은 "발매가"로 부른다, 예산을 넘으면 "지금 파는 값은 더 낮을 수 있어요"
//   - 쿠션이 안 맞으면 원한 범위와 견줘 두께 방향을 말한다
//   - 용도 · 안정성이 안 맞으면 실제로 맞은 조건의 이름을 댄다(안 맞은 첫 줄에만), 맞은 것이 없으면 사실만
//   - 값 뒤 조사는 받침을 보고 고른다(으로/로 · 이고/고 · 이지만/지만 · 이/가 · 은/는)
//   - 옛 세대는 같은 라인의 현행 신발이 사이트에 있을 때만 notes 에 "지금은 다음 세대(…)가 나와 있어요"
// 작업 3-4(2026-11-11 사용자) — 예산 배점 20 → 10. 다른 네 조건은 신발의 고정된 속성이고 예산만 발매가 기준이라 실제 살 값과 다를 수 있다(10_recommend.md 2-3b).
// 그 밖의 배점 · 경계는 이관 전(history/recommend-browser-20261110.mjs)과 같다.
// 작업 5-1(2026-11-12 사용자) — 예산을 금액(budget, 원)으로도 받는다. 경계만 그 금액, price 칸의 결과는 그대로.
// 가격의 toLocaleString() 은 ko-KR 로 고정해 돌린다(check.mjs · diff-reference.mjs).

/** 끝 글자에 받침이 있나 — 숫자 · 영문은 읽는 소리로 어림(src/utils/compare.ts hasJong 과 같다) */
function jong(word) {
  const code = word.trim().slice(-1).charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28;   // 0 = 받침 없음, 8 = ㄹ
  const c = word.trim().slice(-1);
  if (/[0-9]/.test(c)) return "178".includes(c) ? 8 : "036".includes(c) ? 1 : 0;   // 영 일 삼 육 칠 팔 — 2 4 5 9(이 사 오 구)는 받침 없음
  return /[lmnr]/i.test(c) ? (/[lr]/i.test(c) ? 8 : 1) : 0;
}
/** 받침 있으면 a, 없으면 b — "으로/로"는 ㄹ 받침도 b(rieul) */
const josa = (word, a, b, rieul = false) => { const j = jong(word); return word + (j !== 0 && !(rieul && j === 8) ? a : b); };
const COND = { purpose: "용도", width: "발볼", stability: "안정성", cushion: "쿠션", price: "예산" };

const tie = (s) => s.rating * 20 * (s.reviewCount / (s.reviewCount + 3)) + s.likeCount * 0.5;

/** 못 본 조건 → notes 한 줄(하한선 때문에 후보에는 많아야 하나) */
function skippedNote(skipped, shoe) {
  const data = [], cond = [];
  for (const k of skipped) {
    if (k === "width") { data.push(shoe.wideAvailable === false ? "발볼" : "발볼 · 와이드"); cond.push("발볼"); }
    if (k === "cushion") { data.push("스택"); cond.push("쿠션"); }
    if (k === "price") { data.push("가격"); cond.push("예산"); }
  }
  const tail = skipped.includes("width") && shoe.wideAvailable === false ? " — 와이드 모델은 없어요" : "";
  return `${data.join(" · ")} 정보가 없어 ${josa(cond.join(" · "), "은", "는")} 보지 않았어요${tail}`;
}

/** 라인마다 현행 신발 — 사이트에 보이는 신발(/api/shoes, 숨긴 신발은 없다)에서만 */
export function currentByLine(shoes) {
  const m = new Map();
  for (const s of shoes) if (s.isCurrent === true && s.lineKey) m.set(s.lineKey, s);
  return m;
}

/** current — currentByLine(전체). 없으면 세대 줄을 내지 않는다 */
export function evaluate(shoe, answers, current = new Map()) {
  let score = 0, max = 0, checked = 0;
  const reasons = [];
  const skipped = [];
  const hits = [], misses = [];   // 판단한 조건(물어봤고 데이터가 있는 것)의 맞음 · 안 맞음 — 꼬리 문구가 쓴다

  // 용도 — 빈 칸 없음
  max += 40; checked++;
  if (shoe.purpose === answers.purpose) {
    score += 40; hits.push("purpose");
    reasons.push({ hit: true, text: `${shoe.purpose}에 맞는 신발이에요` });
  } else {
    misses.push("purpose");
    reasons.push({ hit: false, text: null, tail: "purpose" });   // 아래에서 채운다
  }

  // 발볼 — "넓음"만 조건이다
  if (answers.width === "넓음") {
    if (shoe.width === "넓음") {
      max += 30; checked++; score += 30; hits.push("width");
      reasons.push({ hit: true, text: "발볼이 넓게 나온 모델이에요" });
    } else if (shoe.wideAvailable) {
      max += 30; checked++; score += 20; hits.push("width");
      reasons.push({ hit: true, text: shoe.wideScope === "overseas" ? "와이드 모델이 해외에만 있어요" : "와이드 모델이 따로 있어요" });
    } else if (shoe.width !== null) {
      max += 30; checked++; misses.push("width");
      const wide = shoe.wideAvailable === false ? "와이드 모델은 없어요" : "와이드 정보는 없어요";
      reasons.push({ hit: false, text: `발볼은 ${josa(shoe.width, "이고", "고")} ${wide}` });
    } else {
      skipped.push("width");     // 발볼도 모르고 와이드도 없거나 모른다 — notes
    }
  } else {
    // "보통" · "잘 모르겠어요" — 발볼을 보지 않는다(보통은 리뷰가 잘 말하지 않아 이 칸으로 가릴 수 없다, 10_recommend.md)
    reasons.push({
      hit: false,
      text: shoe.width === null
        ? shoe.wideAvailable ? "발볼 정보는 없지만 와이드 모델이 있어요" : "발볼 정보가 없어요"
        : shoe.wideAvailable
          ? `발볼은 ${shoe.width}, 와이드 모델도 있어요`
          : `발볼은 ${josa(shoe.width, "으로", "로", true)} 나왔어요`,
    });
  }

  // 안정성 — 빈 칸 없음
  if (answers.stability === "안정화" || answers.stability === "중립화" || answers.stability === "중립화-outer") {
    max += 30; checked++;
    const want = answers.stability === "안정화" ? "안정화" : "중립화";
    if (shoe.stability === want) {
      score += 30; hits.push("stability");
      reasons.push({ hit: true, text: want === "안정화" ? "발이 안쪽으로 무너지는 걸 잡아줘요" : "교정 장치가 없는 중립화예요" });
    } else {
      misses.push("stability");
      reasons.push({ hit: false, text: null, tail: "stability" });
    }
  } else {
    reasons.push({ hit: false, text: shoe.stability === "안정화" ? "안정화예요 — 발이 안쪽으로 무너지는 걸 잡아줍니다" : "교정 장치가 없는 중립화예요" });
  }

  // 쿠션 — 경계 40 · 35mm
  if (answers.cushion !== "unknown") {
    if (shoe.stackHeight !== null) {
      max += 20; checked++;
      const h = shoe.stackHeight;
      const fit = (answers.cushion === "high" && h >= 40) || (answers.cushion === "mid" && h >= 35 && h < 40) || (answers.cushion === "low" && h < 35);
      if (fit) {
        score += 20; hits.push("cushion");
        reasons.push({ hit: true, text: `쿠션 두께가 원하시는 정도예요 (${h}mm)` });
      } else {
        // 원한 범위와 견줘 방향을 정한다 — low(35 미만)를 원했으면 늘 두껍고, high(40 이상)면 늘 얇다
        misses.push("cushion");
        const thick = answers.cushion === "low" || (answers.cushion === "mid" && h >= 40);
        reasons.push({ hit: false, text: thick ? `쿠션이 원하시는 것보다 두꺼워요 (${h}mm)` : `쿠션이 원하시는 것보다 얇아요 (${h}mm)` });
      }
    } else {
      skipped.push("cushion");
    }
  } else if (shoe.stackHeight !== null) {
    reasons.push({ hit: false, text: `쿠션 두께는 ${shoe.stackHeight}mm예요` });
  }

  // 예산 — 상한(2026-11-11 사용자, 작업 3-2): low 20만원까지 · mid 30만원까지. "high"(전 "30만원 이상도 괜찮아요")는 화면에서 뺐고
  // "상관없어요"와 같게 조건으로 보지 않는다. 예산은 넘으면 안 되는 선이지 원하는 가격대가 아니다 — 상한 안의 신발은 모두 같게 본다
  // 작업 5-1(2026-11-12 사용자) — budget(원)이 오면 그 금액이 상한(price 대신). 배점 · 문장은 같다 — 챗봇이 "15만원"을 그대로 보낸다
  const cap = answers.budget != null ? Number(answers.budget)
    : answers.price === "low" ? 200000 : answers.price === "mid" ? 300000 : null;
  if (cap !== null) {
    if (shoe.price !== null) {
      max += 10; checked++;
      const p = shoe.price;
      // 가격 칸은 발매가(정가)만 담는다(01a 1-5) — 상세 모달 · 비교하기처럼 "발매가"로 부른다
      if (p <= cap) {
        score += 10; hits.push("price");
        reasons.push({ hit: true, text: `예산에 맞아요 (발매가 ${p.toLocaleString()}원)` });
      } else {
        misses.push("price");
        reasons.push({ hit: false, text: `발매가가 예산보다 높아요 (${p.toLocaleString()}원) — 지금 파는 값은 더 낮을 수 있어요` });
      }
    } else {
      skipped.push("price");
    }
  } else if (shoe.price !== null) {
    reasons.push({ hit: false, text: `발매가 ${shoe.price.toLocaleString()}원이에요` });
  }

  // 용도 · 안정성이 안 맞은 줄 — 첫 줄에만 실제로 맞은 조건을 댄다(못 본 조건 · 묻지 않은 조건은 세지 않는다)
  let told = false;
  for (const r of reasons) {
    if (r.tail === undefined) continue;
    const head = r.tail === "purpose" ? `${shoe.purpose}용` : shoe.stability;
    const others = hits.length + misses.length - 1;   // 이 줄을 뺀 판단한 조건 수
    if (!told && hits.length > 0) {
      const what = hits.length === others && others >= 2 ? "다른 조건은 모두 맞아요" : `${josa(hits.map((k) => COND[k]).join(" · "), "이", "가")} 맞아요`;
      r.text = `${josa(head, "이지만", "지만")} ${what}`;
      told = true;
    } else {
      r.text = `${head} 신발이에요`;
    }
    delete r.tail;
  }

  const notes = skipped.length ? [skippedNote(skipped, shoe)] : [];
  // 옛 세대 — 점수에 넣지 않는다(10_recommend.md 2-4). 같은 라인의 현행이 사이트에 있을 때만, 그 이름으로
  const now = shoe.isCurrent === false ? current.get(shoe.lineKey) : undefined;
  if (now && now.id !== shoe.id) notes.push(`지금은 다음 세대(${now.model})가 나와 있어요`);
  return { score, max, checked, skipped, reasons, notes };
}

export function recommend(shoes, answers) {
  const current = currentByLine(shoes);
  return shoes
    .map((shoe) => ({ shoe, ...evaluate(shoe, answers, current) }))
    .filter((r) => r.skipped.length <= 1)
    .sort((a, b) => b.score / b.max - a.score / a.max || b.max - a.max || tie(b.shoe) - tie(a.shoe))
    .slice(0, 3)
    .map((r) => ({ id: r.shoe.id, score: r.score, max: r.max, checked: r.checked, reasons: r.reasons, notes: r.notes }));
}
