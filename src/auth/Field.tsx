import type { InputHTMLAttributes } from "react";

/** 입력 칸 하나 — 라벨 · 칸 · 안내 또는 오류(오류가 있으면 aria-invalid) */
interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  hint?: string | null;
  ok?: string | null;
}

function Field({ label, error, hint, ok, id, ...input }: FieldProps) {
  const msgId = `${id}-msg`;
  const msg = error ?? ok ?? hint;
  return (
    <label className="auth__field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} aria-invalid={Boolean(error)} aria-describedby={msg ? msgId : undefined} {...input} />
      {msg && (
        <small id={msgId} className={`auth__msg ${error ? "auth__msg--error" : ok ? "auth__msg--ok" : ""}`}>
          {msg}
        </small>
      )}
    </label>
  );
}

export default Field;
