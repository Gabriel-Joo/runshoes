"""챗봇 로그인 시험 — 웹소켓 서버 수준(docs/09_chatbot_rag.md 17절).

실제 server.handler 를 127.0.0.1 의 빈 포트로 띄우고, 같은 Pod 백엔드 대신 가짜 GET /api/me 를 띄운다.
봇은 가짜(LLM · API 를 부르지 않는다) — 여기서 보는 것은 로그인 문턱뿐이다.
평가(python -m chatbot.eval.run)와 단위 시험(chatbot/tests/test_auth.py)이 함께 쓴다.

  python -m chatbot.eval.login     # 이것만
"""

from __future__ import annotations

import asyncio
import json
import threading
import time
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import websockets

DEMO_TOKEN = "demo-runner01-token"        # 체험 계정 카드로 받은 토큰이라 치고 — 가짜 /api/me 가 200
DEMO_ADMIN_TOKEN = "demo-admin-token"     # 관리자 체험 계정 — 역시 200(사용자 3: 허용)
AUTH_TIMEOUT = 0.5                        # 시험에서만 짧게(운영 값은 server.AUTH_TIMEOUT)


class _Me(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        auth = self.headers.get("Authorization", "")
        if self.path != "/api/me":
            code = 404
        elif auth in (f"Bearer {DEMO_TOKEN}", f"Bearer {DEMO_ADMIN_TOKEN}"):
            code = 200
        else:
            code = 401
        body = b'{"id":1}' if code == 200 else b"{}"
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):   # 시험 출력에 섞지 않는다
        pass


@contextmanager
def fake_me():
    """가짜 백엔드 — chatbot.http.API 를 잠시 그쪽으로 돌린다"""
    from chatbot import http
    srv = ThreadingHTTPServer(("127.0.0.1", 0), _Me)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    old = http.API
    http.API = f"http://127.0.0.1:{srv.server_address[1]}"
    try:
        yield
    finally:
        http.API = old
        srv.shutdown()
        srv.server_close()


@contextmanager
def no_backend():
    """백엔드가 아직 안 뜬 때(배포 직후) — 닫힌 포트"""
    import socket

    from chatbot import http
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    old = http.API
    http.API = f"http://127.0.0.1:{port}"
    try:
        yield
    finally:
        http.API = old


class _Reply:
    text = "가짜 답"
    fallback_used = False

    def links(self):
        return []


class _Bot:
    def turn(self, state, text):
        return _Reply(), {"branch": "fake"}


async def _session(send: list, *, wait_close: float = 3) -> dict:
    """서버를 띄워 한 번 붙고, send 를 차례로 보낸 뒤 받은 것과 닫힘을 돌려준다"""
    from chatbot import server
    async with websockets.serve(lambda ws: server.handler(ws, _Bot(), auth_timeout=AUTH_TIMEOUT), "127.0.0.1", 0) as srv:
        port = srv.sockets[0].getsockname()[1]
        got: list[dict] = []
        t0 = time.monotonic()
        async with websockets.connect(f"ws://127.0.0.1:{port}") as ws:
            for m in send:
                try:
                    await ws.send(json.dumps(m, ensure_ascii=False))
                except websockets.exceptions.ConnectionClosed:
                    break   # 서버가 먼저 닫았다(인증 실패) — 질문은 가지 않는다
                if m.get("type") == "auth":
                    await asyncio.sleep(0.3)   # 인증이 끝난 뒤 질문을 보내게
            try:
                while True:
                    got.append(json.loads(await asyncio.wait_for(ws.recv(), wait_close)))
            except websockets.exceptions.ConnectionClosed:
                pass
            except asyncio.TimeoutError:   # 열린 채 — 정상 대화
                pass
            closed = ws.close_code
        return {"got": got, "close_code": closed, "seconds": round(time.monotonic() - t0, 2)}


def _types(r: dict) -> list[str]:
    return [m.get("type") for m in r["got"]]


CASES = [
    # id, 설명, 보낼 것, 백엔드, 기대
    ("L01", "토큰 없이 바로 질문하면 닫힌다", [{"type": "message", "message": "노바블라스트 5 무게"}], "fake", "failed"),
    ("L02", "잘못된 토큰이면 닫힌다", [{"type": "auth", "token": "expired-or-wrong"}, {"type": "message", "message": "안녕"}], "fake", "failed"),
    ("L03", f"auth 를 안 보내면 {AUTH_TIMEOUT}초(시험 값) 뒤 닫힌다", [], "fake", "timeout"),
    ("L04", "체험 계정 토큰이면 인사 뒤 답한다", [{"type": "auth", "token": DEMO_TOKEN}, {"type": "message", "message": "드롭이 뭐예요?"}], "fake", "ok"),
    ("L05", "관리자 체험 계정 토큰이면 인사 뒤 답한다", [{"type": "auth", "token": DEMO_ADMIN_TOKEN}, {"type": "message", "message": "드롭이 뭐예요?"}], "fake", "ok"),
    ("L06", "백엔드가 안 떴으면 토큰 탓이 아닌 안내로 닫는다", [{"type": "auth", "token": DEMO_TOKEN}], "down", "unavailable"),
    ("L07", "토큰이 빈 문자열이면 닫힌다", [{"type": "auth", "token": ""}], "fake", "failed"),
    ("L08", "헤더에 실을 수 없는 토큰(줄바꿈)이면 백엔드 탓이 아니라 실패로 닫는다", [{"type": "auth", "token": "a\r\nX-Evil: 1"}], "fake", "failed"),
]


def _check(expect: str, r: dict) -> list[str]:
    from chatbot import server
    types = _types(r)
    fails: list[str] = []
    if expect == "ok":
        if types[:1] != ["system"]:
            fails.append(f"인사가 먼저 오지 않았다 {types}")
        if "message" not in types:
            fails.append(f"질문에 답하지 않았다 {types}")
        if r["close_code"] is not None:
            fails.append(f"닫혔다 {r['close_code']}")
        return fails
    want = {"failed": "auth_failed", "timeout": "auth_failed", "unavailable": "auth_unavailable"}[expect]
    if types != [want]:
        fails.append(f"받은 것 {types} ≠ [{want}]")   # 인사 · 답이 섞이면 안 된다
    code = server.CLOSE_AUTH_UNAVAILABLE if expect == "unavailable" else server.CLOSE_AUTH_FAILED
    if r["close_code"] != code:
        fails.append(f"닫는 코드 {r['close_code']} ≠ {code}")
    if expect == "timeout" and not (AUTH_TIMEOUT <= r["seconds"] < AUTH_TIMEOUT + 2):
        fails.append(f"닫힌 시각 {r['seconds']}초")
    if expect == "unavailable" and not r["got"][0].get("message"):
        fails.append("안내 문구가 없다")
    return fails


def run(only: set[str] | None = None) -> list[dict]:
    """평가 결과 꼴(run.py 의 results 와 같은 칸)로"""
    out = []
    for cid, desc, send, backend, expect in CASES:
        if only and cid not in only:
            continue
        ctx = fake_me() if backend == "fake" else no_backend()
        with ctx:
            r = asyncio.run(_session(send))
        fails = _check(expect, r)
        out.append({"id": cid, "cat": "login", "ok": not fails, "fails": fails, "warns": [], "q": desc,
                    "answer": json.dumps(r["got"], ensure_ascii=False), "links": [],
                    "trace": {"close_code": r["close_code"]}, "fallback": False, "seconds": r["seconds"]})
    return out


if __name__ == "__main__":
    import sys
    rs = run()
    for x in rs:
        print(f"{'PASS' if x['ok'] else 'FAIL'} {x['id']} {x['seconds']:4.1f}s {x['q']} {'; '.join(x['fails'])}")
    sys.exit(0 if all(x["ok"] for x in rs) else 1)
