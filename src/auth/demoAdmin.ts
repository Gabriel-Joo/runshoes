/**
 * 데모 관리자(V7)의 막힌 동작 — 서버가 403 {code:"demo_admin", message} 로 막는다(api/Viewer). 화면은 그 문구를 그대로 띄운다.
 * 리뷰 · 신발 · 찜 API 의 다른 오류 본문은 {}(json-server) — 이 함수는 데모 관리자 문구만 돌려준다
 */
export const DEMO_ADMIN_MESSAGE = "데모 관리자 계정은 할 수 없습니다";

/** 응답이 데모 관리자 403 이면 그 문구, 아니면 null. 본문을 읽으므로 응답당 한 번만 부른다 */
export async function demoBlocked(res: Response): Promise<string | null> {
  if (res.status !== 403) return null;
  const body = await res.clone().json().catch(() => null);
  return body?.code === "demo_admin" ? (body.message ?? DEMO_ADMIN_MESSAGE) : null;
}

/** 관리 폼의 오류 본문({code, message}) — 스펙 출처 형식 · 와이드 없음의 출처 · 숨긴 세대. 없으면 null */
export async function serverMessage(res: Response): Promise<string | null> {
  const body = await res.clone().json().catch(() => null);
  return typeof body?.message === "string" ? body.message : null;
}
