"""웹소켓 챗봇 서버 — 작업 5-1(docs/09_chatbot_rag.md). 실행: python -m chatbot.server

받는 것  {"type": "message", "message": "…"}
보내는 것 {"type": "system" | "message", "message": "…", "links": [{"label": "보러 가기", "href": "/?shoe=1"}], "time": "HH:MM:SS"}
같은 Pod 의 Spring(127.0.0.1:3000, RUNSHOES_API)과 Ollama(OLLAMA_URL)를 부른다.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime

import websockets

from .bot import Bot, State
from .prompt import GREETING
from .search import embed
from .search.service import Searcher

FALLBACK_ERROR = "지금은 답을 만들지 못했어요. 잠시 뒤에 다시 물어봐 주세요."


def now() -> str:
    return datetime.now().strftime("%H:%M:%S")


def payload(kind: str, text: str, links: list | None = None) -> str:
    return json.dumps({"type": kind, "username": "챗봇", "message": text, "links": links or [], "time": now()}, ensure_ascii=False)


async def handler(websocket, bot: Bot):
    state = State()
    print(f"[{now()}] 챗봇 접속됨")
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
