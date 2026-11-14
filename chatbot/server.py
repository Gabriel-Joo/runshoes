"""웹소켓 챗봇 서버 — 작업 5-1(docs/09_chatbot_rag.md). 실행: python -m chatbot.server

로그인한 사람만 쓴다(docs/04_auth.md 4절 · 09 17절). 연결 직후 첫 메시지가 인증이다:
  받는 것  {"type": "auth", "token": "<access token>"}  → 같은 Pod 백엔드 GET /api/me(Bearer)로 확인
  통과하면 인사(system)를 보내고 질문을 받는다. 메시지마다 다시 확인하지 않는다
  401 · 인증이 아닌 첫 메시지 · AUTH_TIMEOUT 초 안에 아무것도 없음 → {"type": "auth_failed"} 뒤 닫는다
  백엔드에 닿지 않음 · 401 이 아닌 오류 → {"type": "auth_unavailable", "message": …} 뒤 닫는다(토큰 탓이 아니다)
토큰은 주소에 넣지 않고(ingress · Cloudflare 로그에 남는다) 로그에도 찍지 않는다.

받는 것  {"type": "message", "message": "…"}
보내는 것 {"type": "system" | "message", "message": "…", "links": [{"label": "보러 가기", "href": "/?shoe=1"}], "time": "HH:MM:SS"}
같은 Pod 의 Spring(127.0.0.1:3000, RUNSHOES_API)과 Ollama(OLLAMA_URL)를 부른다.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime

import websockets

from . import http
from .bot import Bot, State
from .prompt import GREETING
from .search import embed
from .search.service import Searcher

FALLBACK_ERROR = "지금은 답을 만들지 못했어요. 잠시 뒤에 다시 물어봐 주세요."
AUTH_TIMEOUT = 10   # 초 — 화면은 연결되자마자 보낸다. 느린 모바일 망에서도 넉넉하고, 붙기만 하고 말 없는 연결은 오래 두지 않는다
AUTH_UNAVAILABLE = "지금은 챗봇에 연결하지 못했어요. 잠시 뒤 창을 닫았다가 다시 열어 주세요."
# 닫는 코드(화면은 코드가 아니라 앞서 보낸 프레임으로 가른다 — 기록 · 디버깅용)
CLOSE_AUTH_FAILED, CLOSE_AUTH_UNAVAILABLE = 4401, 4503


def now() -> str:
    return datetime.now().strftime("%H:%M:%S")


def payload(kind: str, text: str, links: list | None = None) -> str:
    return json.dumps({"type": kind, "username": "챗봇", "message": text, "links": links or [], "time": now()}, ensure_ascii=False)


async def authenticate(websocket, timeout: float, state: State | None = None) -> bool:
    """첫 메시지로 로그인 확인. 실패면 알리는 프레임을 보내고 닫은 뒤 False. 통과하면 state.user_id 에 계정 id(턴 기록용)"""
    async def fail(kind: str, reason: str, code: int, message: str = "") -> bool:
        print(f"[{now()}] 챗봇 인증 실패 — {reason}")
        await websocket.send(json.dumps({"type": kind, "reason": reason, "message": message}, ensure_ascii=False))
        await websocket.close(code, reason)
        return False

    try:
        raw = await asyncio.wait_for(websocket.recv(), timeout)
    except asyncio.TimeoutError:
        return await fail("auth_failed", "timeout", CLOSE_AUTH_FAILED)
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        data = None
    token = data.get("token") if isinstance(data, dict) and data.get("type") == "auth" else None
    if not isinstance(token, str) or not token.strip():
        return await fail("auth_failed", "no_auth", CLOSE_AUTH_FAILED)   # 확인 전에 온 질문은 받지 않는다
    token = token.strip()
    if len(token) > 4096 or any(c.isspace() or not c.isprintable() for c in token):
        # 헤더에 실을 수 없는 꼴 — 요청이 예외로 빠져 "백엔드 안 뜸"으로 잘못 갈리지 않게 여기서 막는다
        return await fail("auth_failed", "malformed", CLOSE_AUTH_FAILED)
    status, uid = await asyncio.get_running_loop().run_in_executor(None, http.me_user_id, token)
    if status == 200:
        if state is not None:
            state.user_id = uid
        return True
    if status == 401:
        return await fail("auth_failed", "invalid", CLOSE_AUTH_FAILED)
    # 백엔드가 아직 안 떴거나(배포 직후 — 같은 Pod 라 챗봇이 먼저 뜰 수 있다) 5xx — 토큰 탓으로 돌리지 않는다
    return await fail("auth_unavailable", f"me {status}", CLOSE_AUTH_UNAVAILABLE, AUTH_UNAVAILABLE)


async def handler(websocket, bot: Bot, auth_timeout: float | None = None):
    # conn_id — 턴 기록(V19)이 한 대화를 묶는 id. 연결마다 새 무작위 값(uuid4 32자). 토큰 · 계정에서 만들지 않는다 —
    # 다시 연결하면 대화 상태도 사라지므로(bot.State) 「한 연결 = 한 대화」로 본다(사용자 2026-11-14)
    state = State(conn_id=uuid.uuid4().hex)
    print(f"[{now()}] 챗봇 접속됨")
    try:
        if not await authenticate(websocket, AUTH_TIMEOUT if auth_timeout is None else auth_timeout, state):
            return
    except websockets.exceptions.ConnectionClosed:
        print(f"[{now()}] 챗봇 연결 종료(인증 전)")
        return
    await websocket.send(payload("system", GREETING))
    loop = asyncio.get_running_loop()
    try:
        async for raw in websocket:
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if not isinstance(data, dict) or data.get("type") != "message":   # 객체가 아닌 JSON 에 연결이 끊기지 않게
                continue
            text = str(data.get("message", "")).strip()[:500]
            if not text:
                continue
            try:
                reply, trace = await loop.run_in_executor(None, bot.turn, state, text)
                print(f"[{now()}] {json.dumps(trace, ensure_ascii=False)} fallback={reply.fallback_used}")
                await websocket.send(payload("message", reply.text, reply.links()))
            except Exception as e:   # noqa: BLE001 — 한 턴이 실패해도 연결은 남긴다
                print(f"[{now()}] 실패: {e!r}")
                await websocket.send(payload("message", FALLBACK_ERROR))
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        print(f"[{now()}] 챗봇 연결 종료")


async def main():
    # 색인은 뒤에서 만든다 — 포트는 바로 연다(준비 전에는 경험·후기만 "잠시 뒤", 5-2 사용자 6)
    # MODEL_SERVICE_URL 이 없으면 색인 없이 뜬다 — 경험·후기는 늘 "잠시 뒤", 특성 설명은 사전만(시작은 실패하지 않는다)
    searcher = None
    if embed.URL:
        searcher = Searcher()
        searcher.start()
    else:
        print("[search] MODEL_SERVICE_URL 이 없다 — 색인을 만들지 않는다(경험·후기는 '잠시 뒤')")
    bot = Bot(searcher=searcher)
    host, port = "0.0.0.0", 8766
    async with websockets.serve(lambda ws: handler(ws, bot), host, port):
        print(f"챗봇 서버 실행 중: ws://{host}:{port}")
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n서버를 종료합니다.")
