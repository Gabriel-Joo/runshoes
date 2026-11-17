import { useEffect, useState } from "react";
import { apiFetch } from "../../auth/session";
import { DateRange, Pager, TextFilter } from "./parts";
import { qs, useQuery, usePaged, when } from "./paged";

/** GET /api/admin/chatbot-conversations 의 한 줄(api/AdminChatbotTurnController) — 웹소켓 연결 하나가 대화 하나 */
interface Conversation {
  connId: string;
  userId: number | null;
  nickname: string | null;
  /** 체험 계정(시드 30 · 데모 관리자) — 여럿이 함께 쓴다 */
  demo: boolean;
  startedAt: string;
  lastAt: string;
  turns: number;
  branches: string[];
  firstQuestion: string | null;
}

interface Turn {
  turnId: number;
  createdAt: string;
  question: string;
  answer: string | null;
  branch: string;
  fallbackUsed: boolean;
  shoeCount: number;
  latencyMs: number;
  stages: Record<string, number>;
}

/** 갈래(docs/09_chatbot_rag.md 18절 표) — 화면 이름 */
const BRANCHES: [string, string][] = [
  ["term", "용어"], ["spec", "스펙"], ["compare", "비교"], ["recommend", "추천"], ["explain", "특성 설명"], ["experience", "경험·후기"],
  ["out_of_scope", "범위 밖"], ["greeting", "인사"], ["choose", "되물음"], ["no_shoe", "없는 신발"], ["error", "오류"],
];
const BRANCH = Object.fromEntries(BRANCHES);

/** 단계 이름 — 0 인 단계는 보이지 않는다(그 턴에 쓰지 않음) */
const STAGE: Record<string, string> = {
  routerMs: "라우터", searchMs: "검색", genMs: "생성", catalogMs: "카탈로그", compareMs: "비교 API", recommendMs: "추천 API", reviewMs: "리뷰 API", summaryMs: "요약 API",
};

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}초`;

/**
 * 90일이 지나 정리가 질문 · 답을 빈 글로 바꾼 턴(activity/ActivityCleanup, 보관 app.activity.retention-chatbot-text).
 * 챗봇은 빈 질문을 기록하지 않으므로(api/ChatbotTurnController 가 400) 질문이 빈 글이면 정리로 비운 것이다
 */
const CLEARED = "90일이 지나 질문과 답을 지웠어요.";

/**
 * 대화 보기 — 날짜 최신순(마지막 턴), 거르기 날짜 · 계정 · 갈래. 계정 칸은 숫자(계정 번호)도 그대로 찾지만 안내에는 닉네임만 적는다(2026-11-15 사용자). 펼치면 턴마다 질문과 답 전체, 갈래, 걸린 시간.
 * 펼치기는 상세 모달의 리뷰 「전체보기」(review__more)를 따른다 — 관리 화면에는 펼치기 행이 없었다.
 * 숫자 · 추세는 Grafana 가 본다 — 여기는 개별 대화를 읽는 곳이다(합계 · 그래프를 그리지 않는다)
 */
function Conversations() {
  const q = useQuery();
  const page = Number(q.get("page")) || 1;
  const { data, error } = usePaged<Conversation>(
    `/admin/chatbot-conversations${qs({ from: q.get("from"), to: q.get("to"), account: q.get("account"), branch: q.get("branch"), page })}`,
  );
  const [open, setOpen] = useState<string | null>(null);
  const items = data?.items ?? [];
  const branch = q.get("branch");
  const filtered = Boolean(q.get("from") || q.get("to") || q.get("account") || branch);

  return (
    <div className="mypage__panel">
      <div className="mypage__titlebar">
        <h3 className="mypage__title">대화 보기</h3>
      </div>
      <p className="adminmy__note">
        챗봇 창을 한 번 열고 닫을 때까지가 대화 하나예요. <strong>체험 계정의 대화는 한 사람의 것이 아니에요.</strong> 체험 계정은 누구나 함께 쓰므로
        같은 계정의 대화도 서로 다른 사람일 수 있어요. 90일이 지난 대화는 질문과 답을 지우고 갈래와 걸린 시간만 남겨요.
      </p>

      <div className="adminmy__filters">
        <DateRange from={q.get("from")} to={q.get("to")} onChange={(from, to) => q.set({ from, to })} />
        <TextFilter value={q.get("account")} placeholder="계정(닉네임)" onChange={(account) => q.set({ account })} />
        <div className="admin__gapfilters" role="group" aria-label="갈래">
          <button className={`admin__gapfilter ${!branch ? "is-active" : ""}`} aria-pressed={!branch} onClick={() => q.set({ branch: "" })}>전체</button>
          {BRANCHES.map(([key, label]) => (
            <button key={key} className={`admin__gapfilter ${branch === key ? "is-active" : ""}`} aria-pressed={branch === key} onClick={() => q.set({ branch: key })}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="admin__count">{data ? `대화 ${data.total.toLocaleString()}개 · 최근 순` : ""}</p>
      {error && <p className="auth__error" role="alert">{error}</p>}
      {data && items.length === 0 && <p className="mypage__empty">{filtered ? "조건에 맞는 대화가 없어요." : "아직 대화가 없어요."}</p>}

      <ul className="adminmy__convs">
        {items.map((c) => (
          <li className="adminmy__conv" key={c.connId}>
            <div className="adminmy__convhead">
              <span className="mypage__date">{when(c.lastAt)}</span>
              <span className="adminmy__convwho">
                {c.nickname ?? (c.userId == null ? "계정 없음" : `계정 ${c.userId}`)}
                {c.demo && <em className="adminmy__badge">체험 계정</em>}
              </span>
              <span className="adminmy__convmeta">턴 {c.turns} · {c.branches.map((b) => BRANCH[b] ?? b).join(" · ")}</span>
            </div>
            {c.firstQuestion ? (
              <p className="adminmy__convfirst">{c.firstQuestion}</p>
            ) : (
              <p className="adminmy__convfirst adminmy__cleared">{CLEARED}</p>
            )}
            <button className="review__more adminmy__more" onClick={() => setOpen(open === c.connId ? null : c.connId)} aria-expanded={open === c.connId}>
              {open === c.connId ? "대화 접기" : `대화 펼치기 (턴 ${c.turns}개)`}
            </button>
            {open === c.connId && <Turns connId={c.connId} />}
          </li>
        ))}
      </ul>
      {data && <Pager page={data.page} size={data.size} total={data.total} onPage={(p) => q.set({ page: String(p) })} />}
    </div>
  );
}

/** 펼친 대화 — 턴마다 질문 · 답 전체, 갈래, 걸린 시간(쓴 단계만) */
function Turns({ connId }: { connId: string }) {
  const [turns, setTurns] = useState<Turn[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    apiFetch(`/admin/chatbot-conversations/${connId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => setTurns(d.turns))
      .catch(() => setFailed(true));
  }, [connId]);
  if (failed) return <p className="auth__error" role="alert">대화를 불러오지 못했어요.</p>;
  if (!turns) return <p className="adminmy__note">불러오는 중…</p>;
  return (
    <ol className="adminmy__turns">
      {turns.map((t, i) => (
        <li className="adminmy__turn" key={t.turnId}>
          <p className="adminmy__turnmeta">
            <strong>{i + 1}</strong> · {when(t.createdAt)} · {BRANCH[t.branch] ?? t.branch} · <strong>{seconds(t.latencyMs)}</strong>
            <span className="adminmy__stages">
              {Object.entries(t.stages).filter(([, ms]) => ms > 0).map(([k, ms]) => `${STAGE[k] ?? k} ${ms}ms`).join(" · ")}
              {t.fallbackUsed && " · 코드 답"}
              {t.shoeCount > 0 && ` · 신발 버튼 ${t.shoeCount}`}
            </span>
          </p>
          {t.question ? (
            <>
              <p className="adminmy__q">{t.question}</p>
              <p className="adminmy__a">{t.answer || "(답 없음 — 턴이 오류로 끝남)"}</p>
            </>
          ) : (
            <p className="adminmy__cleared">{CLEARED}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

export default Conversations;
