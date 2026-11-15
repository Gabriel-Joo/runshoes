import { useState } from "react";
import { apiFetch } from "../../auth/session";
import { demoBlocked, serverMessage } from "../../auth/demoAdmin";
import { useAuth } from "../../auth/useAuth";
import ConfirmModal from "../../components/ConfirmModal";
import { Choice, Pager, TextFilter } from "./parts";
import { qs, useQuery, usePaged, when } from "./paged";

/** GET /api/admin/users 의 한 줄(api/AdminUserController) */
interface Member {
  id: number;
  email: string;
  nickname: string;
  role: "USER" | "ADMIN" | "DEMO_ADMIN";
  createdAt: string;
  lastLoginAt: string | null;
  withdrawn: boolean;
  withdrawnAt: string | null;
  locked: boolean;
  lockedUntil: string | null;
  reviews: number;
}

const ROLE: Record<Member["role"], string> = { USER: "회원", ADMIN: "관리자", DEMO_ADMIN: "데모 관리자" };

/**
 * 회원 목록 — 가입 최근 순, 서버 페이지 나누기. 이메일 · 닉네임으로 찾고 가입 연도로 거른다(2026-11-15). 데모 관리자도 같게 본다(시현용, 2026-11-15 사용자 — 쓰기만 서버가 막는다).
 * 잠김은 로그인 실패(계정 15분 5번)로 잠긴 계정 — 「잠금 풀기」가 그 기록 뒤부터 다시 세게 한다. IP 잠금은 계정 단위로 풀 수 없다.
 * 계정은 사람이 아니다(체험 계정은 여럿이 함께 쓴다) — 「계정 N개」로 쓴다
 */
function Members() {
  const { setNotice } = useAuth();
  const q = useQuery();
  const page = Number(q.get("page")) || 1;
  const year = q.get("year");
  const { data, error, reload } = usePaged<Member>(`/admin/users${qs({ q: q.get("q"), year, page })}`);
  // 연도 칸 — 서버가 준 가입한 해들. 첫 응답 전에도 고른 해는 보이게
  const years = [...new Set([...(data?.years ?? []), ...(year ? [Number(year)] : [])])].sort((a, b) => b - a);
  const [target, setTarget] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);
  const items = data?.items ?? [];

  const unlock = async () => {
    if (!target) return;
    setBusy(true);
    const res = await apiFetch(`/admin/users/${target.id}/unlock`, { method: "POST" }).catch(() => null);
    setBusy(false);
    setTarget(null);
    const blocked = res && (await demoBlocked(res));
    if (blocked) setNotice(blocked);
    else if (!res?.ok) setNotice((res && (await serverMessage(res))) ?? "풀지 못했어요. 잠시 뒤 다시 해 주세요.");
    else setNotice(`'${target.nickname}' 계정의 로그인 잠금을 풀었어요.`);
    reload();
  };

  return (
    <div className="mypage__panel">
      <div className="mypage__titlebar">
        <h3 className="mypage__title">회원 목록</h3>
      </div>
      <p className="adminmy__note">
        잠김은 같은 계정으로 15분 안에 로그인을 5번 틀려 막힌 상태예요. 잠금을 풀면 그 뒤의 실패부터 다시 셉니다.
        같은 IP 에서 15분 안에 20번 틀려 막힌 것(IP 잠금)은 계정 단위로 풀 수 없어요.
        <br />
        IP로 막힌 경우는 이 목록에 나오지 않아요. 15분이 지나면 풀려요.
      </p>

      <div className="adminmy__filters">
        <TextFilter value={q.get("q")} placeholder="이메일 · 닉네임" onChange={(v) => q.set({ q: v })} />
      </div>

      <div className="adminmy__countbar">
        <p className="admin__count">{data ? `계정 ${data.total.toLocaleString()}개 · 가입 최신순` : ""}</p>
        <Choice value={year} label="가입 연도" onChange={(v) => q.set({ year: v })}
          options={[["", "가입 연도 전체"], ...years.map((y): [string, string] => [String(y), `${y}년 가입`])]} />
      </div>
      {error && <p className="auth__error" role="alert">{error}</p>}
      {data && items.length === 0 && <p className="mypage__empty">{q.get("q") || year ? "찾는 계정이 없어요." : "계정이 없어요."}</p>}

      {items.length > 0 && (
        <ul className="mypage__table adminmy__members">
          <li className="mypage__thead">
            <span>닉네임 · 이메일</span>
            <span>가입일</span>
            <span>마지막 로그인</span>
            <span>리뷰</span>
            <span>상태</span>
            <span />
          </li>
          {items.map((m) => (
            <li className={`mypage__row ${m.withdrawn ? "is-withdrawn" : ""}`} key={m.id}>
              <span className="mypage__model">
                <span>
                  {m.nickname}
                  {m.role !== "USER" && <em className="adminmy__badge">{ROLE[m.role]}</em>}
                </span>
                <small>{m.email}</small>
              </span>
              <span className="mypage__date">{when(m.createdAt, false)}</span>
              <span className="mypage__date">{m.lastLoginAt ? when(m.lastLoginAt) : "없음"}</span>
              <span className="mypage__helpful">{m.reviews}</span>
              <span className="adminmy__state">
                {m.withdrawn ? `탈퇴 ${when(m.withdrawnAt, false)}` : m.locked ? <strong>잠김 · {when(m.lockedUntil).slice(11)}까지</strong> : "정상"}
              </span>
              <span className="mypage__actions">
                {m.locked && <button className="mypage__btn is-danger" onClick={() => setTarget(m)}>잠금 풀기</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data && <Pager page={data.page} size={data.size} total={data.total} onPage={(p) => q.set({ page: String(p) })} />}

      {target && (
        <ConfirmModal
          message={`'${target.nickname}' 계정의 로그인 잠금을 풀까요?`}
          detail={<>
            <p>지금까지의 실패 기록은 남고, 세는 것만 처음부터 다시 합니다.</p>
            <p>같은 IP 에서 막힌 것(IP 잠금)은 풀리지 않아요.</p>
          </>}
          confirmLabel="잠금 풀기"
          busy={busy}
          onConfirm={unlock}
          onCancel={() => setTarget(null)}
        />
      )}
    </div>
  );
}

export default Members;
