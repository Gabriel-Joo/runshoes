const isDev = import.meta.env.DEV;

export const API = isDev
  ? "http://localhost:3000"
  : `${import.meta.env.BASE_URL}api`;

export const asset = (p: string) =>
  p.startsWith("/") ? `${import.meta.env.BASE_URL.replace(/\/$/, "")}${p}` : p;
