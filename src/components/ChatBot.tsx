import { useState, useRef, useEffect } from "react";
import "./ChatBot.css";
import { CHATBOT_WS_URL } from "../api";

type ChatMessage = { type: "user" | "bot"; text: string };

const ChatBot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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
        setMessages((prev) => [...prev, { type: "bot", text: data.message }]);
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
