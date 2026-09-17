const isDev = import.meta.env.DEV;

export const API = isDev
  ? "http://localhost:3000"
  : `${import.meta.env.BASE_URL}api`;

export const asset = (p: string) =>
  p.startsWith("/") ? `${import.meta.env.BASE_URL.replace(/\/$/, "")}${p}` : p;

export const CHATBOT_WS_URL = isDev
  ? "ws://localhost:8766"
  : `ws://${window.location.host}/ws/chat`; // 배포 시 실제 경로에 맞게 조정 필요