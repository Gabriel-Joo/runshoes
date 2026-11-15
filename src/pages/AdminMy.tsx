import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import Reviews from "./adminmy/Reviews";
import Members from "./adminmy/Members";
import Conversations from "./adminmy/Conversations";
import ChatMisses from "./adminmy/ChatMisses";
import "./Admin.css";
import "./Account.css";
import "./AdminMy.css";

type Tab = "reviews" | "hidden" | "members" | "misses" | "turns";
const TABS: Tab[] = ["reviews", "hidden", "members", "misses", "turns"];

/**
 * 관리자 마이페이지(2026-11-14 사용자) — 관리자 · 데모 관리자로 로그인하면 마이페이지가 이것으로 바뀐다.
 * 일반 회원의 메뉴(내 리뷰 · 찜 · 회원 탈퇴)는 관리자에게 쓸모가 없고, 관리자는 닉네임 변경 · 탈퇴가 서버에서 막혀 있어 회원정보 수정도 넣지 않는다.
 * 신발은 등록·관리 탭(/admin)이 맡는다. 첫 화면(할 일 모음)은 두지 않는다 — 숫자는 Grafana 가 본다.
 * 모양은 일반 마이페이지 그대로(왼쪽 목차 mypage__nav · 오른쪽 표 mypage__table). 목차는 ?tab= — 거르기 · 쪽도 주소에 둔다.
 * 데모 관리자는 모두 보기만 — 쓰기는 서버가 403 으로 막고, 화면은 그 문구를 띄운다
 */
function AdminMy() {
  const { user, isDemoAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get("tab") as Tab) ? (params.get("tab") as Tab) : "reviews";
  const go = (t: Tab) => setParams(t === "reviews" ? {} : { tab: t });   // 목차를 옮기면 거르기 · 쪽은 비운다
  if (!user) return null;

  const nav = (t: Tab, label: string) => (
    <button className={`mypage__navitem is-sub ${tab === t ? "is-active" : ""}`} onClick={() => go(t)} aria-current={tab === t ? "page" : undefined}>
      {label}
    </button>
  );

  return (
    <div className="mypage">
      <nav className="mypage__nav" aria-label="관리자 마이페이지 목차">
        <h2 className="mypage__navtitle">마이페이지</h2>
        <p className="mypage__navgroup">리뷰 관리</p>
        {nav("reviews", "전체 리뷰")}
        {nav("hidden", "숨긴 리뷰")}
        <p className="mypage__navgroup">회원 관리</p>
        {nav("members", "회원 목록")}
        <p className="mypage__navgroup">챗봇</p>
        {nav("misses", "문의")}
        {nav("turns", "대화 보기")}
      </nav>

      <div className="mypage__body">
        <p className="mypage__summary">
          <strong>{user.nickname}</strong>님 · {isDemoAdmin ? "데모 관리자" : "관리자"}
          {isDemoAdmin && <span className="admin__demo">보기 전용</span>}
        </p>
        {tab === "reviews" && <Reviews key="reviews" hidden={false} />}
        {tab === "hidden" && <Reviews key="hidden" hidden />}
        {tab === "members" && <Members />}
        {tab === "misses" && <ChatMisses />}
        {tab === "turns" && <Conversations />}
      </div>
    </div>
  );
}

export default AdminMy;
