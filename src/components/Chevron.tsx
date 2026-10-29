/** 화살표 버튼 안의 꺾쇠 — 글자(‹ ›)는 글꼴마다 기준선이 달라 네모 · 동그라미 안에서 가운데가 안 맞는다(2026-10-30). SVG 로 가운데에 */
function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg className="chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d={dir === "left" ? "M7.5 2 3.5 6l4 4" : "M4.5 2l4 4-4 4"} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default Chevron;
