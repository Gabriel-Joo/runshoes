import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../../auth/session";
import { demoBlocked, serverMessage } from "../../auth/demoAdmin";
import { useAuth } from "../../auth/useAuth";
import Field from "../../auth/Field";
import { DateRange, Pager } from "./parts";
import { qs, useQuery, usePaged, when } from "./paged";

/** GET /api/admin/chatbot-misses 의 한 줄(api/ChatbotMissController) — 같은 이름을 묶은 것 */
interface Miss {
  kind: "shoe" | "term" | "feature";
  query: string;
  count: number;
  /** 그 가운데 처리하지 않은 질문 수 — 처리한 뒤 같은 이름으로 새 질문이 오면 다시 「처리 안 함」 */
  open: number;
  lastAt: string;
  lastMessage: string;
  status: "open" | "done" | "ignored";
  decidedAt: string | null;
}

const KIND: Record<Miss["kind"], string> = { shoe: "신발", term: "용어", feature: "특성" };
const STATUS: [string, string][] = [["open", "처리 안 함"], ["done", "처리함"], ["ignored", "무시"], ["all", "전체"]];
const KINDS: [string, string][] = [["", "전체"], ["shoe", "신발"], ["term", "용어"], ["feature", "특성"]];

/**
 * 챗봇 문의 — 챗봇에게 물었지만 등록되지 않은 신발 · 사전에 없는 용어 · 답하지 못한 특성 질문(V18). 등록·관리 탭에서 옮겼다(2026-11-14 사용자).
 * 처리 상태(V23): 처리함 · 무시 — 없으면 목록이 쌓이기만 한다. 날짜 최신순(마지막 질문), 거르기 날짜 · 종류 · 상태.
 * 가는 곳: 신발 → 새 러닝화 등록(모델명에 이름을 넣어 둔다) / 용어 → 사전 추가(여기서 바로, 더하면 처리함) / 특성 → 등록·관리 탭에서 신발을 골라 수정
 *   — 특성 문의는 어느 신발에 대한 것인지 기록에 없다(V18 은 이름 · 원문만 남긴다)
 */
function ChatMisses() {
  const { setNotice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const q = useQuery();
  const page = Number(q.get("page")) || 1;
  const status = q.get("status") || "open";
  const kind = q.get("kind");
  const { data, error, reload } = usePaged<Miss>(`/admin/chatbot-misses${qs({ status, kind, from: q.get("from"), to: q.get("to"), page })}`);
  const [termFor, setTermFor] = useState<Miss | null>(null);
  const items = data?.items ?? [];
  const back = { back: location.pathname + location.search };

  const decide = async (m: Miss, next: "done" | "ignored" | "open", quiet = false) => {
    const res = await apiFetch("/admin/chatbot-misses/decide", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: m.kind, query: m.query, status: next }),
    }).catch(() => null);
    const blocked = res && (await demoBlocked(res));
    if (blocked) setNotice(blocked);
    else if (!res?.ok) setNotice((res && (await serverMessage(res))) ?? "바꾸지 못했어요. 잠시 뒤 다시 해 주세요.");
    else if (!quiet) setNotice(next === "open" ? `'${m.query}'을(를) 처리 안 함으로 되돌렸어요.` : `'${m.query}'을(를) ${next === "done" ? "처리함" : "무시"}으로 옮겼어요.`);
    reload();
  };

  return (
    <div className="mypage__panel">
      <div className="mypage__titlebar">
        <h3 className="mypage__title">챗봇 문의</h3>
      </div>
      <p className="adminmy__note">
        챗봇에게 물었지만 등록되어 있지 않은 신발 · 사전에 없는 용어 · 답하지 못한 특성 질문이에요. 같은 이름은 묶어서 셉니다.
        처리함 · 무시로 옮겨도 같은 이름으로 새 질문이 오면 다시 「처리 안 함」에 나와요.
      </p>

      <div className="adminmy__filters">
        <DateRange from={q.get("from")} to={q.get("to")} onChange={(from, to) => q.set({ from, to })} />
        <div className="admin__gapfilters" role="group" aria-label="처리 상태">
          {STATUS.map(([key, label]) => (
            <button key={key} className={`admin__gapfilter ${status === key ? "is-active" : ""}`} aria-pressed={status === key} onClick={() => q.set({ status: key === "open" ? "" : key })}>
              {label}
            </button>
          ))}
        </div>
        <div className="admin__gapfilters" role="group" aria-label="종류">
          {KINDS.map(([key, label]) => (
            <button key={key || "all"} className={`admin__gapfilter ${kind === key ? "is-active" : ""}`} aria-pressed={kind === key} onClick={() => q.set({ kind: key })}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="admin__count">{data ? `${data.total.toLocaleString()}개 · 마지막 질문 최신순` : ""}</p>
      {error && <p className="auth__error" role="alert">{error}</p>}

      <ul className="admin__list">
        {data && items.length === 0 && <li className="admin__empty">해당하는 문의가 없습니다.</li>}
        {items.map((m) => (
          <li className={`admin__row admin__row--miss ${m.status !== "open" ? "is-hidden" : ""}`} key={`${m.kind}:${m.query}`}>
            <span className="admin__purpose">{KIND[m.kind]}</span>
            <div className="admin__names">
              <span className="admin__model">{m.query}</span>
              <span className="admin__brandname" title={m.lastMessage}>마지막 질문: {m.lastMessage}</span>
              {m.status !== "open" && (
                <span className="admin__brandname">{m.status === "done" ? "처리함" : "무시"} · {when(m.decidedAt)}</span>
              )}
            </div>
            <span className="admin__misscount" title={m.open > 0 && m.open < m.count ? `처리 안 함 ${m.open}회` : undefined}>{m.count}회</span>
            <span className="admin__changeat">{when(m.lastAt, false)}</span>
            <div className="admin__actions">
              {m.status === "open" ? (
                <>
                  {m.kind === "shoe" && <button className="admin__edit" onClick={() => navigate("/new", { state: { ...back, prefill: m.query } })}>등록하기</button>}
                  {m.kind === "term" && <button className="admin__edit" onClick={() => setTermFor(m)}>사전에 추가</button>}
                  {m.kind === "feature" && <button className="admin__edit" onClick={() => navigate("/admin")} title="특성 문의는 어느 신발인지 기록에 없어요 — 등록·관리 탭에서 신발을 골라 수정해 주세요">신발 고르기</button>}
                  <button className="admin__edit" onClick={() => decide(m, "done")}>처리함</button>
                  <button className="admin__delete" onClick={() => decide(m, "ignored")}>무시</button>
                </>
              ) : (
                <button className="admin__edit" onClick={() => decide(m, "open")}>되돌리기</button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {data && <Pager page={data.page} size={data.size} total={data.total} onPage={(p) => q.set({ page: String(p) })} />}

      {termFor && (
        <TermForm
          name={termFor.query}
          onDone={async (name) => { setTermFor(null); setNotice(`'${name}'을(를) 사전에 더했어요. 챗봇은 다음 대화부터 써요.`); await decide(termFor, "done", true); }}
          onCancel={() => setTermFor(null)}
        />
      )}
    </div>
  );
}

/** 사전 추가 — POST /api/admin/terms. 모양은 확인 창(ConfirmModal) 상자 안에 로그인 폼 칸(auth__field) */
function TermForm({ name: initial, onDone, onCancel }: { name: string; onDone: (name: string) => void; onCancel: () => void }) {
  const { setNotice } = useAuth();
  const [form, setForm] = useState({ key: "", name: initial, short: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => { setForm({ ...form, [k]: e.target.value }); setError(null); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await apiFetch("/admin/terms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).catch(() => null);
    setBusy(false);
    const blocked = res && (await demoBlocked(res));
    if (blocked) { setNotice(blocked); return onCancel(); }
    if (!res?.ok) return setError((res && (await serverMessage(res))) ?? "더하지 못했어요. 잠시 뒤 다시 해 주세요.");
    onDone(form.name.trim());
  };

  return (
    <div className="confirm" onClick={onCancel}>
      <form className="confirm__box adminmy__termform" role="dialog" aria-modal="true" aria-label="사전에 용어 추가" onClick={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <p className="confirm__message">사전에 용어 추가</p>
        <div className="auth__form">
          <Field id="term-name" label="이름" value={form.name} onChange={set("name")} hint="챗봇이 문장에서 이 이름을 찾아요" maxLength={100} />
          <Field id="term-key" label="key(영문)" value={form.key} onChange={set("key")} hint="영문 소문자로 시작, 영문 · 숫자(예: heelCounter)" maxLength={50} />
          <Field id="term-short" label="한 줄 설명" value={form.short} onChange={set("short")} maxLength={200} />
          <label className="auth__field" htmlFor="term-description">
            <span>설명</span>
            <textarea id="term-description" className="review__textarea" rows={4} maxLength={2000} value={form.description} onChange={set("description")} />
          </label>
        </div>
        {error && <p className="auth__error" role="alert">{error}</p>}
        <div className="confirm__actions">
          <button type="button" className="confirm__cancel" onClick={onCancel}>취소</button>
          <button type="submit" className="confirm__ok adminmy__ok" disabled={busy}>사전에 추가</button>
        </div>
      </form>
    </div>
  );
}

export default ChatMisses;
