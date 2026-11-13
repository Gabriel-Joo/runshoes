"""챗봇 로그인 문턱 — 실제 server.handler + 가짜 /api/me(127.0.0.1, 네트워크 밖으로 나가지 않는다). 문항은 chatbot/eval/login.py"""

import unittest

from chatbot.eval import login


class LoginTest(unittest.TestCase):
    def test_cases(self):
        for r in login.run():
            with self.subTest(r["id"], q=r["q"]):
                self.assertTrue(r["ok"], r["fails"])


if __name__ == "__main__":
    unittest.main()
