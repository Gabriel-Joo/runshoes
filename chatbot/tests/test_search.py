"""검색 · 집계 시험(작업 5-2) — 네트워크 없이. 임베딩은 가짜(글자 묶음 해시 벡터), LLM 분류는 주입한다.

python -m unittest discover -s chatbot/tests -t .
"""

import hashlib
import os
import tempfile
import unittest

import numpy as np

from chatbot.branches import experience as ex
from chatbot.router import rule_branch
from chatbot.search import corpus
from chatbot.search.bm25 import BM25, tokens
from chatbot.search.index import Hit, like_rerank, rank_shoes, rrf
from chatbot.search.memory import MemoryIndex
from chatbot.search.service import Searcher

SHOES = [
    {"id": 1, "brand": "아식스", "model": "노바블라스트 6", "generation": 6, "isCurrent": True, "purpose": "조깅·회복주", "stability": "중립화",
     "description": "노바블라스트는 아식스의 데일리 트레이너입니다. 쿠션 높이는 41.5mm로 높습니다. 와이드 모델도 나옵니다."},
    {"id": 2, "brand": "호카", "model": "클리프톤", "generation": None, "isCurrent": True, "purpose": "조깅·회복주", "stability": "중립화",
     "description": "클리프톤은 가벼운 쿠션화다. 발볼은 보통이다."},
]
REVIEWS = [
    {"id": 10, "shoeId": 1, "rating": 5, "content": "무릎이 편해요.", "likeCount": 3, "createdAt": "2026-01-01"},
    {"id": 11, "shoeId": 1, "rating": 2, "content": "오래 뛰면 무릎이 아파요.", "likeCount": 9, "createdAt": "2026-01-02"},
    {"id": 12, "shoeId": 1, "rating": 4, "content": "발볼이 넉넉해요.", "likeCount": 0, "createdAt": "2026-01-03"},
    {"id": 13, "shoeId": 2, "rating": 4, "content": "가벼워요.", "likeCount": 1, "createdAt": "2026-01-04"},
    {"id": 14, "shoeId": 99, "rating": 4, "content": "목록에 없는 신발", "likeCount": 1, "createdAt": "2026-01-04"},
]


def fake_vec(text: str) -> np.ndarray:
    """2-gram 마다 정해진 자리에 1 — 글자가 겹칠수록 가깝다(정규화)"""
    v = np.zeros(1024, dtype=np.float32)
    for t in tokens(text):
        v[int(hashlib.md5(t.encode()).hexdigest(), 16) % 1024] += 1
    n = np.linalg.norm(v)
    return v / n if n else v


class FakeEmbedder:
    def __init__(self, key="m@1"):
        self.key = key
        self.calls = 0

    def model_key(self):
        return self.key

    def embed(self, texts):
        self.calls += len(texts)
        return np.stack([fake_vec(t) for t in texts]) if texts else np.zeros((0, 1024), dtype=np.float32)

    def embed_one(self, text):
        return fake_vec(text)


def searcher(reviews=REVIEWS, **kw):
    data = {"r": list(reviews)}
    s = Searcher(embedder=FakeEmbedder(), fetch=lambda: (SHOES, data["r"]), **kw)
    return s, data


class CorpusTest(unittest.TestCase):
    def test_split_keeps_decimal(self):
        self.assertEqual(corpus.split_sentences("높이는 41.5mm로 높습니다. 와이드 모델도 나옵니다."),
                         ["높이는 41.5mm로 높습니다.", "와이드 모델도 나옵니다."])
        self.assertEqual(corpus.split_sentences("가볍다.발볼은 보통이다."), ["가볍다.", "발볼은 보통이다."])

    def test_docs_and_header(self):
        docs = corpus.build(SHOES, REVIEWS)
        ids = [d.doc_id for d in docs]
        self.assertIn("desc:1:1", ids)
        self.assertIn("rev:10", ids)
        self.assertNotIn("rev:14", ids)                               # 목록에 없는 신발의 리뷰는 넣지 않는다
        d = next(d for d in docs if d.doc_id == "rev:10")
        self.assertEqual(d.text, "무릎이 편해요.")                     # BM25 는 본문만
        self.assertEqual(d.embed_text, "[아식스 노바블라스트 6 · 조깅·회복주] 무릎이 편해요.")   # 세대가 이름 끝에 있으면 덧붙이지 않는다
        self.assertEqual(d.meta["like_count"], 3)
        self.assertEqual(corpus.header({**SHOES[1], "generation": 3}), "[호카 클리프톤 3세대 · 조깅·회복주]")


class RankTest(unittest.TestCase):
    def test_rrf(self):
        s = rrf([[1, 2], [2, 3]])
        self.assertAlmostEqual(s[2], 1 / 62 + 1 / 61)
        self.assertGreater(s[2], s[1])

    def test_like_rerank_uses_current_max(self):
        hits = [Hit("a", "review", 1, "", {"like_count": 0}, 1.0), Hit("b", "review", 2, "", {"like_count": 4}, 0.9)]
        out = like_rerank(hits)
        self.assertEqual(out[0].doc_id, "b")                           # 0.9×0.8 + 1×0.2 = 0.92 > 0.8
        self.assertAlmostEqual(out[0].final, 0.9 * 0.8 + 0.2)
        self.assertEqual(rank_shoes(out)[0][0], 2)

    def test_bm25_bigram(self):
        bm = BM25(["발볼이 넓어요", "무릎이 편해요"])
        self.assertEqual(max(bm.scores("발볼 넓은").items(), key=lambda kv: kv[1])[0], 0)


class IndexTest(unittest.TestCase):
    def test_sync_only_changed(self):
        s, data = searcher()
        first = s.sync()
        self.assertTrue(s.ready)
        self.assertEqual(first["embedded"], first["docs"])
        self.assertEqual(s.sync()["embedded"], 0)                      # 바뀐 것 없음
        data["r"] = [r if r["id"] != 10 else {**r, "content": "무릎이 아주 편해요."} for r in REVIEWS[:4]]
        third = s.sync()
        self.assertEqual((third["embedded"], third["deleted"]), (1, 0))
        data["r"] = REVIEWS[:2]
        self.assertEqual(s.sync()["deleted"], 2)
        self.assertNotIn("rev:12", s.index.ids_with_hash())

    def test_search_filter(self):
        s, _ = searcher()
        s.sync()
        hits = s.search("무릎 아파요", 5, {"kind": "review"})
        self.assertEqual(hits[0].doc_id, "rev:11")
        self.assertTrue(all(h.kind == "review" for h in hits))
        self.assertEqual({h.shoe_id for h in s.search("가벼워요", 5, {"shoe_id": 2})}, {2})

    def test_model_change_rebuilds(self):
        s, _ = searcher()
        s.sync()
        s.embedder.key = "m@2"
        self.assertEqual(s.sync()["embedded"], len(s.index))

    def test_file_cache(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "index.npz")
            a, _ = searcher(cache_path=path)
            a.sync()
            b, _ = searcher(cache_path=path)
            r = b.sync()
            self.assertEqual((r["embedded"], r["from_cache"]), (0, len(b.index)))   # 다시 임베딩하지 않는다
            c = Searcher(embedder=FakeEmbedder("other@9"), fetch=lambda: (SHOES, REVIEWS), cache_path=path)
            self.assertEqual(c.sync()["from_cache"], 0)                             # 모델이 다르면 버린다


class TallyTest(unittest.TestCase):
    def tally(self, labels):
        s, _ = searcher()
        s.sync()
        t = ex.Tally(SHOES[0], [r for r in REVIEWS if r["shoeId"] == 1], "무릎")
        ex.label([t], "무릎", "무릎 괜찮아요?", fake_vec("무릎 괜찮아요?"), s, lambda a, q, cs: labels(cs))
        return t

    def test_counts_sum_to_n(self):
        t = self.tally(lambda cs: ["positive" if "편해" in c else "negative" if "아파" in c else "none" for c in cs])
        self.assertEqual((t.n, t.k, t.pos, t.neg), (3, 2, 1, 1))
        self.assertTrue(t.check())
        lines = ex.summary_lines(t)
        self.assertEqual(lines, ["리뷰 근거가 많지 않아요 — 3건 중 2건에서만 나온 이야기예요.", "하나는 좋다는, 하나는 아쉽다는 이야기였어요."])

    def test_wording(self):
        t = ex.Tally(SHOES[0], [{"id": i, "content": "무릎", "likeCount": i} for i in range(14)], "무릎")
        t.labeled = True
        t.labels = {0: "positive", 1: "positive", 2: "positive", 3: "negative", 4: "negative"}
        # 5차 수정 — "나머지 N건은 언급 없음"을 빼고 좋다 · 아쉽다로
        self.assertEqual(ex.summary_lines(t), ["리뷰 14건 중 무릎 이야기가 5건이고, 그중 좋다는 쪽이 3건 아쉽다는 쪽이 2건이에요."])
        t.labels = {0: "positive", 1: "positive", 2: "positive"}
        self.assertEqual(ex.summary_lines(t), ["리뷰 14건 중 무릎 이야기가 3건이고, 모두 좋다는 쪽이에요."])
        t.labels = {0: "negative", 1: "negative", 2: "negative"}
        self.assertEqual(ex.summary_lines(t), ["리뷰 14건 중 무릎 이야기가 3건이고, 모두 아쉽다는 쪽이에요."])
        t.labels = {}
        self.assertEqual(ex.summary_lines(t), ["이 신발 리뷰 14건 가운데 그 부분을 말한 리뷰는 없었어요."])

    def test_classify_failure_counts_words_only(self):
        def boom(cs):
            raise ValueError("x")
        t = self.tally(boom)
        self.assertFalse(t.labeled)
        self.assertEqual(t.k, 2)
        self.assertEqual(ex.summary_lines(t), ["리뷰 3건 중 무릎 이야기가 나온 리뷰는 2건이에요."])

    def test_quote_most_liked(self):
        t = self.tally(lambda cs: ["positive" if "편해" in c else "negative" if "아파" in c else "none" for c in cs])
        self.assertEqual(ex.quote(t), ("무릎을 말한 리뷰 가운데 가장 많은 추천을 받은 리뷰예요.", "> 오래 뛰면 무릎이 아파요.", 11))
        # 찾는 쪽이 긍정이면 긍정 리뷰에서(추천 3 — 그 무리에서 가장 많다)
        self.assertEqual(ex.quote(t, "positive"), ("무릎을 말한 리뷰 중 좋다는 쪽에서, 가장 많은 추천을 받은 리뷰예요.", "> 무릎이 편해요.", 10))
        self.assertEqual(ex.INTRO[("negative", False)].format(a="통증을"), "통증을 말한 리뷰 중 아쉽다는 쪽의 한 건이에요.")

    def test_quote_block_lines(self):
        # 관점 문장 + (짧으면) 다음 문장 — 짧은 꼬리 "실망."은 앞 줄에(3차 수정)
        self.assertEqual(ex.quote_block("앞은 넉넉한데 뒤꿈치가 넓어서 계속 헐떡임. 끈 조여도 물집 생김. 실망.", ("물집",)),
                         "> 끈 조여도 물집 생김. 실망.")
        # 관점과 상관없는 문장은 빼고 관점 문장만(E13 가이드 19)
        self.assertEqual(ex.quote_block("발이 좁아 반 업했어요. 안정감은 좋아요. 갑피도 두툼해서 한여름엔 발이 금방 더워지고요. 발볼은 보통이에요.", ("더워",)),
                         "> 갑피도 두툼해서 한여름엔 발이 금방 더워지고요.")
        # 관점 문장이 짧으면 다음 문장이 뜻을 잇는다(E11 님버스 28)
        self.assertEqual(ex.quote_block("발이 넓어 와이드로 신습니다. 롱런 후반에도 발이 편해요. 다만 반발은 아쉬워요.", ("와이드",)),
                         "> 발이 넓어 와이드로 신습니다.\n> 롱런 후반에도 발이 편해요.")

    def test_evidence_has_no_numbers(self):
        # 근거 — 쪽마다 리뷰 원문만, 건수 · 별점 · 추천 수 없이(5차 수정 1-1). 인용한 리뷰(1)는 shown_ids 에서 빠져 줄에 없다
        t = ex.Tally(SHOES[0], [{"id": 1, "content": "무릎이 편하고 쿠션이 좋아요", "likeCount": 2, "rating": 5},
                                {"id": 2, "content": "무릎 편해요. 쿠션 말랑", "likeCount": 1, "rating": 4},
                                {"id": 3, "content": "무릎이 아파요", "likeCount": 0, "rating": 2}], "무릎")
        t.labeled, t.labels = True, {1: "positive", 2: "positive", 3: "negative"}
        lines = ex.evidence(t, t.mentioned(), {2, 3}, "무릎", ())
        self.assertEqual(lines, ["[무릎 — 좋다는 쪽 리뷰]", "- 무릎 편해요. 쿠션 말랑", "[무릎 — 아쉽다는 쪽 리뷰]", "- 무릎이 아파요"])
        self.assertFalse(any(ch.isdigit() for ch in "".join(lines)))

    def test_theme_groups(self):
        # 관점 없는 질문 — 낱말로 주제 셋, 주제마다 아직 쓰지 않은 리뷰, 착용감은 주제가 아니다(7차 수정)
        rs = [{"id": 1, "content": "쿠션이 푹신하고 발볼도 넉넉해요"}, {"id": 2, "content": "쿠션이 단단해요"},
              {"id": 3, "content": "발볼이 좁아요"}, {"id": 4, "content": "무게가 가벼워요"}, {"id": 5, "content": "접지가 좋아요"},
              {"id": 6, "content": "발이 편해요"}, {"id": 7, "content": "쿠션 좋고 가벼워요"}]
        groups = ex.theme_groups(rs)
        self.assertEqual([g for g, _ in groups], ["쿠션", "발볼", "무게"])        # 쿠션 3 · 발볼 2 · 무게 2(접지 1은 셋 밖)
        # 주제마다 둘까지 — 1은 쿠션에만(발볼에 다시 넣지 않는다), 7은 쿠션 자리가 차서 무게로
        self.assertEqual([[r["id"] for r in m] for _, m in groups], [[1, 2], [3], [4, 7]])
        lines = ex.evidence(ex.Tally(SHOES[0], rs, None), rs, {r["id"] for r in rs}, None, ())
        self.assertEqual(lines[0], "[쿠션 이야기]")
        self.assertFalse(any(ch.isdigit() for ch in "".join(lines)))

    def test_digit_sentences(self):
        # LLM 글에서 숫자가 든 문장만 지운다 — 신발 이름의 숫자는 숫자로 보지 않는다(5차 수정)
        from chatbot.reply import drop_digit_sentences, name_forms
        names = name_forms({"model": "젤 카야노 33", "modelEn": "Gel-Kayano 33", "modelAlias": ""})
        self.assertIn("카야노 33", names)
        self.assertNotIn("33", names)
        text = "카야노 33은 무릎이 편하다는 이야기가 있어요. 10km 넘게 뛰어도 편하다는 이야기도 있어요.\n\n다른 리뷰에서는 무겁다는 이야기가 있어요."
        self.assertEqual(drop_digit_sentences(text, names), "카야노 33은 무릎이 편하다는 이야기가 있어요.\n\n다른 리뷰에서는 무겁다는 이야기가 있어요.")
        self.assertEqual(drop_digit_sentences("33건이 있어요.", names), "")
        # 6차 수정 3 — 근거 리뷰에 있는 숫자는 둔다, 건수("N건")와 리뷰에 없는 숫자는 지운다
        src = "- 9월에도 발이 너무 더워요\n- 10km 넘게 뛰어도 편해요"
        self.assertEqual(drop_digit_sentences(text, names, src), text)
        self.assertEqual(drop_digit_sentences("9월에도 덥다는 이야기가 있어요. 255g이라 가볍다는 이야기도 있어요.", names, src),
                         "9월에도 덥다는 이야기가 있어요.")
        self.assertEqual(drop_digit_sentences("이런 이야기가 10건 있어요.", names, src), "")

    def test_haeyo_general(self):
        # 설명문을 코드가 그대로 붙이게 되어(5차 수정 1-2) 일반 규칙으로 — 받침 ㅆ · ㅂ 불규칙 · 모음 어울림 · 르 · ㅅ · ㄹ 탈락
        from chatbot.reply import haeyo
        pairs = {"늘었습니다.": "늘었어요.", "가볍습니다.": "가벼워요.", "좁습니다.": "좁아요.", "않습니다.": "않아요.",
                 "적습니다.": "적어요.", "버팁니다.": "버텨요.", "됩니다.": "돼요.", "다릅니다.": "달라요.", "튑니다.": "튀어요.",
                 "낫습니다.": "나아요.", "깁니다.": "길어요.", "돕습니다.": "도와요.", "씁니다.": "써요.", "모델입니다.": "모델이에요."}
        for a, b in pairs.items():
            self.assertEqual(haeyo("발볼은 " + a), "발볼은 " + b)


class PickShoesTest(unittest.TestCase):
    """1차 수정(사용자 2026-11-13) — 찾는 쪽 건수 순 · 반대가 많은 신발 빼기 · 피하려는 질문"""
    def t(self, sid, pos, neg, n=20):
        t = ex.Tally({"id": sid, "brand": "b", "model": f"m{sid}"}, [{"id": i, "content": "", "likeCount": 0} for i in range(n)], "발볼")
        t.labeled = True
        t.labels = {**{i: "positive" for i in range(pos)}, **{100 + i: "negative" for i in range(neg)}}
        return t

    def test_find_positive(self):
        out = ex.pick_shoes([self.t(1, 2, 0), self.t(2, 6, 7), self.t(3, 5, 1), self.t(4, 0, 0)], "positive", False)
        self.assertEqual([x.shoe["id"] for x in out], [3, 1])          # 6:7(부정이 많음) · 0건은 뺀다, 긍정 건수 순

    def test_avoid_keeps_negative_only(self):
        out = ex.pick_shoes([self.t(1, 1, 2), self.t(2, 2, 0), self.t(3, 1, 1)], "negative", True)
        self.assertEqual([x.shoe["id"] for x in out], [1])             # 긍정 리뷰 신발 · 같은 수는 뺀다

    def test_unknown_side_keeps_order(self):
        out = ex.pick_shoes([self.t(1, 0, 3), self.t(2, 3, 0)], None, False)
        self.assertEqual([x.shoe["id"] for x in out], [1, 2])

    def test_with_doctor_at_front(self):
        # 의료 안내는 맨 앞, "다만" 없이(4차 수정 — 끝에 두면 인사 · 물음표 뒤에 왔다)
        from chatbot.prompt import DOCTOR
        from chatbot.reply import with_doctor
        self.assertEqual(with_doctor("본문.\n\n보러 가실래요?", True), f"{DOCTOR}\n\n본문.\n\n보러 가실래요?")
        self.assertEqual(with_doctor("본문.", False), "본문.")
        self.assertFalse(DOCTOR.startswith("다만"))

    def test_embedder_needs_url(self):
        from chatbot.search.embed import Embedder
        with self.assertRaises(ValueError):
            Embedder(url="")


class AspectRouteTest(unittest.TestCase):
    def test_aspect(self):
        self.assertEqual(ex.aspect_of("노바블라스트 6 신으면 무릎 아파요?"), "무릎")
        self.assertEqual(ex.aspect_of("발볼 끼어요?"), "발볼")
        self.assertIsNone(ex.aspect_of("후기 어때요"))
        self.assertFalse(ex.mentions_by_words("통증", "5분 30초 언저리로 천천히"))    # "저리"가 "언저리"에 걸리지 않게

    def test_strip_names(self):
        self.assertEqual(ex.strip_names("노바블라스트 6 무릎 괜찮아요?", [SHOES[0]]), "무릎 괜찮아요?")

    def test_rule(self):
        self.assertEqual(rule_branch("클리프톤 후기 어때요", 1, 0, 0), "experience")
        self.assertEqual(rule_branch("무릎 편하다는 리뷰 있는 신발", 0, 0, 0), "experience")
        self.assertEqual(rule_branch("노바블라스트 6 발볼 끼어요?", 1, 0, 0), "experience")
        self.assertEqual(rule_branch("노바블라스트 6 발볼 어때요?", 1, 0, 0), "spec")        # 스펙 낱말만이면 스펙
        self.assertIsNone(rule_branch("무릎이 아파요", 0, 0, 0))                                # 신발 없는 통증은 LLM 이
        self.assertEqual(rule_branch("발볼 넓은데 추천해 줘 후기 좋은 걸로", 0, 0, 0), "recommend")


if __name__ == "__main__":
    unittest.main()
