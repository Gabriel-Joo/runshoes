const isDev = import.meta.env.DEV;

const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";

export const API = isDev
  ? "http://localhost:3000"
  : `${import.meta.env.BASE_URL}api`;

export const asset = (p: string) =>
  p.startsWith("/") ? `${import.meta.env.BASE_URL.replace(/\/$/, "")}${p}` : p;

export const CHATBOT_WS_URL = isDev
  ? "ws://localhost:8766"
  : `${wsProtocol}//${window.location.host}/ws/chat`;
