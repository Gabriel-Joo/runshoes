import ArchDiagram from "./ArchDiagram";
import "./About.css";

// 로그인 화면 아래 프로젝트 소개(2026-11-19 사용자). docs가 아니라 운영 코드와 운영 설정을 보고 썼다.
// 공개 화면이라 서버 주소, 포트, 실제 사람 이름, 바깥 링크를 넣지 않는다. 화면 글과 주석 모두 줄표와 가운뎃점을 쓰지 않는다.
// 숫자는 2026-11-19에 셌다(아래 COUNTED). 다시 셀 때는 같은 곳에서 센다.
//   공개 API: /api/shoes 310켤레(브랜드 14), /api/reviews 1,800건(작성자 200명), /api/terms 13개(+ 화면의 WIDE_TERM 1 = 용어 14, utils/terms.ts),
//     정보 없음 발볼(width null) 69켤레, 발매가(price null) 54켤레, 리뷰 3건 이상 212켤레(요약 대상, StaleRule.MIN_REVIEWS)
//   챗봇 색인 3,438문서: chatbot/search/corpus.py build()에 공개 API 값을 넣어 셈(리뷰 1,800 + 설명문 문장 1,638)
//   운영 설정(ronanlab-infra): VM 다섯 대(cluster/Vagrantfile, 컨트롤 1 워커 4), 앱 Pod 두 벌(apps/runshoes/app/deployment.yaml replicas),
//     MySQL 주 서버와 복제본(apps/runshoes/mysql/), 요약 CronJob 03:30 Asia/Seoul(app/cronjob.yaml), RTX 5070 Ti 16GB(docs/11_gpu.md)
// 코드 값: 정렬 넷(SortBar SORTS), 용도 다섯(FilterBar PURPOSES), 추천 배점(RecommendPolicy 40, 30, 30, 20, 10, 상위 3),
//   비교 MAX_COLS 5, AUTO_COLS 4(ComparePolicy), 챗봇 모델 gemma4:e4b(chatbot/llm.py), RRF k 60(chatbot/search/index.py), 리뷰 상한 CAP 30(experience.py)

const LEAD = {
  title: "러닝화 스펙과 리뷰를 용어 풀이와 함께 읽는 아카이브입니다",
  body: [
    "러닝화 정보는 드롭, 스택하이트 같은 말을 풀이 없이 늘어놓기 쉽습니다. 처음 러닝화를 고르는 사람도 스펙을 읽고 견줄 수 있게, 브랜드 14곳의 러닝화 310켤레를 정보를 덜어 내지 않고 모아 용어마다 설명을 붙였습니다.",
    "쇼핑몰이 아니어서 구매 버튼과 할인가는 없고 가격은 발매가만 보여 줍니다. 확인하지 못한 값은 짐작으로 채우지 않고 「정보 없음」으로 둡니다. 리뷰 1,800건은 시연을 위해 만든 가상 사용자 200명이 썼습니다.",
  ],
};

interface Feature { name: string; voice: string; line: string; spec: [string, string][] }

const FEATURES: Feature[] = [
  {
    name: "찾아보기",
    voice: "드롭이 뭔지 몰라도 괜찮아요. 용어 옆 ⓘ 단추를 누르면 풀이가 떠요.",
    line: "용도로 거르고 이름으로 찾은 뒤, 신발을 열어 스펙과 용어 풀이, 리뷰 요약을 봅니다.",
    spec: [
      ["신발", "310켤레, 브랜드 14곳"],
      ["거르기", "용도 다섯 가지, 이름 검색, 정렬 네 가지"],
      ["용어 풀이", "14개, 챗봇도 같은 원문으로 답함"],
    ],
  },
  {
    name: "추천받기",
    voice: "다섯 가지만 물어볼게요. 왜 골랐는지도 같이 말씀드려요.",
    line: "다섯 가지 물음에 답하면 맞는 신발을 세 켤레까지, 고른 이유와 함께 보여 줍니다.",
    spec: [
      ["묻는 것", "달리기 종류, 발볼, 밑창 닳은 모양, 쿠션, 예산"],
      ["배점", "용도 40, 발볼 30, 안정성 30, 쿠션 20, 예산 10"],
      ["고른 이유", "맞은 조건을 셋까지 보여 주고, 값이 없는 조건은 점수와 만점에서 함께 뺍니다"],
    ],
  },
  {
    name: "비교하기",
    voice: "점수는 매기지 않아요. 나란히 놓을 테니 직접 견줘 보세요.",
    line: "두 켤레에서 다섯 켤레까지 점수 없이 나란히 놓고 견줍니다.",
    spec: [
      ["채우기", "한 켤레를 고르면 같은 라인의 다른 세대와 같은 용도의 현행 신발로 네 켤레까지"],
      ["위치", "무게, 스택, 드롭, 발매가는 하위 25%, 가운데, 상위 25%로"],
      ["공유", "고른 구성이 주소에 남아 링크로 그대로 열립니다"],
    ],
  },
  {
    name: "챗봇",
    voice: "신어 본 느낌이 궁금하세요? 리뷰를 찾아 몇 건이 그렇게 말했는지 세어 드려요.",
    line: "로그인하면 신발을 말로 묻습니다. 신어 본 느낌을 물으면 이 사이트 리뷰에서 찾아 답합니다.",
    spec: [
      ["모델", "gemma4:e4b, 임베딩 KURE-v1"],
      ["검색", "벡터와 BM25를 RRF로 섞음, 문서 3,438개"],
      ["리뷰 집계", "그 신발 리뷰를 새로 읽어 코드가 세고, 답에는 30건까지"],
    ],
  },
];

/** 기술 구성 카드. 남들도 다 하는 것보다 이 프로젝트가 따로 한 것 */
const TECH: [string, string][] = [
  ["모르는 값은 「정보 없음」으로 둡니다", "발볼 69켤레, 발매가 54켤레가 비어 있습니다. 짐작으로 채우는 순간 거짓이 되기 때문입니다."],
  ["용어 풀이 14개를 화면과 챗봇이 같이 씁니다", "ⓘ 단추로 보는 풀이와 챗봇이 용어를 설명하는 말이 같은 원문에서 나옵니다."],
  ["리뷰 요약은 하루 한 번 새벽에 만듭니다", "리뷰 3건 이상인 212켤레를 새벽 3시 30분 CronJob이 요약하고, 화면은 저장된 요약을 읽기만 합니다."],
  ["챗봇의 건수는 코드가 셉니다", "몇 건이 좋다고 했는지와 인용은 코드가 쓰고, 근거 리뷰에 없는 숫자가 든 문장은 지웁니다."],
  ["VM 다섯 대로 직접 세운 쿠버네티스", "컨트롤 1대와 워커 4대를 kubeadm으로 세우고, 앱 Pod 두 벌을 서로 다른 노드에 띄웁니다."],
  ["push 하나로 운영까지 갑니다", "Jenkins가 이미지 둘을 같은 커밋 태그로 Harbor에 올리고 Argo CD가 반영합니다. 문서만 바뀌면 이미지를 건너뜁니다."],
  ["그래픽카드 한 장, 16GB", "RTX 5070 Ti 한 장이 쿠버네티스 밖 호스트에서 gemma4:e4b와 KURE-v1을 돌립니다."],
  ["DB 복제본은 사람이 승격합니다", "MySQL 주 서버와 복제본을 다른 노드에 두고, 자동 전환 없이 사람이 절차대로 승격합니다."],
];

const TOOLS: [string, string][] = [
  ["화면", "React, TypeScript, Vite, React Router"],
  ["서버", "Spring Boot, Java, MySQL, Flyway"],
  ["챗봇", "Python, WebSocket, Ollama, gemma4:e4b, KURE-v1"],
  ["운영", "Docker, Kubernetes, ingress-nginx, Cloudflare Tunnel, GitHub, Jenkins, Harbor, Argo CD"],
];

const COUNTED =
  "숫자는 2026년 11월 19일에 셌습니다. 신발, 리뷰, 정보 없음, 요약 대상은 이 사이트의 공개 API로, VM과 Pod와 그래픽카드는 운영 설정으로 셌습니다. 용어 14개는 공개 API의 13개에 화면이 따로 가진 와이드 모델 풀이를 더한 수이고, 챗봇 문서 3,438개는 리뷰 1,800건과 신발 설명문을 문장으로 나눈 1,638개를 더한 수입니다.";

function About() {
  return (
    <div className="about" role="region" aria-label="프로젝트 소개">
      <section className="about__lead" aria-labelledby="about-lead">
        <p className="about__eyebrow">RUNSHOES</p>
        <h2 id="about-lead" className="about__title">{LEAD.title}</h2>
        {LEAD.body.map((p, i) => <p key={i} className="about__body">{p}</p>)}
      </section>

      <section className="about__section" aria-labelledby="about-features">
        <h2 id="about-features" className="about__heading">할 수 있는 것</h2>
        <ul className="about__features">
          {FEATURES.map((f) => (
            <li key={f.name} className="about__feature">
              <strong className="about__fname">{f.name}</strong>
              <p className="about__voice">{f.voice}</p>
              <p className="about__fline">{f.line}</p>
              <dl className="about__fspec">
                {f.spec.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </section>

      <section className="about__section" aria-labelledby="about-tech">
        <h2 id="about-tech" className="about__heading">기술 구성</h2>
        <ul className="about__tech">
          {TECH.map(([title, line]) => (
            <li key={title} className="about__techcard">
              <strong>{title}</strong>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="about__section" aria-labelledby="about-arch">
        <h2 id="about-arch" className="about__heading">구성</h2>
        <ArchDiagram />
      </section>

      <section className="about__section" aria-labelledby="about-tools">
        <h2 id="about-tools" className="about__heading">쓴 기술</h2>
        <dl className="about__tools">
          {TOOLS.map(([k, v]) => (
            <div key={k} className="about__toolrow">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="about__counted">{COUNTED}</p>
      </section>
    </div>
  );
}

export default About;
