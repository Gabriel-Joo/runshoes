const isDev = import.meta.env.DEV;

export const API = isDev
  ? "http://localhost:3000"
  : `${import.meta.env.BASE_URL}api`;
