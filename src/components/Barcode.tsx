/**
 * 작은 바코드(SVG, Code 39) — 찜 카드의 행택 느낌(2026-10-30 사용자). 값은 영문 대문자 · 숫자 · '-' 만(한글 모델명은 넣지 않는다 — id 로 만든다).
 * Code 39: 글자마다 막대 5 · 사이 4, 그중 3개가 넓다(n = 좁음, w = 넓음). 앞뒤에 시작 · 끝 글자 '*'
 */
const CODE39: Record<string, string> = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn", "4": "nnnwwnnnw",
  "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw", "8": "wnnwnnwnn", "9": "nnwwnnwnn",
  A: "wnnnnwnnw", B: "nnwnnwnnw", C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn", F: "nnwnwwnnn",
  G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn", K: "wnnnnnnww", L: "nnwnnnnww",
  M: "wnwnnnnwn", N: "nnnnwnnww", O: "wnnnwnnwn", P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn",
  S: "nnwnnnwwn", T: "nnnnwnwwn", U: "wwnnnnnnw", V: "nwwnnnnnw", W: "wwwnnnnnn", X: "nwnnwnnnw",
  Y: "wwnnwnnnn", Z: "nwwnwnnnn", "-": "nwnnnnwnw", "*": "nwnnwnwnn",
};

const NARROW = 1;
const WIDE = 2.5;

/** 막대(x, 폭) 목록과 전체 폭 — 모르는 글자는 뺀다 */
function code39Bars(value: string) {
  const chars = `*${value.toUpperCase().replace(/[^0-9A-Z-]/g, "")}*`;
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  for (const ch of chars) {
    const p = CODE39[ch];
    for (let i = 0; i < 9; i++) {
      const w = p[i] === "w" ? WIDE : NARROW;
      if (i % 2 === 0) bars.push({ x, w });   // 짝수 = 막대, 홀수 = 사이
      x += w;
    }
    x += NARROW;                              // 글자 사이
  }
  return { bars, width: x - NARROW };
}

function Barcode({ value, height = 22 }: { value: string; height?: number }) {
  const { bars, width } = code39Bars(value);
  return (
    <svg className="barcode" viewBox={`0 0 ${width} ${height}`} height={height} preserveAspectRatio="none" role="img" aria-label={`바코드 ${value}`}>
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={height} />
      ))}
    </svg>
  );
}

export default Barcode;
