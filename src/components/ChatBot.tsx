import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./ChatBot.css";
import { CHATBOT_WS_URL } from "../api";

/** 링크는 챗봇 서버의 코드가 붙인다(LLM 이 아니다) — 라벨은 언제나 "보러 가기", 1켤레는 상세 모달 · 2켤레 이상은 비교하기(작업 5-1) */
type ChatLink = { label: string; href: string };
type ChatMessage = { type: "user" | "bot"; text: string; links?: ChatLink[] };

/** 사이트 안 주소만 — 서버가 다른 것을 보내도 버튼으로 만들지 않는다 */
const internalLinks = (links: unknown): ChatLink[] =>
  Array.isArray(links)
    ? links.filter((l): l is ChatLink => typeof l?.label === "string" && typeof l?.href === "string" && l.href.startsWith("/") && !l.href.startsWith("//"))
    : [];

const ChatBot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  const connectSocket = () => {
    if (
      socketRef.current &&
      socketRef.current.readyState !== WebSocket.CLOSED
    ) {
      return;
    }

    const socket = new WebSocket(CHATBOT_WS_URL);
    socketRef.current = socket;

    socket.onopen = () => setConnected(true);

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setLoading(false);
      if (data.type === "system" || data.type === "message") {
        setMessages((prev) => [...prev, { type: "bot", text: data.message, links: internalLinks(data.links) }]);
      }
    };

    socket.onclose = () => {
      setConnected(false);
      socketRef.current = null;
    };
  };

  const handleToggle = () => {
    if (isOpen) {
      // 닫기: 소켓 끊고 대화 초기화
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
        socketRef.current = null;
      }
      setMessages([]);
      setInput("");
      setConnected(false);
      setIsOpen(false);
    } else {
      // 열기: 새 연결
      setIsOpen(true);
      connectSocket();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = () => {
    const text = input.trim();
    if (!text || !socketRef.current || !connected) return;

    setMessages((prev) => [...prev, { type: "user", text }]);
    socketRef.current.send(JSON.stringify({ type: "message", message: text }));
    setInput("");
    setLoading(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") sendMessage();
  };

  return (
    <div className="chatbot-container">
      {isOpen && (
        <div className="chatbot-window">
          <div className="chatbot-header">
            <span>러닝화 도우미</span>
            <button onClick={handleToggle}>✕</button>
          </div>

          <div className="chatbot-messages">
            {!connected && (
              <p className="chatbot-message--loading">연결 중입니다…</p>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`chatbot-message chatbot-message--${msg.type}`}
              >
                {msg.text}
                {msg.links && msg.links.length > 0 && (
                  <div className="chatbot-links">
                    {msg.links.map((l) => (
                      <button
                        key={l.href}
                        className="chatbot-link"
                        onClick={() => {
                          // 창은 접기만 한다(대화 · 연결은 남긴다) — 열린 채면 상세 모달(z-index 100)이 창(1000) 뒤에 가린다
                          setIsOpen(false);
                          navigate(l.href);
                        }}
                      >
                        {l.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <p className="chatbot-message--loading">
                답변을 준비하고 있어요…
              </p>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chatbot-input-row">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="궁금한 걸 물어보세요"
              disabled={!connected}
            />
            <button onClick={sendMessage} disabled={!connected}>
              전송
            </button>
          </div>
        </div>
      )}

      <button className="chatbot-toggle" onClick={handleToggle}>
        {isOpen ? "✕" : "💬"}
      </button>
    </div>
  );
};

export default ChatBot;
