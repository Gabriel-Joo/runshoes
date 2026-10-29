import { API } from "../api";

/**
 * 로그인 상태 — access token 은 이 모듈의 변수(메모리)에만 둔다. localStorage 에 두지 않는다(docs/AUTH_DESIGN.md 1절).
 * refresh token 은 HttpOnly 쿠키(Path=/api/auth)라 JS 가 읽지 못한다 — 새로고침하면 refresh() 로 access token 을 다시 받는다.
 */
export interface User {
  id: number;
  email: string;
  nickname: string;
  role: "USER" | "ADMIN" | "DEMO_ADMIN";   // DEMO_ADMIN = 데모 관리자(관리 화면을 보기만)
}

/**
 * 화면에 보이는 이름 — 데모 관리자는 DB 닉네임("데모관리자") 대신 "관리자 체험 계정"(2026-10-30 사용자 — 체험 카드와 같게, "데모"가 가짜처럼 보인다).
 * DB 값은 그대로. 다른 계정은 닉네임 그대로
 */
export const DEMO_ADMIN_NAME = "관리자 체험 계정";
export const displayName = (u: Pick<User, "nickname" | "role">) => (u.role === "DEMO_ADMIN" ? DEMO_ADMIN_NAME : u.nickname);

/** 로그인 화면의 체험 카드(GET /api/auth/demo-accounts) — 시드 계정 전부(id 순) + 데모 관리자 */
export interface DemoAccount {
  id: number;
  nickname: string;
  role: "USER" | "DEMO_ADMIN";
  reviewCount: number;
  likeCount: number;
}

interface SessionBody {
  accessToken: string;
  user: User;
}

/** 인증 API 의 오류 본문 — message 는 화면에 그대로 보여 줄 문장 */
export class AuthError extends Error {
  code: string;
  field?: string;
  status: number;
  /** 429 — 몇 초 뒤 다시(서버의 retryAfter) */
  retryAfter?: number;
  constructor(status: number, code: string, message: string, field?: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
    this.retryAfter = retryAfter;
  }
}

let token: string | null = null;
let user: User | null = null;
const listeners = new Set<(u: User | null) => void>();

export const currentUser = () => user;

export function onUserChange(fn: (u: User | null) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function set(s: SessionBody | null) {
  token = s?.accessToken ?? null;
  user = s?.user ?? null;
  listeners.forEach((fn) => fn(user));
}

export function setUser(u: User) {
  user = u;
  listeners.forEach((fn) => fn(user));
}

/** 인증 API 호출 — 실패하면 AuthError(서버 메시지) */
async function authCall(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { credentials: "same-origin", ...init });
  } catch {
    throw new AuthError(0, "NETWORK", "서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const e = body?.error;
    throw new AuthError(res.status, e?.code ?? "ERROR", e?.message ?? "잠시 뒤 다시 해 주세요.", e?.field, e?.retryAfter);
  }
  return res;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function login(email: string, password: string) {
  set(await (await authCall("/auth/login", json({ email, password }))).json());
  return user!;
}

/** 체험 로그인 — 비밀번호 없이, 서버가 체험 풀 안의 id 만 받는다 */
export async function demoLogin(id: number) {
  set(await (await authCall("/auth/demo", json({ id }))).json());
  return user!;
}

/** 체험 카드 — 서버가 꺼 두었으면(404) 빈 목록 */
export async function demoAccounts(): Promise<DemoAccount[]> {
  const res = await fetch(`${API}/auth/demo-accounts`).catch(() => null);
  return res?.ok ? res.json() : [];
}

/**
 * 회원 탈퇴 — 실패하면 AuthError(서버 문구 — 체험 · 관리자 계정은 403). 성공한 뒤 부른 쪽이 홈으로 옮기고 logout() 한다
 * (먼저 로그아웃하면 마이페이지의 가드가 로그인 화면으로 보낸다 — Header 의 로그아웃과 같은 순서)
 */
export async function withdraw() {
  const res = await apiFetch("/me", { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new AuthError(res.status, body?.error?.code ?? "ERROR", body?.error?.message ?? "탈퇴하지 못했어요. 잠시 뒤 다시 해 주세요.");
  }
}

export async function signup(email: string, password: string, nickname: string) {
  set(await (await authCall("/auth/signup", json({ email, password, nickname }))).json());
  return user!;
}

export async function logout() {
  try {
    await authCall("/auth/logout", { method: "POST" });
  } finally {
    set(null);
  }
}

/**
 * refresh — 동시에 여러 번 불려도(첫 화면의 요청 여럿이 함께 401) 한 번만 보낸다.
 * 탭 둘이 동시에 보내는 것은 서버가 10초 안의 재사용으로 받아 준다(AuthService).
 */
let refreshing: Promise<boolean> | null = null;
export function refresh(): Promise<boolean> {
  refreshing ??= authCall("/auth/refresh", { method: "POST" })
    .then(async (res) => {
      set(await res.json());
      return true;
    })
    .catch(() => {
      set(null);
      return false;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * /api 호출 — 로그인했으면 Authorization 을 붙인다. 401 이면(access token 15분 만료) refresh 하고 한 번만 다시 보낸다.
 * 다시 보내도 401 이거나 refresh 가 실패하면 로그인 안 한 상태로 두고 401 응답을 그대로 돌려준다 — 화면이 로그인으로 보낸다.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = () => {
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${API}${path}`, { ...init, headers });
  };
  const hadToken = Boolean(token);
  const res = await send();
  if (res.status !== 401 || !hadToken) return res;
  return (await refresh()) ? send() : res;
}

/** 로그인 화면으로 — 돌아올 경로를 returnTo 로 */
export function loginPath(path: string) {
  return `/login?returnTo=${encodeURIComponent(path)}`;
}

/** 로그인 뒤 돌아갈 곳 — 같은 사이트 경로만(외부 주소로 보내는 데 쓰이지 않게) */
export function safeReturnTo(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}
