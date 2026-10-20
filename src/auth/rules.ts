// 가입 · 회원 정보의 입력 규칙과 메시지 — 서버 backend/.../auth/AuthRules.java 와 같다(정답은 서버). 비어 있으면 통과(null)
const RESERVED = ["관리자", "운영자", "admin", "runshoes"];

export function emailError(v: string) {
  const e = v.trim();
  if (!e) return "이메일을 입력해 주세요.";
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "이메일 형식이 아닙니다.";
  return null;
}

export function passwordError(v: string) {
  if (v.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  if (v.length > 64) return "비밀번호는 64자까지 쓸 수 있어요.";
  if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) return "영문과 숫자를 함께 써 주세요.";
  return null;
}

export function nicknameError(v: string) {
  const n = v.trim();
  const len = [...n].length;
  if (len < 2 || len > 12) return "닉네임은 2~12자로 써 주세요.";
  if (!/^[가-힣A-Za-z0-9]+$/.test(n)) return "한글, 영문, 숫자만 쓸 수 있어요.";
  if (RESERVED.includes(n.toLowerCase())) return "쓸 수 없는 닉네임입니다.";
  return null;
}
