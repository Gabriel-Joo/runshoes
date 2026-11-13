import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Markdown, { type MarkdownToJSX } from "markdown-to-jsx/react";
import "./ChatBot.css";
import { CHATBOT_WS_URL } from "../api";
import { useAuth } from "../auth/useAuth";
import { chatToken, loginPath, logout, refresh } from "../auth/session";

/**
 * 챗봇 답은 마크다운으로 그린다(5-2 2차 수정) — 인용 블록(리뷰 원문, 코드가 붙인다) · 굵게 · 목록 모두.
 * 무엇을 쓸지는 챗봇 서버가 정한다(지금 프롬프트는 인용만 — 나머지는 서버 검사가 지운다).
 * 답에는 리뷰 원문이 들어가므로 원시 HTML 은 그리지 않는다: HTML 을 파싱하지 않고(disableParsingRawHTML · ignoreHTMLBlocks)
 * 글자 그대로 둔다. 링크 · 이미지는 그리지 않는다 — 신발 링크는 아래 "보러 가기" 버튼(서버 links)만 쓴다.
 * 사용자가 친 글은 마크다운으로 읽지 않는다.
 */
const MD_OPTIONS: MarkdownToJSX.Options = {
  disableParsingRawHTML: true,
  ignoreHTMLBlocks: true,
  disableAutoLink: true,
  forceBlock: true,
  wrapper: null,
  overrides: {
    a: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
    img: () => null,
  },
};

/** 링크는 챗봇 서버의 코드가 붙인다(LLM 이 아니다) — 라벨은 언제나 "보러 가기", 1켤레는 상세 모달 · 2켤레 이상은 비교하기(작업 5-1) */
type ChatLink = { label: string; href: string };
type ChatMessage = { type: "user" | "bot"; text: string; links?: ChatLink[] };

/** 사이트 안 주소만 — 서버가 다른 것을 보내도 버튼으로 만들지 않는다 */
const internalLinks = (links: unknown): ChatLink[] =>
  Array.isArray(links)
    ? links.filter((l): l is ChatLink => typeof l?.label === "string" && typeof l?.href === "string" && l.href.startsWith("/") && !l.href.startsWith("//"))
    : [];

const LOGIN_GUIDE = "챗봇은 로그인한 뒤에 쓸 수 있어요. 체험 계정으로 바로 둘러볼 수 있어요.";
const RELOGIN_GUIDE = "로그인 정보를 확인하지 못했어요. 다시 로그인하면 이어서 물어볼 수 있어요.";
const CLOSED = "연결이 끊겼어요. 창을 닫았다가 다시 열어 주세요.";

const LoginGuide = ({ text, onLogin }: { text: string; onLogin: () => void }) => (
  <div className="chatbot-login">
    <p>{text}</p>
    <button onClick={onLogin}>로그인</button>
  </div>
);

/**
 * 로그인 확인(docs/04_auth.md 4절 · 09 17절) — 연결 직후 첫 메시지 {type:"auth", token}. 주소에는 넣지 않는다(로그에 남는다).
 * - 서버가 인사(system)를 보내면 질문을 받는다. 메시지마다 다시 확인하지 않는다(15분 토큰으로 오래 연 창이 막히지 않게)
 * - auth_failed → refresh 한 번 뒤 다시 연결. refresh 가 실패하면 로그아웃 상태가 되어 이 컴포넌트가 내려가고(소켓도 닫힘) 로그인 안내가 뜬다.
 *   다시 붙어도 실패하면 다시 로그인 안내
 * - auth_unavailable(백엔드가 아직 안 뜸 등) → 서버 문구 그대로. 토큰 탓이 아니라 refresh 하지 않는다
 * 로그인한 사람마다 새로 붙는다(key = user id) — 로그아웃 · 다른 계정으로 바뀌면 소켓을 닫고 대화도 지운다.
 */
type Phase = "connecting" | "ready" | "relogin" | "closed" | "unavailable";

const ChatSession = ({ onLink, onLogin }: { onLink: (href: string) => void; onLogin: () => void }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("connecting");
  const [notice, setNotice] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retried = false;

    const open = () => {
      const socket = new WebSocket(CHATBOT_WS_URL);
      socketRef.current = socket;
      let settled = false;   // 서버가 인증 결과(인사 · 실패)를 보냈는가

      socket.onopen = () => socket.send(JSON.stringify({ type: "auth", token: chatToken() ?? "" }));

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "auth_failed") {
          settled = true;
          if (!retried) {
            retried = true;
            setPhase("connecting");
            refresh().then((ok) => {
              if (ok && !cancelled) open();
            });
          } else {
            setPhase("relogin");
          }
          return;
        }
        if (data.type === "auth_unavailable") {
          settled = true;
          setNotice(typeof data.message === "string" && data.message ? data.message : CLOSED);
          setPhase("unavailable");
          return;
        }
        if (data.type === "system" || data.type === "message") {
          settled = true;
          setPhase("ready");
          setLoading(false);
          setMessages((prev) => [...prev, { type: "bot", text: data.message, links: internalLinks(data.links) }]);
        }
      };

      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (cancelled) return;
        setLoading(false);
        // 인사를 받은 뒤 끊김(배포 등) · 아무 답 없이 끊김 — 인증 실패는 위에서 따로 보여 준다
        setPhase((p) => (p === "ready" || !settled ? "closed" : p));
      };
    };

    open();
    return () => {
      cancelled = true;
      const s = socketRef.current;
      if (s) {
        s.onclose = null;
        s.onmessage = null;
        s.close();
        socketRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const ready = phase === "ready";

  const sendMessage = () => {
    const text = input.trim();
    if (!text || !socketRef.current || !ready) return;

    setMessages((prev) => [...prev, { type: "user", text }]);
    socketRef.current.send(JSON.stringify({ type: "message", message: text }));
    setInput("");
    setLoading(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") sendMessage();
  };

  return (
    <>
      <div className="chatbot-messages">
        {phase === "connecting" && <p className="chatbot-message--loading">연결 중입니다…</p>}
        {messages.map((msg, i) => (
          <div key={i} className={`chatbot-message chatbot-message--${msg.type}`}>
            {msg.type === "bot" ? (
              <div className="chatbot-md">
                <Markdown options={MD_OPTIONS}>{msg.text}</Markdown>
              </div>
            ) : (
              msg.text
            )}
            {msg.links && msg.links.length > 0 && (
              <div className="chatbot-links">
                {msg.links.map((l) => (
                  <button key={l.href} className="chatbot-link" onClick={() => onLink(l.href)}>
                    {l.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && <p className="chatbot-message--loading">답변을 준비하고 있어요…</p>}
        {phase === "relogin" && <LoginGuide text={RELOGIN_GUIDE} onLogin={() => void logout().catch(() => {}).finally(onLogin)} />}
        {(phase === "closed" || phase === "unavailable") && (
          <p className="chatbot-message--loading">{phase === "unavailable" ? notice : CLOSED}</p>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chatbot-input-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="궁금한 걸 물어보세요"
          disabled={!ready}
        />
        <button onClick={sendMessage} disabled={!ready}>
          전송
        </button>
      </div>
    </>
  );
};

const ChatBot = () => {
  // isOpen = 창이 보이는가, active = 대화가 살아 있는가("보러 가기"는 창만 접고 대화는 남긴다)
  const [isOpen, setIsOpen] = useState(false);
  const [active, setActive] = useState(false);
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleToggle = () => {
    if (isOpen) {
      // 닫기: 소켓 끊고 대화 초기화(ChatSession 이 내려간다)
      setIsOpen(false);
      setActive(false);
    } else {
      setIsOpen(true);
      setActive(true);
    }
  };

  // 로그인 뒤 보던 화면으로 — 로그인 · 가입 화면에서는 그 자리(Header 와 같은 규칙)
  const toLogin = () => {
    const here = location.pathname + location.search;
    setIsOpen(false);
    setActive(false);
    navigate(location.pathname === "/login" || location.pathname === "/signup" ? here : loginPath(here));
  };

  const toLink = (href: string) => {
    // 창은 접기만 한다(대화 · 연결은 남긴다) — 열린 채면 상세 모달(z-index 100)이 창(1000) 뒤에 가린다
    setIsOpen(false);
    navigate(href);
  };

  return (
    <div className="chatbot-container">
      {(isOpen || (active && status === "user")) && (
        <div className="chatbot-window" hidden={!isOpen}>
          <div className="chatbot-header">
            <span>러닝화 도우미</span>
            <button onClick={handleToggle}>✕</button>
          </div>

          {/* 첫 refresh 중에는 기다린다 — 로그인한 사람에게 안내가 잠깐 비치지 않게. 로그인 전에는 연결을 열지 않는다 */}
          {status === "loading" && (
            <div className="chatbot-messages">
              <p className="chatbot-message--loading">로그인 상태를 확인하고 있어요…</p>
            </div>
          )}
          {status === "anonymous" && (
            <div className="chatbot-messages">
              <LoginGuide text={LOGIN_GUIDE} onLogin={toLogin} />
            </div>
          )}
          {status === "user" && active && <ChatSession key={user?.id} onLink={toLink} onLogin={toLogin} />}
        </div>
      )}

      <button className="chatbot-toggle" onClick={handleToggle}>
        {isOpen ? "✕" : "💬"}
      </button>
    </div>
  );
};

export default ChatBot;
