"""턴 기록(V19 chatbot_turns) — 네트워크 없이(가짜 /api/me 만 127.0.0.1). python -m unittest discover -s chatbot/tests -t .

기록이 실패하거나 느려도 답은 그대로 · 곧바로 나가는지, 칸이 실제 값으로 차는지, 단계 시간이 겹쳐 세지지 않는지 본다.
"""

import asyncio
import json
import threading
import time
import unittest

from chatbot import http, server, timing
from chatbot.bot import Bot, State, record_turn
from chatbot.catalog import Catalog
from chatbot.prompt import GREETING
from chatbot.tests.test_rules import SHOES, TERMS


def greeting_ask(delay: float = 0.0):
    def ask(text, history):
        if delay:
            with timing.stage("gen"):   # 라우터 안의 LLM — router 로만 세져야 한다
                time.sleep(delay)
        return {"branch": "greeting", "health_context": False}
    return ask


def make_bot(log_turn, ask=None, load=None):
    cat = Catalog(SHOES, TERMS)
    return Bot(load=load or (lambda: cat), ask=ask or greeting_ask(), post=lambda body: None, log_turn=log_turn)


class TurnRecordTest(unittest.TestCase):
    def test_fields(self):
        got = []
        done = threading.Event()
        bot = make_bot(lambda b: (got.append(b), done.set()), ask=greeting_ask(0.05))
        st = State(conn_id="c" * 32, user_id=7)
        reply, trace = bot.turn(st, "안녕하세요")
        self.assertTrue(done.wait(2))
        b = got[0]
        self.assertEqual(reply.text, GREETING)
        self.assertEqual((b["connId"], b["userId"], b["question"], b["answer"]), ("c" * 32, 7, "안녕하세요", GREETING))
        self.assertEqual(b["branch"], "greeting")
        self.assertEqual((b["byRule"], b["llmOk"], b["health"], b["fallbackUsed"], b["shoeCount"]), (False, True, False, False, 0))
        self.assertGreaterEqual(b["routerMs"], 45)              # 라우터 안의 LLM 시간은 router 로
        self.assertEqual((b["searchMs"], b["genMs"]), (0, 0))   # gen 으로 두 번 세지 않는다
        self.assertGreaterEqual(b["latencyMs"], b["routerMs"])
        self.assertEqual(trace["ms"]["router_ms"], b["routerMs"])

    def test_failing_write_does_not_block_answer(self):
        def boom(body):
            raise RuntimeError("DB 꺼짐")
        reply, _ = make_bot(boom).turn(State(conn_id="a" * 32), "안녕하세요")
        self.assertEqual(reply.text, GREETING)

    def test_slow_write_does_not_delay_answer(self):
        t0 = time.perf_counter()
        reply, _ = make_bot(lambda b: time.sleep(3)).turn(State(conn_id="a" * 32), "안녕하세요")
        self.assertLess(time.perf_counter() - t0, 1.0)
        self.assertEqual(reply.text, GREETING)

    def test_unreachable_backend_is_swallowed(self):
        # 기본 길(같은 Pod 백엔드) — 닿지 않는 주소면 스레드 안에서 실패만 찍는다
        old = http.API
        http.API = "http://127.0.0.1:9"
        try:
            t0 = time.perf_counter()
            record_turn({"connId": "x"})
            self.assertLess(time.perf_counter() - t0, 0.5)
        finally:
            http.API = old

    def test_error_turn_is_recorded(self):
        got = []
        done = threading.Event()

        def broken_load():
            raise RuntimeError("API 안 됨")
        bot = make_bot(lambda b: (got.append(b), done.set()), load=broken_load)
        with self.assertRaises(RuntimeError):
            bot.turn(State(conn_id="e" * 32), "노바블라스트 무게")
        self.assertTrue(done.wait(2))
        self.assertEqual((got[0]["branch"], got[0]["answer"]), ("error", ""))


class TimingTest(unittest.TestCase):
    def test_nested_counts_outer_only(self):
        timing.begin()
        with timing.stage("router"):
            with timing.stage("gen"):
                time.sleep(0.02)
        with timing.stage("search"):
            time.sleep(0.01)
        ms = timing.take()
        self.assertGreaterEqual(ms["router_ms"], 15)
        self.assertGreaterEqual(ms["search_ms"], 8)
        self.assertEqual(ms["gen_ms"], 0)

    def test_without_begin_measures_nothing(self):
        timing.take()
        with timing.stage("gen"):
            pass
        self.assertEqual(timing.take(), {f"{k}_ms": 0 for k in timing.STAGES})

    def test_api_stage_by_path(self):
        cases = {"/api/shoes": "catalog", "/api/terms": "catalog", "/api/compare": "compare", "/api/recommend": "recommend",
                 "/api/reviews": "review", "/api/shoes/12/summary": "summary", "/api/me": None, "/api/shoes/12": None}
        for path, want in cases.items():
            self.assertEqual(http.api_stage(path), want, path)

    def test_api_read_is_counted(self):
        # 가짜 Spring(127.0.0.1) — get_json 이 주소에 맞는 칸으로 센다
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

        class _H(BaseHTTPRequestHandler):
            def do_GET(self):  # noqa: N802
                time.sleep(0.02)
                body = b"{}"
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *a):
                pass
        srv = ThreadingHTTPServer(("127.0.0.1", 0), _H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        old = http.API
        http.API = f"http://127.0.0.1:{srv.server_address[1]}"
        try:
            timing.begin()
            http.get_json("/api/compare")
            http.get_json("/api/shoes/3/summary")
            ms = timing.take()
        finally:
            http.API = old
            srv.shutdown()
            srv.server_close()
        self.assertGreaterEqual(ms["compare_ms"], 15)
        self.assertGreaterEqual(ms["summary_ms"], 15)
        self.assertEqual((ms["catalog_ms"], ms["review_ms"], ms["recommend_ms"]), (0, 0, 0))


class ServerStateTest(unittest.TestCase):
    """server.handler 가 연결마다 conn_id 를 만들고, /api/me 의 계정 id 를 state 에 싣는다"""

    def test_conn_and_user(self):
        from chatbot.eval import login
        seen: list[State] = []

        class _Bot:
            def turn(self, state, text):
                seen.append(state)
                return login._Reply(), {"branch": "fake"}

        async def session():
            import websockets
            async with websockets.serve(lambda ws: server.handler(ws, _Bot(), auth_timeout=1), "127.0.0.1", 0) as srv:
                port = srv.sockets[0].getsockname()[1]
                for _ in range(2):
                    async with websockets.connect(f"ws://127.0.0.1:{port}") as ws:
                        await ws.send(json.dumps({"type": "auth", "token": login.DEMO_TOKEN}))
                        await ws.recv()   # 인사
                        await ws.send(json.dumps({"type": "message", "message": "안녕"}))
                        await ws.recv()   # 답

        with login.fake_me():
            asyncio.run(session())
        self.assertEqual(len(seen), 2)
        self.assertEqual([s.user_id for s in seen], [1, 1])   # 가짜 /api/me 가 {"id":1}
        self.assertTrue(all(len(s.conn_id) == 32 for s in seen))
        self.assertNotEqual(seen[0].conn_id, seen[1].conn_id)   # 연결마다 다르다


if __name__ == "__main__":
    unittest.main()
