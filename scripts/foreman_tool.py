"""FOREMAN 문서 도구를 찾아 부른다(2026-11-17, 본은 ronanlab-infra scripts/foreman_tool.py). scripts/docs-check.py가 쓴다.

FOREMAN을 찾는 차례
  1. 환경 변수 FOREMAN_DIR
  2. 아래 DEFAULT(이 저장소 CLAUDE.md에 적은 기본 경로와 같은 값)
둘 다 못 찾으면 조용히 넘어가지 않고 종료 코드 2로 끝나며 설정하는 법을 한 줄로 보인다. 부르는 쪽도 || true로 덮지 않는다.
"""
import os
import sys
from pathlib import Path

DEFAULT = "~/AI_programming/foreman"    # CLAUDE.md 「문서 점검」에 적은 FOREMAN 기본 경로와 같은 값
VAR = "FOREMAN_DIR"


def find() -> Path:
    for where, v in ((f"환경 변수 {VAR}", os.environ.get(VAR)), ("CLAUDE.md 기본 경로", DEFAULT)):
        if v and Path(v).expanduser().joinpath("tools", "docs.py").is_file() and Path(v).expanduser().joinpath(".venv", "bin", "python").is_file():
            return Path(v).expanduser()
        if v:
            print(f"FOREMAN을 찾지 못했습니다: {where} {v}에 tools/docs.py나 .venv가 없습니다", file=sys.stderr)
    print(f"FOREMAN 문서 도구를 찾지 못했습니다. {VAR}=<FOREMAN 저장소 폴더>로 주거나 CLAUDE.md의 기본 경로를 맞추십시오"
          f"(예: export {VAR}=<FOREMAN 저장소 폴더>)", file=sys.stderr)
    sys.exit(2)


def run(cmd: str, args: list[str]) -> None:
    """FOREMAN `tools/docs.py --repo <이 저장소> <cmd> <args>`로 바꿔 탄다. 종료 코드는 그 명령 것 그대로다."""
    fm = find()
    here = Path(__file__).resolve().parent.parent
    py = fm / ".venv" / "bin" / "python"
    os.execv(py, [str(py), str(fm / "tools" / "docs.py"), "--repo", str(here), cmd, *args])
