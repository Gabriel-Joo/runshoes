// 얼린 사본 — 이관 전(2026-11-10, 앱 27bf4a1) src/pages/Recommend.tsx 의 evaluate 와 정렬을 글자 그대로 옮긴 것.
// 바꾼 것은 타입 표기 둘((shoe: Shoe) · Reason[])과, 컴포넌트 상태(answers · shoes)를 인자로 받게 감싼 것뿐. 고치지 않는다.
// 가격의 toLocaleString() 은 브라우저 언어를 따른다 — 대조는 ko-KR 로 돌린다(check.mjs 가 Number.prototype.toLocaleString 을 고정).

export function recommend(shoes, answers) {
  const evaluate = (shoe) => {
    let score = 0;
    const reasons = [];

    // 용도
    if (shoe.purpose === answers.purpose) {
      score += 40;
      reasons.push({ hit: true, text: `${shoe.purpose}에 맞는 신발이에요` });
    } else {
      reasons.push({
        hit: false,
        text: `${shoe.purpose}용이지만 다른 조건이 잘 맞아요`,
      });
    }

    // 발볼
    if (answers.width === "넓음") {
      if (shoe.width === "넓음") {
        score += 30;
        reasons.push({ hit: true, text: "발볼이 넓게 나온 모델이에요" });
      } else if (shoe.wideAvailable) {
        score += 20;
        reasons.push({ hit: true, text: shoe.wideScope === "overseas" ? "와이드 모델이 해외에만 있어요" : "와이드 모델이 따로 있어요" });
      } else {
        // 모르는 값을 "보통" · "없어요"로 말하지 않는다(null = 정보 없음)
        const w = shoe.width === null ? "발볼 정보가 없고" : `발볼은 ${shoe.width}이고`;
        const wide = shoe.wideAvailable === false ? "와이드 모델은 없어요" : "와이드 정보는 없어요";
        reasons.push({ hit: false, text: `${w} ${wide}` });
      }
    } else if (answers.width === "보통") {
      if (shoe.width === "보통") {
        score += 20;
        reasons.push({ hit: true, text: "발볼이 보통으로 나왔어요" });
      } else {
        reasons.push({ hit: false, text: shoe.width === null ? "발볼 정보가 없어요" : `발볼은 ${shoe.width}로 나왔어요` });
      }
    } else {
      reasons.push({
        hit: false,
        text: shoe.width === null
          ? shoe.wideAvailable ? "발볼 정보는 없지만 와이드 모델이 있어요" : "발볼 정보가 없어요"
          : shoe.wideAvailable
            ? `발볼은 ${shoe.width}, 와이드 모델도 있어요`
            : `발볼은 ${shoe.width}로 나왔어요`,
      });
    }

    // 안정성
    if (
      answers.stability === "안정화" ||
      answers.stability === "중립화" ||
      answers.stability === "중립화-outer"
    ) {
      const want = answers.stability === "안정화" ? "안정화" : "중립화";
      if (shoe.stability === want) {
        score += 30;
        reasons.push({
          hit: true,
          text:
            want === "안정화"
              ? "발이 안쪽으로 무너지는 걸 잡아줘요"
              : "교정 장치가 없는 중립화예요",
        });
      } else {
        reasons.push({
          hit: false,
          text: `${shoe.stability}지만 다른 조건이 잘 맞아요`,
        });
      }
    } else {
      reasons.push({
        hit: false,
        text:
          shoe.stability === "안정화"
            ? "안정화예요 — 발이 안쪽으로 무너지는 걸 잡아줍니다"
            : "교정 장치가 없는 중립화예요",
      });
    }

    // 쿠션
    if (answers.cushion !== "unknown" && shoe.stackHeight !== null) {
      const h = shoe.stackHeight;
      const fit =
        (answers.cushion === "high" && h >= 40) ||
        (answers.cushion === "mid" && h >= 35 && h < 40) ||
        (answers.cushion === "low" && h < 35);

      if (fit) {
        score += 20;
        reasons.push({
          hit: true,
          text: `쿠션 두께가 원하시는 정도예요 (${h}mm)`,
        });
      } else {
        reasons.push({
          hit: false,
          text:
            h >= 40
              ? `쿠션이 원하시는 것보다 두꺼워요 (${h}mm)`
              : `쿠션이 원하시는 것보다 얇아요 (${h}mm)`,
        });
      }
    } else if (shoe.stackHeight !== null) {
      reasons.push({
        hit: false,
        text: `쿠션 두께는 ${shoe.stackHeight}mm예요`,
      });
    }

    // 예산
    if (answers.price !== "unknown" && shoe.price !== null) {
      const p = shoe.price;
      const fit =
        (answers.price === "low" && p < 200000) ||
        (answers.price === "mid" && p >= 200000 && p < 300000) ||
        (answers.price === "high" && p >= 300000);

      if (fit) {
        score += 20;
        reasons.push({
          hit: true,
          text: `예산에 맞아요 (${p.toLocaleString()}원)`,
        });
      } else if (
        (answers.price === "low" && p >= 200000) ||
        (answers.price === "mid" && p >= 300000)
      ) {
        reasons.push({
          hit: false,
          text: "예산보다 높지만 조건이 잘 맞아 함께 담았어요",
        });
      } else {
        reasons.push({
          hit: false,
          text: `생각하신 것보다 저렴해요 (${p.toLocaleString()}원)`,
        });
      }
    } else if (shoe.price !== null) {
      reasons.push({
        hit: false,
        text: `${shoe.price.toLocaleString()}원이에요`,
      });
    }
    return { score, reasons };
  };

  // 점수가 같으면 평점/리뷰/좋아요가 높은 쪽이 위로
  const results = [...shoes]
    .map((shoe) => ({ shoe, ...evaluate(shoe) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const sa =
        a.shoe.rating * 20 * (a.shoe.reviewCount / (a.shoe.reviewCount + 3)) +
        a.shoe.likeCount * 0.5;
      const sb =
        b.shoe.rating * 20 * (b.shoe.reviewCount / (b.shoe.reviewCount + 3)) +
        b.shoe.likeCount * 0.5;
      return sb - sa;
    })
    .slice(0, 3);
  return results.map((r) => ({ id: r.shoe.id, score: r.score, reasons: r.reasons }));
}
