"""카탈로그 캐시(09 19절) — 네트워크 없이. python -m unittest discover -s chatbot/tests -t .

판이 같으면 다시 읽지 않고, 판이 바뀌면 · 판을 묻지 못하면 새로 읽는다(낡은 카탈로그를 내지 않는다).
"""

import threading
import unittest

from chatbot import timing
from chatbot.catalog import Catalog, CatalogCache
from chatbot.tests.test_rules import SHOES, TERMS


class Source:
    """가짜 백엔드 — 판과 신발 목록을 바꿀 수 있다"""

    def __init__(self):
        self.ver = "1-1"
        self.shoes = [dict(s) for s in SHOES]
        self.fetches = 0
        self.down = False

    def version(self):
        if self.down:
            raise ConnectionError("백엔드 안 뜸")
        return self.ver

    def fetch(self):
        self.fetches += 1
        return Catalog([dict(s) for s in self.shoes], TERMS)


class CatalogCacheTest(unittest.TestCase):
    def setUp(self):
        self.src = Source()
        self.cache = CatalogCache(fetch=self.src.fetch, version=self.src.version)

    def test_same_version_reads_once(self):
        a = self.cache.get()
        b = self.cache.get()
        self.assertIs(a, b)
        self.assertEqual(self.src.fetches, 1)

    def test_changed_shoe_is_seen_on_next_turn(self):
        self.assertEqual(self.cache.get().by_id[1]["weight"], 298)
        self.src.shoes[0]["weight"] = 250   # 관리 화면에서 무게를 고쳤다 → DB 체크섬이 바뀐다
        self.src.ver = "2-1"
        self.assertEqual(self.cache.get().by_id[1]["weight"], 250)
        self.assertEqual(self.src.fetches, 2)

    def test_hidden_shoe_disappears(self):
        self.cache.get()
        self.src.shoes = [s for s in self.src.shoes if s["id"] != 5]   # 숨김 · 영구 삭제
        self.src.ver = "3-1"
        self.assertNotIn(5, self.cache.get().by_id)

    def test_version_failure_reads_fresh_every_turn(self):
        self.cache.get()
        self.src.down = True
        self.src.shoes[0]["weight"] = 111
        self.assertEqual(self.cache.get().by_id[1]["weight"], 111)   # 판을 모르면 낡은 것을 쓰지 않는다
        self.cache.get()
        self.assertEqual(self.src.fetches, 3)
        self.src.down = False
        self.cache.get()
        self.cache.get()
        self.assertEqual(self.src.fetches, 4)   # 판을 다시 알면 한 번 읽고 캐시

    def test_fetch_failure_raises_and_keeps_nothing_stale(self):
        self.cache.get()
        self.src.ver = "9-9"

        def broken():
            raise ConnectionError("x")
        self.cache.fetch = broken
        with self.assertRaises(ConnectionError):   # 턴은 실패한다(server 가 「지금은 답을 만들지 못했어요」) — 옛 카탈로그로 답하지 않는다
            self.cache.get()
        self.cache.fetch = self.src.fetch
        self.cache.get()
        self.assertEqual(self.src.fetches, 2)

    def test_concurrent_turns_read_once(self):
        out = []
        ts = [threading.Thread(target=lambda: out.append(self.cache.get())) for _ in range(8)]
        for t in ts:
            t.start()
        for t in ts:
            t.join()
        self.assertEqual(self.src.fetches, 1)
        self.assertTrue(all(c is out[0] for c in out))

    def test_time_goes_to_catalog(self):
        timing.begin()
        self.cache.get()
        ms = timing.take()
        self.assertEqual({k: v for k, v in ms.items() if k != "catalog_ms" and v}, {})


if __name__ == "__main__":
    unittest.main()
