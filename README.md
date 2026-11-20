<!-- 이 파일은 `tools/docs.py readme`가 만든다. 손으로 고치면 다음에 만들 때 날아간다. 소개는 포트폴리오 00편 첫 문단, 편 목록은 원고 첫 # 줄, 노션 주소는 게시 기록에서 온다. 제목 바로 아래 머리글은 `.foreman/readme_header.md` 파일 글을 그대로 넣은 것이다 -->
# RUNSHOES

> **러닝화, 제대로 읽기**
> 스펙은 빠짐없이, 용어는 설명과 함께

**🔗 Live Demo: https://runshoes.ronanlab.dev** (자체 kubeadm 클러스터, Cloudflare Tunnel). 로그인 화면의 체험 계정으로 가입 없이 둘러볼 수 있습니다(일반 회원, 읽기 전용 관리자).

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-000?logo=vite&logoColor=white)
![React Router](https://img.shields.io/badge/React_Router-7-CA4245?logo=reactrouter&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-3.5-6DB33F?logo=springboot&logoColor=white)
![Java](https://img.shields.io/badge/Java-21-007396?logo=openjdk&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Kubernetes](https://img.shields.io/badge/Kubernetes-326CE5?logo=kubernetes&logoColor=white)
![Jenkins](https://img.shields.io/badge/Jenkins-D24939?logo=jenkins&logoColor=white)
![Argo CD](https://img.shields.io/badge/Argo%20CD-EF7B4D?logo=argo&logoColor=white)
![Harbor](https://img.shields.io/badge/Harbor-60B932?logo=harbor&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-000?logo=ollama&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Tunnel-F38020?logo=cloudflare&logoColor=white)

RUNSHOES는 러닝화 310켤레(2026-11-17 운영 공개 API)의 스펙과 리뷰를 한곳에 모은 아카이브 사이트입니다. 어려운 용어에는 바로 풀이가 뜨고, 모르는 값은 짐작으로 채우지 않고 "정보 없음"으로 남깁니다.

## 포트폴리오

[노션에서 보기](https://app.notion.com/p/00-RUNSHOES-41d3218bb524812eb0a9c1e1d3673b8f)

| 번호 | 제목 | 하위 |
|---|---|---|
| 00 | [한눈에 보는 RUNSHOES](portfolio/00_overview.md) |  |
| 01 | [신발 목록](portfolio/01_list.md) |  |
| 02 | [신발 상세 창](portfolio/02_detail.md) |  |
| 03 | [추천받기](portfolio/03_recommend.md) |  |
| 04 | [비교하기](portfolio/04_compare.md) |  |
| 05 | [러너들의 선택](portfolio/05_best.md) |  |
| 06 | [챗봇](portfolio/06_chatbot.md) |  |
| 07 | [로그인과 체험 계정](portfolio/07_login.md) |  |
| 08 | [관리 화면](portfolio/08_admin.md) |  |
| 09 | [모니터링](portfolio/09_monitoring.md) |  |
| 10 | [알려진 한계](portfolio/10_limits.md) |  |

## 기술문서

[노션에서 보기](https://app.notion.com/p/00-41d3218bb52481ec81e4c8fce394f0df)

| 번호 | 제목 | 하위 |
|---|---|---|
| 00 | [전체 그림](notion/00_overview.md) |  |
| 01 | [신발 데이터를 모으는 법](notion/01_catalog.md) | 하위 5 |
| 02 | [시드 리뷰 1,800건](notion/02_seed_reviews.md) |  |
| 03 | [화면](notion/03_screens.md) | 하위 2 |
| 04 | [추천받기](notion/04_recommend.md) |  |
| 05 | [비교하기](notion/05_compare.md) |  |
| 06 | [관리 화면](notion/06_admin.md) |  |
| 07 | [로그인과 체험 계정](notion/07_auth.md) |  |
| 08 | [챗봇](notion/08_chatbot.md) | 하위 6 |
| 09 | [Spring 전환과 API 계약 시험](notion/09_spring.md) |  |
| 10 | [배포](notion/10_deploy.md) | 하위 1 |
| 11 | [알려진 한계](notion/11_limits.md) |  |

## 문서

| 문서 | 제목 | 요약 |
|---|---|---|
| [01a_catalog_sources.md](docs/01a_catalog_sources.md) | 01a 신발 데이터 | 브랜드 14개, 라인 233개의 **현행 + 직전 1세대**(후보 408행)를, 약관과 robots 가 허락하는 곳에서 **사실 값만** 모으고, 값마다 출처 URL 을 붙이고, 못 구한 값은 기본값으로 메우지 않… |
| [01b_catalog_images.md](docs/01b_catalog_images.md) | 01b 신발 이미지 | 신발 사진은 **저장하지 않고 StockX(없으면 GOAT) 이미지 주소를 핫링크**한다. |
| [01c_catalog_loader.md](docs/01c_catalog_loader.md) | 01c 적재기 | 카탈로그(`shoes.jsonl`)를 **관리자 API 로** 운영에 넣는 적재기다. |
| [01d_catalog_copy.md](docs/01d_catalog_copy.md) | 01d 문구 | 카드의 **한 줄 요약**과 상세 모달의 **설명문**은 우리가 쓴 글이다. |
| [01e_seed_reviews.md](docs/01e_seed_reviews.md) | 01e 시드 리뷰 | 사이트의 리뷰, 찜, 도움이 돼요는 **가상 사용자 200명이 쓴 시드 데이터**다. |
| [02_screens.md](docs/02_screens.md) | 02 화면 | React 단일 페이지 앱이다. |
| [02b_design_system.md](docs/02b_design_system.md) | 02b 디자인 | **표본 전시실**. |
| [03_admin.md](docs/03_admin.md) | 03 관리 화면 | 신발을 등록, 수정, 숨김, 영구 삭제하는 관리 화면이다. |
| [04_auth.md](docs/04_auth.md) | 04 로그인과 계정 | 이메일 가입과 로그인(JWT)이다. |
| [05_api_contract.md](docs/05_api_contract.md) | 05 API 계약과 계약 시험 | REST API 는 **원래 돌던 json-server API 의 응답을 녹화해 두고 그대로 재현**한 것이다. |
| [06_deployment.md](docs/06_deployment.md) | 06 배포 | push 한 번이면 배포된다. |
| [07_database.md](docs/07_database.md) | 07 스키마와 마이그레이션 | MySQL 8 하나에 테이블 14개(+ `flyway_schema_history`)다. |
| [08_compare.md](docs/08_compare.md) | 08 비교하기 | **비교하기**(`/compare`)는 정해 둔 신발 2~5켤레를 나란히 펼쳐 보는 화면이다. |
| [09_chatbot_rag.md](docs/09_chatbot_rag.md) | 09 챗봇 RAG 설계 | 질문이 들어오면 여섯 갈래로 나눈다. |
| [10_recommend.md](docs/10_recommend.md) | 10 추천받기 | **추천받기**(`/recommend`)는 다섯 문항(용도, 발볼, 안정성, 쿠션, 예산)에 답하면 310켤레를 점수로 줄 세워 상위 3을 보인다. |
| [HISTORY.md](docs/HISTORY.md) | 날짜 타임라인 | React + json-server 과제로 시작해(2026-07), 학교 클러스터 → 자체 클러스터로 옮기고(10-18), 녹화한 응답으로 백엔드를 Spring Boot + MySQL 로 바꿔 끼웠다(10-21). |
| [TODO.md](docs/TODO.md) | 남은 일 |  |
| [overview.md](docs/overview.md) | 전체 구조 | React, TypeScript 화면과 Spring Boot, MySQL API 를 한 이미지로 묶어, 자체 쿠버네티스 클러스터에 GitOps 로 배포한 러닝화 리뷰 아카이브다. |
| [requirements.md](docs/requirements.md) | 요구사항 | **"러닝화 스펙을 다 보여주되, 모르는 말이 없게."** |
| [style_guide.md](docs/style_guide.md) | 문서 쓰는 법 |  |
