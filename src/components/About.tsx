import ArchDiagram from "./ArchDiagram";
import "./About.css";

// 로그인 화면 아래 프로젝트 소개(2026-11-19 사용자). docs가 아니라 운영 코드와 운영 설정을 보고 썼다.
//   가격은 발매가만(ShoeModal 가격 줄, priceKind), 모르는 값은 "정보 없음"(utils/display.ts NONE),
//   추천은 물음 다섯(Recommend QUESTIONS), 비교는 다섯 켤레까지(utils/compare.ts MAX_COLS), 챗봇은 로그인한 사람만(ChatBot LOGIN_GUIDE).
// 공개 화면이라 서버 주소, 포트, 실제 사람 이름, 바깥 링크를 넣지 않는다. 어떻게 만들었는지는 노션 몫이라 여기 쓰지 않는다.
// 화면 글과 주석 모두 줄표와 가운뎃점을 쓰지 않는다(2026-11-19 사용자).

const LEAD = {
  title: "러닝화 스펙과 리뷰를 용어 풀이와 함께 읽는 아카이브입니다",
  body: [
    "러닝화 정보는 드롭, 스택하이트 같은 말을 풀이 없이 늘어놓기 쉽습니다. 처음 러닝화를 고르는 사람도 스펙을 읽고 견줄 수 있게, 정보를 덜어 내지 않고 용어마다 설명을 붙였습니다.",
    "쇼핑몰이 아니어서 구매 버튼과 할인가는 없고 가격은 발매가만 보여 줍니다. 확인하지 못한 값은 짐작으로 채우지 않고 「정보 없음」으로 둡니다.",
  ],
};

const FEATURES: [string, string][] = [
  ["찾아보기", "용도로 거르고 이름으로 찾은 뒤, 신발을 열어 스펙과 용어 풀이, 리뷰 요약을 봅니다."],
  ["추천받기", "다섯 가지 물음에 답하면 맞는 신발을 고른 이유와 함께 보여 줍니다."],
  ["비교하기", "두 켤레에서 다섯 켤레까지 점수 없이 나란히 놓고 견줍니다."],
  ["챗봇", "로그인하면 신발을 말로 묻습니다. 신어 본 느낌을 물으면 이 사이트 리뷰에서 찾아 답합니다."],
];

const TOOLS: [string, string][] = [
  ["화면", "React, TypeScript, Vite, React Router"],
  ["서버", "Spring Boot, Java, MySQL, Flyway"],
  // 모델 이름은 코드가 부르는 그대로: chatbot/llm.py MODEL, application.yml app.ollama.model, model-service EMBEDDING(KURE-v1)
  ["챗봇", "Python, WebSocket, Ollama, gemma4:e4b, KURE-v1"],
  ["운영", "Docker, Kubernetes, ingress-nginx, Cloudflare Tunnel, GitHub, Jenkins, Harbor, Argo CD"],
];

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
          {FEATURES.map(([name, line]) => (
            <li key={name} className="about__feature">
              <strong>{name}</strong>
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
      </section>
    </div>
  );
}

export default About;
