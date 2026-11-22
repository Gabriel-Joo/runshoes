# 포트폴리오 「신발 목록」 다시 보기, 2026-11-22

기준: worktree `cc/runshoes-3` HEAD `72cde47`. 대상 `portfolio/01_list.md`, `portfolio/img/01_list_*`.

## 고른 축

화면 축. 이 저장소는 웹 화면(`src/pages/ShoeList.tsx`, `src/components/ShoeCard.tsx`, `FilterBar.tsx`, `SortBar.tsx`, `CardRowSync.tsx`)이 있어 보여 줄 화면이 있다. 포트폴리오 다른 편과 같은 축이다.

## 본 것

- 읽은 커밋(옛 `0fd9641`) 뒤 다루는 곳을 바꾼 커밋은 `b824817` 하나다. 그 커밋이 `src/pages/ShoeList.tsx` 에서 바꾼 것은 첫 화면 `Hero` 에 용어 목록을 넘기는 한 줄(`<Hero terms={terms} />`)뿐이다. 첫 화면은 「한눈에 보는 RUNSHOES」 편 몫이고, 목록, 카드, 거르기, 정렬의 동작은 바뀌지 않았다
- 같은 사이 `src/components/ShoeImage.tsx` 의 빈 칸 글이 "이미지 준비 중"에서 "이미지 없음"으로 바뀌었다. 원고는 이 글을 말하지 않아 고칠 것이 없다
- 원고가 근거로 건 `docs/02_screens.md`(10, 32~36, 88줄)와 `docs/02b_design_system.md`(10, 19, 50줄)는 옛 커밋과 지금이 같은 줄이다. `01a`, `01d`, `01e` 는 그 사이 바뀌지 않았다
- 사진 두 장(`01_list_race.jpg`, `01_list_mobile.png`)을 열어 봤다. 넓은 화면 사진 위쪽에 이미 새 첫 화면(용어 선 셋과 아래 띠)이 찍혀 있고, 칩, 검색창, 정렬, 카드 꼴이 지금 코드와 같다. 다시 찍지 않았다

## 한 것

본문은 그대로 두고 머리 주석의 읽은 커밋만 `72cde47` 로 올렸다. 310켤레와 1,800건은 원고에 잰 날짜(2026-11-17)가 붙어 있어 다시 세지 않았다.
