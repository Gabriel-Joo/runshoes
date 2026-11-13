"""프롬프트가 고친 대로 들어갔는지(작업 5-1 — 2회차 편집 하나가 들어가지 않은 것을 늦게 알았다).

1. 스냅숏: `python -m chatbot.prompt` 의 출력이 prompt_snapshot.txt 와 같아야 한다.
   프롬프트를 고치면 이 시험이 깨진다 — 다시 찍어 커밋한다: python -m chatbot.prompt > chatbot/tests/prompt_snapshot.txt
   (diff 로 무엇이 바뀌었는지 사람이 읽는다)
2. 자리: 규칙이 정한 곳에만 있는지.
"""

import unittest
from pathlib import Path

from chatbot import prompt, router
from chatbot.branches import compare, experience, explain, recommend, spec

SNAPSHOT = Path(__file__).with_name("prompt_snapshot.txt")


class PromptTest(unittest.TestCase):
    def test_snapshot(self):
        self.assertEqual(SNAPSHOT.read_text().rstrip("\n"), prompt.dump().rstrip("\n"),
                         "프롬프트가 바뀌었다 — 의도한 것이면 python -m chatbot.prompt > chatbot/tests/prompt_snapshot.txt")

    def test_see_it_only_where_shoes_are(self):
        # "보러 가실래요?" — 신발을 말하는 갈래의 [할 일]에만(공통 규칙 · 특성 설명에는 없다)
        for t in (spec.TASK, compare.TASK, recommend.TASK):
            self.assertIn("보러 가실래요?", t)
        self.assertNotIn("보러 가실래요", prompt.TONE)
        self.assertNotIn("보러 가실래요", explain.TASK)
        # 경험·후기는 코드가 끝에 붙인다 — 금지 문구 대신 붙는 문장을 보여 준다(2차 수정, common.AFTER_HEAD)
        self.assertNotIn("보러 가실래요", experience.TASK)
        self.assertNotIn("질문으로 끝내지", experience.TASK)

    def test_attached_front_and_after(self):
        # 의료 안내는 앞, 끝 안내는 뒤(4차 수정) — 문장이 아니라 종류만 알린다
        from chatbot.branches.common import attached, attached_note
        self.assertEqual(attached(True, ["보러 가실래요?"]), ([prompt.DOCTOR], ["보러 가실래요?"]))
        self.assertEqual(attached(False, []), ([], []))
        note = attached_note([prompt.DOCTOR], ["보러 가실래요?"])
        self.assertIn("앞에 따로 붙는 것: 통증", note)
        self.assertNotIn(prompt.DOCTOR, note)

    def test_health_has_help_rule(self):
        self.assertIn("도움이 된다", prompt.HEALTH)

    def test_code_guarded_rules_are_not_in_prompt(self):
        # 이모지 · 마크다운 · 금칙어 · 의료 문장은 생성 검사가 막는다 — 프롬프트에서 또 말하지 않는다
        for w in ("이모지", "마크다운", "러너들이", "의료 안내 문장은 쓰지"):
            self.assertNotIn(w, prompt.TONE)

    def test_no_source_phrase_rule(self):
        self.assertNotIn("그 부분은 등록된 정보에 없어서", prompt.TONE)   # 출처 말하기 버릇을 부르던 고정 문구

    def test_router_does_not_map_record_to_race(self):
        self.assertNotIn("기록 → ", router.ROUTER_SYSTEM)


if __name__ == "__main__":
    unittest.main()
