import "./ScrollTop.css";

function ScrollTop() {
  const toTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button className="scrolltop" onClick={toTop} aria-label="맨 위로">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 13V3M8 3L3 8M8 3L13 8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export default ScrollTop;