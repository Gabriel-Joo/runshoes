"""
웹소켓 AI 챗봇 서버 (러닝화 용어 설명)
--------------------------------
설치: pip install websockets requests
실행: python chatbot_server.py
"""

import asyncio
import json
import requests
import websockets
from datetime import datetime
import os

CF_ACCESS_CLIENT_ID = os.environ.get("CF_ACCESS_CLIENT_ID", "")
CF_ACCESS_CLIENT_SECRET = os.environ.get("CF_ACCESS_CLIENT_SECRET", "")

OLLAMA_URL = "https://ollama.ronanlab.dev"

SYSTEM_PROMPT = """너는 러닝화 스펙 아카이브 사이트 "RUNSHOES"의 친근한 챗봇 도우미야.
말투는 반말로, 친구한테 편하게 설명하듯이 답해줘.

중요한 규칙:
- 답변은 반드시 3~4문장 이내로 짧게 해줘. 길게 늘어놓지 마.
- 이모지는 1~2개만 자연스럽게 써. 남발하지 마.
- 예시나 목록(불릿포인트)은 꼭 필요할 때만, 최대 2개까지만 써.
- 되묻는 질문은 답변 끝에 최대 1개만.
- 장황한 설명 대신 핵심만 간결하게 말해줘."""


def now():
    return datetime.now().strftime("%H:%M:%S")


def ask_ollama(history, message):
    """대화 기록 + 새 질문을 Ollama에 보내서 답변 받기"""
    history_text = "\n".join(
        f"{'사용자' if h['role'] == 'user' else '챗봇'}: {h['content']}"
        for h in history[-6:]  # 최근 6턴만 유지
    )

    prompt = f"""{SYSTEM_PROMPT}

{f"이전 대화:\n{history_text}\n" if history_text else ""}
사용자: {message}
챗봇:"""

    response = requests.post(
        f"{OLLAMA_URL}/api/generate",
        json={
            "model": "gemma4:e4b",
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.6, 
                "top_p": 0.9, 
                "repeat_penalty": 1.2
                },
        },
        headers={
            "CF-Access-Client-Id": CF_ACCESS_CLIENT_ID,
            "CF-Access-Client-Secret": CF_ACCESS_CLIENT_SECRET,
        },
        timeout=40,
    )
    return response.json()["response"].strip()


async def handler(websocket):
    history = []  # 이 연결(=이 사람)만의 대화 기록
    print(f"[{now()}] 챗봇 접속됨")

    await websocket.send(json.dumps({
        "type": "system",
        "message": "안녕! 나는 러닝화 도우미 챗봇이야. 궁금한 거 편하게 물어봐~",
        "time": now(),
    }, ensure_ascii=False))

    try:
        async for raw in websocket:
            data = json.loads(raw)

            if data.get("type") == "message":
                text = data.get("message", "").strip()
                if not text:
                    continue

                print(f"[{now()}] 질문: {text}")

                # Ollama에 물어보기 (동기 함수라 스레드로 돌려서 다른 연결 안 막히게)
                loop = asyncio.get_event_loop()
                try:
                    reply = await loop.run_in_executor(None, ask_ollama, history, text)
                except Exception as e:
                    reply = f"미안, 지금 답변을 못 만들었어. ({e})"

                history.append({"role": "user", "content": text})
                history.append({"role": "bot", "content": reply})

                await websocket.send(json.dumps({
                    "type": "message",
                    "username": "챗봇",
                    "message": reply,
                    "time": now(),
                }, ensure_ascii=False))

    except websockets.exceptions.ConnectionClosed:
        pass
    except json.JSONDecodeError:
        pass
    finally:
        print(f"[{now()}] 챗봇 연결 종료")


async def main():
    host, port = "0.0.0.0", 8766  # 컨테이너 안에서 외부 접근 가능하게
    async with websockets.serve(handler, host, port):
        print(f"챗봇 서버 실행 중: ws://{host}:{port}")
        print("종료하려면 Ctrl+C")
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n서버를 종료합니다.")