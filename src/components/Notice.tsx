import { useEffect } from "react";
import { useAuth } from "../auth/useAuth";
import "./Notice.css";

/** 화면 위쪽 짧은 안내 — 3초 뒤 사라진다. 화면을 옮겨도 남는다(가입 뒤 "환영해요" 처럼) */
function Notice() {
  const { notice, setNotice } = useAuth();

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(t);
  }, [notice, setNotice]);

  return (
    <div className="notice" role="status" aria-live="polite">
      {notice && <p className="notice__text">{notice}</p>}
    </div>
  );
}

export default Notice;
