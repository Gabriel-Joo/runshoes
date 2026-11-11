// 추천 계산의 기준 사본 — 서버(compare/RecommendPolicy)가 이것과 === 로 같아야 한다(check.mjs).
// 작업 3-1(2026-11-10 사용자) — 데이터 없음을 중립으로(docs/10_recommend.md):
//   - 판단할 수 없는 조건은 점수 · 만점에서 함께 뺀다 → 비율(score / max)로 순위
//   - 비율이 같으면 판단한 조건이 많은 쪽(max 큰 쪽) 먼저, 그다음 평점 · 리뷰 · 찜
//   - 하한선: 물어본 조건 중 못 본 것이 2개 이상이면 후보에서 뺀다
//   - 발볼: "보통"을 고르면 발볼을 보지 않는다(정보 줄만). "넓음"은 그대로, 발볼 · 와이드 모두 모르면 못 본 조건
//   - 못 본 조건은 notes 한 줄로 밝힌다(reasons 는 판단한 조건 · 정보 줄)
//   - 예산은 상한(작업 3-2): 20만원까지 · 30만원까지, "30만원 이상도 괜찮아요"(high)는 조건이 아니다
// 그 밖의 문구 · 배점 · 경계는 이관 전(history/recommend-browser-20261110.mjs)과 같다 — 고칠 것은 10_recommend.md "남은 한계".
// 가격의 toLocaleString() 은 ko-KR 로 고정해 돌린다(check.mjs · diff-reference.mjs).

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
  return `${data.join(" · ")} 정보가 없어 ${cond.join(" · ")}은 보지 않았어요${tail}`;
}

export function evaluate(shoe, answers) {
  let score = 0, max = 0, checked = 0;
  const reasons = [];
  const skipped = [];

  // 용도 — 빈 칸 없음
  max += 40; checked++;
  if (shoe.purpose === answers.purpose) {
    score += 40;
    reasons.push({ hit: true, text: `${shoe.purpose}에 맞는 신발이에요` });
  } else {
    reasons.push({ hit: false, text: `${shoe.purpose}용이지만 다른 조건이 잘 맞아요` });
  }

  // 발볼 — "넓음"만 조건이다
  if (answers.width === "넓음") {
    if (shoe.width === "넓음") {
      max += 30; checked++; score += 30;
      reasons.push({ hit: true, text: "발볼이 넓게 나온 모델이에요" });
    } else if (shoe.wideAvailable) {
      max += 30; checked++; score += 20;
      reasons.push({ hit: true, text: shoe.wideScope === "overseas" ? "와이드 모델이 해외에만 있어요" : "와이드 모델이 따로 있어요" });
    } else if (shoe.width !== null) {
      max += 30; checked++;
      const wide = shoe.wideAvailable === false ? "와이드 모델은 없어요" : "와이드 정보는 없어요";
      reasons.push({ hit: false, text: `발볼은 ${shoe.width}이고 ${wide}` });
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
          : `발볼은 ${shoe.width}로 나왔어요`,
    });
  }

  // 안정성 — 빈 칸 없음
  if (answers.stability === "안정화" || answers.stability === "중립화" || answers.stability === "중립화-outer") {
    max += 30; checked++;
    const want = answers.stability === "안정화" ? "안정화" : "중립화";
    if (shoe.stability === want) {
      score += 30;
      reasons.push({ hit: true, text: want === "안정화" ? "발이 안쪽으로 무너지는 걸 잡아줘요" : "교정 장치가 없는 중립화예요" });
    } else {
      reasons.push({ hit: false, text: `${shoe.stability}지만 다른 조건이 잘 맞아요` });
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
        score += 20;
        reasons.push({ hit: true, text: `쿠션 두께가 원하시는 정도예요 (${h}mm)` });
      } else {
        reasons.push({ hit: false, text: h >= 40 ? `쿠션이 원하시는 것보다 두꺼워요 (${h}mm)` : `쿠션이 원하시는 것보다 얇아요 (${h}mm)` });
      }
    } else {
      skipped.push("cushion");
    }
  } else if (shoe.stackHeight !== null) {
    reasons.push({ hit: false, text: `쿠션 두께는 ${shoe.stackHeight}mm예요` });
  }

  // 예산 — 상한(2026-11-11 사용자, 작업 3-2): low 20만원까지 · mid 30만원까지. "high"(전 "30만원 이상도 괜찮아요")는 화면에서 뺐고
  // "상관없어요"와 같게 조건으로 보지 않는다. 예산은 넘으면 안 되는 선이지 원하는 가격대가 아니다 — 상한 안의 신발은 모두 같게 본다
  const cap = answers.price === "low" ? 200000 : answers.price === "mid" ? 300000 : null;
  if (cap !== null) {
    if (shoe.price !== null) {
      max += 20; checked++;
      const p = shoe.price;
      if (p <= cap) {
        score += 20;
        reasons.push({ hit: true, text: `예산에 맞아요 (${p.toLocaleString()}원)` });
      } else {
        reasons.push({ hit: false, text: "예산보다 높지만 조건이 잘 맞아 함께 담았어요" });
      }
    } else {
      skipped.push("price");
    }
  } else if (shoe.price !== null) {
    reasons.push({ hit: false, text: `${shoe.price.toLocaleString()}원이에요` });
  }

  const notes = skipped.length ? [skippedNote(skipped, shoe)] : [];
  return { score, max, checked, skipped, reasons, notes };
}

export function recommend(shoes, answers) {
  return shoes
    .map((shoe) => ({ shoe, ...evaluate(shoe, answers) }))
    .filter((r) => r.skipped.length <= 1)
    .sort((a, b) => b.score / b.max - a.score / a.max || b.max - a.max || tie(b.shoe) - tie(a.shoe))
    .slice(0, 3)
    .map((r) => ({ id: r.shoe.id, score: r.score, max: r.max, checked: r.checked, reasons: r.reasons, notes: r.notes }));
}
