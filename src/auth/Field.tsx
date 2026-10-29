import { useState, type InputHTMLAttributes } from "react";

/** 입력 칸 하나 — 라벨 · 칸 · 안내 또는 오류(오류가 있으면 aria-invalid) */
interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  hint?: string | null;
  ok?: string | null;
}

/** 비밀번호 보기 단추의 눈 — 가렸을 때는 사선이 그어진 눈, 보일 때는 눈(2026-10-30 사용자) */
function Eye({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <path d="M4 20 20 4" />}
    </svg>
  );
}

function Field({ label, error, hint, ok, id, type, ...input }: FieldProps) {
  const msgId = `${id}-msg`;
  const msg = error ?? ok ?? hint;
  const password = type === "password";
  const [shown, setShown] = useState(false);   // 칸마다 따로(새 비밀번호 · 확인이 각각)
  const field = (
    <input id={id} type={password && shown ? "text" : type} aria-invalid={Boolean(error)} aria-describedby={msg ? msgId : undefined} {...input} />
  );
  return (
    <label className="auth__field" htmlFor={id}>
      <span>{label}</span>
      {password ? (
        <span className="auth__pw">
          {field}
          <button type="button" className="auth__pwtoggle" onClick={() => setShown((v) => !v)} aria-label={shown ? "비밀번호 가리기" : "비밀번호 보기"} aria-pressed={shown} aria-controls={id}>
            <Eye open={shown} />
          </button>
        </span>
      ) : (
        field
      )}
      {msg && (
        <small id={msgId} className={`auth__msg ${error ? "auth__msg--error" : ok ? "auth__msg--ok" : ""}`}>
          {msg}
        </small>
      )}
    </label>
  );
}

export default Field;
