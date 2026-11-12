"""네트워크 없이 도는 규칙 시험 — python -m unittest discover -s chatbot/tests -t .  (작업 5-1)"""

import unittest

from chatbot import facts, router
from chatbot.catalog import Catalog
from chatbot.prompt import DOCTOR
from chatbot.reply import Reply, guard, with_doctor
from chatbot.terms import Dictionary


def shoe(id, brand, model, gen, line, cur, **kw):
    base = {"id": id, "brand": brand, "model": model, "modelEn": None, "modelAlias": None, "generation": gen, "lineKey": line,
            "isCurrent": cur, "weight": None, "weightSize": None, "weightNorm270": None, "stackHeight": None, "drop": None, "price": None}
    base.update(kw)
    return base


SHOES = [
    shoe(1, "아식스", "젤 카야노 32", 32, "asics:gel-kayano", False, modelAlias="겔 카야노 32", weight=298, weightSize="M9", weightNorm270=298),
    shoe(2, "아식스", "젤 카야노 33", 33, "asics:gel-kayano", True),
    shoe(3, "호카", "마하 6", 6, "hoka:mach", False),
    shoe(4, "뉴발란스", "880 v15", 15, "newbalance:880", True, modelEn="Fresh Foam X 880 v15"),
    shoe(5, "브룩스", "레벨 8", 8, "brooks:revel", True),
    shoe(6, "뉴발란스", "레벨 v5", 5, "newbalance:rebel", True),
    shoe(7, "미즈노", "웨이브 스카이 9", 9, "mizuno:wave-sky", True),
    shoe(8, "아식스", "메타스피드 스카이 도쿄", None, "asics:metaspeed-sky-tokyo", True),
]
TERMS = [{"id": 1, "key": "drop", "name": "드롭", "short": "뒤꿈치와 앞꿈치의 높이 차이", "description": "드롭 설명입니다."},
         {"id": 4, "key": "neutral", "name": "중립화", "short": "", "description": "중립화 설명"},
         {"id": 5, "key": "stability", "name": "안정화", "short": "", "description": "안정화 설명"}]


class CatalogTest(unittest.TestCase):
    def setUp(self):
        self.c = Catalog(SHOES, TERMS)

    def ids(self, q):
        return [(m.shoe or {}).get("id") for m in self.c.find(q)]

    def test_generation(self):
        self.assertEqual(self.ids("젤 카야노 32 무게"), [1])
        m = self.c.find("카야노 무게")[0]
        self.assertEqual((m.shoe["id"], m.generation_note), (2, True))       # 현행 · "33세대 기준이에요"

    def test_no_current_line_picks_highest(self):
        m = self.c.find("마하")[0]
        self.assertEqual((m.shoe["id"], m.generation_note), (3, False))      # 현행이 없으면 가장 높은 세대(세대 하나라 밝히지 않음)

    def test_unregistered_generation(self):
        m = self.c.find("호카 마하 7 정보")[0]
        self.assertIsNone(m.shoe)
        self.assertEqual(m.line.key, "hoka:mach")

    def test_numbers_inside_prices_are_not_names(self):
        self.assertEqual(self.ids("880v15"), [4])
        self.assertEqual(self.ids("가격은 188,000원"), [])
        self.assertEqual(self.ids("젤 카야노 270mm"), [2])                  # 270 은 세대가 아니다

    def test_generation_is_read_from_original_text(self):
        # 공백을 지운 뒤에 읽으면 "카야노 32 270" 이 32270, "880 v15 3켤레" 가 붙었다(리뷰 2026-11-12)
        self.assertEqual([(m.shoe or {}).get("id") for m in self.c.find("젤 카야노 32 270 사이즈")], [1])
        self.assertEqual([m.gen for m in self.c.find("마하 7 8 비교")], [7])

    def test_ambiguous(self):
        m = self.c.find("레벨 드롭")[0]
        self.assertEqual(sorted(l.key for l in m.candidates), ["brooks:revel", "newbalance:rebel"])

    def test_alias_after_foreign_token(self):
        self.assertEqual(self.ids("메타스피드 스카이"), [])                  # "스카이"가 웨이브 스카이로 새지 않는다
        self.assertEqual(self.ids("스카이 9"), [7])


class FactsTest(unittest.TestCase):
    A = {"brand": "가", "model": "A", "weight": 265, "weightSize": "M9", "weightNorm270": 265}
    B = {"brand": "나", "model": "B", "weight": 272, "weightSize": "M10", "weightNorm270": 272 / 1.026 ** 2}
    C = {"brand": "다", "model": "C", "weight": 285, "weightSize": "M10", "weightNorm270": 285 / 1.026 ** 2}
    D = {"brand": "라", "model": "D", "weight": 258, "weightSize": "M9", "weightNorm270": 258}

    def test_8g_rule(self):
        # 09 4절 예 2 — 272 → 약 258, 차이 6.6g → 우열을 말하지 않는다
        self.assertEqual(facts.weight_converted(self.B), 258)
        self.assertIn("거의 같은 수준", facts.weight_conclusion(self.A, self.B, "A", "B"))
        # 예 1 — 285 → 약 271, 258 보다 12.7g → 말한다
        self.assertEqual(facts.weight_converted(self.C), 271)
        self.assertEqual(facts.weight_conclusion(self.D, self.C, "D", "C"), "환산해서 보면 D가 13g 정도 가벼운 편이에요.")

    def test_unknown_size(self):
        X = {"brand": "마", "model": "X", "weight": 250, "weightSize": None, "weightNorm270": None}
        self.assertIn("기준 사이즈", facts.weight_conclusion(self.A, X, "A", "X"))

    def test_8g_display_never_says_8(self):
        E = {"brand": "마", "model": "E", "weight": 272.6, "weightSize": "M9", "weightNorm270": 272.6}
        self.assertIn("차이가 7g 정도라 거의 같은", facts.weight_conclusion(self.A, E, "A", "E"))   # 7.6g

    def test_josa(self):
        self.assertEqual(facts.ieyo("클리프톤 10"), "클리프톤 10이에요")
        self.assertEqual(facts.ieyo("노바블라스트 5"), "노바블라스트 5예요")
        self.assertEqual(facts.josa("마하 7", "은", "는"), "마하 7은")
        self.assertEqual(facts.ieyo("8mm"), "8mm예요")
        self.assertEqual(facts.ieyo("255g"), "255g이에요")

    def test_asked_fields(self):
        self.assertEqual(facts.asked_fields("노바블라스트 5 무게 얼마예요?"), ["weight"])
        self.assertEqual(facts.asked_fields("앞뒤 높이 차이는요"), ["drop"])


class RouterTest(unittest.TestCase):
    def test_rules(self):
        self.assertEqual(router.rule_branch("A랑 B 뭐가 가벼워요", 2, 0, 0), "compare")
        self.assertEqual(router.rule_branch("그거랑 비교해줘", 1, 1, 0), "compare")
        self.assertEqual(router.rule_branch("추천해 주세요", 0, 0, 0), "recommend")
        self.assertEqual(router.rule_branch("카야노 무게", 1, 0, 0), "spec")
        self.assertEqual(router.rule_branch("드롭이 뭐예요?", 0, 0, 1), "term")
        self.assertIsNone(router.rule_branch("쿠션 좋은 신발 신으면 나을까요", 0, 2, 0))   # 가리키는 말 없이 직전 신발로 가지 않는다
        self.assertEqual(router.rule_branch("그거 무게는?", 0, 1, 0), "spec")

    def test_yes_needs_word_boundary(self):
        self.assertTrue(router.is_yes("네 부탁해요"))
        for t in ("예산은 15만원", "네이버에서 봤어요", "좋아하는 브랜드", "어디서 사요?"):
            self.assertFalse(router.is_yes(t), t)

    def test_llm_failure_defaults(self):
        def boom(text, history):
            raise ValueError("x")
        r = router.route("무릎이 시큰해요", 0, 0, 0, [], boom)
        self.assertEqual((r.health, r.branch, r.llm_ok), (True, "experience", False))   # 실패하면 health_context=true

    def test_rule_beats_llm_branch(self):
        r = router.route("카야노 무게", 1, 0, 0, [], lambda t, h: {"branch": "recommend", "health_context": False})
        self.assertEqual((r.branch, r.health), ("spec", False))

    def test_conditions_are_clamped(self):
        c = router.clean_conditions({"purpose": "산책", "width": "넓음", "cushion": "푹신", "budget_won": 150000})
        self.assertEqual(c, {"width": "넓음", "budget_won": 150000})


class ReplyTest(unittest.TestCase):
    def test_guard_numbers(self):
        out, used = guard("무게는 300g이에요.", "무게: 298g", "코드 답")
        self.assertEqual((out, used), ("코드 답", True))
        out, used = guard("무게는 298g이에요 😀", "무게: 298g", "코드 답")
        self.assertEqual((out, used), ("무게는 298g이에요", False))

    def test_medical_sentence_is_code_only(self):
        out, _ = guard("쿠션이 두터워요. 병원에 가 보세요.", "", "코드 답")
        self.assertEqual(with_doctor(out, True), "쿠션이 두터워요.\n\n" + DOCTOR)

    def test_links(self):
        self.assertEqual(Reply("x", [{"id": 3}]).links(), [{"label": "보러 가기", "href": "/?shoe=3"}])
        self.assertEqual(Reply("x", [{"id": 3}, {"id": 5}]).links()[0]["href"], "/compare?ids=3,5")
        self.assertEqual(Reply("x", [{"id": 3}], links_off=True).links(), [])


class TermsTest(unittest.TestCase):
    def test_plain_words_find_dictionary(self):
        d = Dictionary(TERMS)
        self.assertEqual([e["key"] for e in d.find("앞뒤 높이 차이가 뭐예요")], ["drop"])
        self.assertEqual([e["key"] for e in d.find("안정성이 뭐예요")], ["stabilityPair"])
        self.assertIn("드롭 설명입니다.", Dictionary.render(d.by_key["drop"]))


if __name__ == "__main__":
    unittest.main()
