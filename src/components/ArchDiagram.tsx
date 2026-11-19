import "./ArchDiagram.css";

// 서비스 구성도(2026-11-19). 라이브러리 없이 인라인 SVG, 색은 CSS 클래스로 토큰에서 받는다. 글자는 <text>라 선택과 검색이 된다.
// 넓은 화면은 가로형, 좁은 화면은 세로형이다. 둘 다 DOM에 있고 CSS가 하나만 보인다(한 그림을 줄이면 좁은 화면에서 글자가 너무 작아진다).
// 그림은 운영 설정을 따른다(ronanlab-infra apps/runshoes):
//   앱 Pod 두 벌에 Spring(React 빌드물 포함)과 챗봇 사이드카(app/deployment.yaml), /ws/chat 만 챗봇으로(app/ingress.yaml),
//   MySQL 주 서버와 복제본 하나(mysql/), 리뷰 요약 배치는 같은 이미지의 CronJob(app/cronjob.yaml),
//   Ollama(gemma4:e4b)와 임베딩 모델 서버(KURE-v1)는 쿠버네티스 밖의 호스트(OLLAMA_URL, MODEL_SERVICE_URL).
//   Ollama를 부르는 것은 챗봇(chatbot/llm.py)과 요약 배치(SummaryService.generate)뿐이고, 웹 요청은 부르지 않는다.
//   Jenkins, Harbor, Argo CD는 같은 클러스터 안(ronanlab-infra platform/).
// 공개 화면이라 주소와 포트는 그리지 않는다.

interface Node { x: number; y: number; w: number; h: number; title: string; sub?: string[]; host?: boolean }

function Box({ n, ts, ss }: { n: Node; ts: number; ss: number }) {
  const lines = n.sub ?? [];
  const lineH = ss * 1.35;
  const blockH = ts + lines.length * lineH;
  const top = n.y + (n.h - blockH) / 2 + ts * 0.85; // 첫 줄 기준선
  const cx = n.x + n.w / 2;
  return (
    <g>
      <rect className={n.host ? "arch__box arch__box--host" : "arch__box"} x={n.x} y={n.y} width={n.w} height={n.h} rx={10} />
      <text className="arch__title" x={cx} y={top} fontSize={ts} textAnchor="middle">{n.title}</text>
      {lines.map((l, i) => (
        <text key={i} className="arch__sub" x={cx} y={top + (i + 1) * lineH} fontSize={ss} textAnchor="middle">{l}</text>
      ))}
    </g>
  );
}

function Arrow({ d, id, head = true }: { d: string; id: string; head?: boolean }) {
  return <path className="arch__edge" d={d} markerEnd={head ? `url(#${id})` : undefined} />;
}

function Marker({ id }: { id: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
      <path className="arch__head" d="M0,0 L10,5 L0,10 z" />
    </marker>
  );
}

function Label({ x, y, size, children, anchor = "start", rotate, group }: {
  x: number; y: number; size: number; children: string; anchor?: "start" | "middle" | "end"; rotate?: number; group?: "k8s" | "host" | "pod";
}) {
  const cls = group ? `arch__group-label arch__group-label--${group}` : "arch__label";
  return (
    <text className={cls} x={x} y={y} fontSize={size} textAnchor={anchor}
          transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined}>{children}</text>
  );
}

const T = {
  browser: { title: "브라우저", sub: ["회원, 체험 계정 방문자"] },
  tunnel: { title: "Cloudflare 터널", sub: ["HTTPS를 받아 클러스터로"] },
  app: { title: "앱: Spring Boot", sub: ["React 화면과 API", "로그인, 리뷰, 찜, 비교"] },
  chatbot: { title: "챗봇: Python", sub: ["WebSocket 대화", "리뷰 색인(벡터 + BM25)"] },
  mysql: { title: "MySQL", sub: ["신발, 리뷰, 회원", "복제본 하나(손으로 승격)"] },
  batch: { title: "리뷰 요약 배치", sub: ["CronJob, 하루 한 번", "앱과 같은 이미지"] },
  argo: { title: "Argo CD", sub: ["새 태그로 Pod 교체"] },
  harbor: { title: "Harbor", sub: ["이미지 보관"] },
  jenkins: { title: "Jenkins", sub: ["이미지 둘 빌드"] },
  github: { title: "GitHub", sub: ["main에 push"] },
  models: { title: "임베딩 모델 서버", sub: ["KURE-v1"] },
  ollama: { title: "Ollama", sub: ["gemma4:e4b", "챗봇 답 문장, 리뷰 요약"] },
};

/** 가로형, viewBox 1000 × 650. 왼쪽 쿠버네티스, 오른쪽 호스트 */
function Wide() {
  const m = "arch-arrow-wide";
  const TS = 19, SS = 14, LS = 13;
  return (
    <svg className="arch__svg arch__svg--wide" viewBox="0 0 1000 650" role="img" aria-labelledby="arch-wide-title">
      <title id="arch-wide-title">RUNSHOES 서비스 구성도</title>
      <defs><Marker id={m} /></defs>

      {/* 묶음, 상자보다 먼저 그려 뒤에 깔린다 */}
      <rect className="arch__group arch__group--k8s" x={14} y={196} width={566} height={444} rx={14} />
      <Label x={568} y={630} size={LS} anchor="end" group="k8s">쿠버네티스</Label>
      <rect className="arch__group arch__group--pod" x={30} y={236} width={536} height={124} rx={10} />
      <Label x={46} y={380} size={LS} group="pod">Pod 두 벌, 노드 둘에 나눔</Label>
      <rect className="arch__group arch__group--host" x={650} y={196} width={336} height={324} rx={14} />
      <Label x={974} y={510} size={LS} anchor="end" group="host">호스트 (그래픽카드)</Label>

      {/* 들어오는 길: 브라우저, 터널, ingress-nginx에서 두 갈래 */}
      <Arrow id={m} d="M297,70 V108" />
      <Label x={309} y={95} size={LS}>HTTPS, WebSocket</Label>
      <Arrow id={m} d="M297,170 V214" head={false} />
      <Arrow id={m} d="M156,214 H440" head={false} />
      <Arrow id={m} d="M156,214 V260" />
      <Arrow id={m} d="M440,214 V260" />
      <Label x={305} y={232} size={LS}>ingress-nginx</Label>
      <Label x={148} y={232} size={LS} anchor="end">화면, API</Label>
      <Label x={448} y={232} size={LS}>대화</Label>

      {/* 클러스터 안 */}
      <Arrow id={m} d="M330,300 H268" />
      <Label x={299} y={292} size={LS} anchor="middle">읽기</Label>
      <Arrow id={m} d="M250,346 V408" />
      <Arrow id={m} d="M330,452 H268" />
      <Label x={299} y={444} size={LS} anchor="middle">저장</Label>

      {/* 호스트로 */}
      <Arrow id={m} d="M550,290 H668" />
      <Label x={615} y={282} size={LS} anchor="middle">임베딩</Label>
      <Arrow id={m} d="M550,330 H610 V440 H668" />
      <Label x={624} y={385} size={LS} anchor="middle" rotate={90}>답 생성</Label>
      <Arrow id={m} d="M550,470 H668" />
      <Label x={615} y={462} size={LS} anchor="middle">요약</Label>

      {/* 배포: GitHub에서 Jenkins, Harbor. Argo CD가 Pod를 바꾼다 */}
      <Arrow id={m} d="M680,576 H568" />
      <Label x={624} y={568} size={LS} anchor="middle">웹훅</Label>
      <Arrow id={m} d="M426,576 H368" />
      <Label x={396} y={568} size={LS} anchor="middle">이미지</Label>
      <Arrow id={m} d="M46,576 H24 V300 H28" />

      <Box n={{ x: 147, y: 10, w: 300, h: 60, ...T.browser }} ts={TS} ss={SS} />
      <Box n={{ x: 147, y: 110, w: 300, h: 60, ...T.tunnel }} ts={TS} ss={SS} />
      <Box n={{ x: 46, y: 262, w: 220, h: 84, ...T.app }} ts={TS} ss={SS} />
      <Box n={{ x: 330, y: 262, w: 220, h: 84, ...T.chatbot }} ts={TS} ss={SS} />
      <Box n={{ x: 46, y: 410, w: 220, h: 84, ...T.mysql }} ts={TS} ss={SS} />
      <Box n={{ x: 330, y: 410, w: 220, h: 84, ...T.batch }} ts={TS} ss={SS} />
      <Box n={{ x: 46, y: 544, w: 140, h: 64, ...T.argo }} ts={TS - 1} ss={SS - 1} />
      <Box n={{ x: 226, y: 544, w: 140, h: 64, ...T.harbor }} ts={TS - 1} ss={SS - 1} />
      <Box n={{ x: 426, y: 544, w: 140, h: 64, ...T.jenkins }} ts={TS - 1} ss={SS - 1} />
      <Box n={{ x: 680, y: 544, w: 260, h: 64, ...T.github }} ts={TS - 1} ss={SS - 1} />
      <Box n={{ x: 670, y: 262, w: 296, h: 84, ...T.models, host: true }} ts={TS} ss={SS} />
      <Box n={{ x: 670, y: 410, w: 296, h: 84, ...T.ollama, host: true }} ts={TS} ss={SS} />
    </svg>
  );
}

/** 세로형, viewBox 364 × 762. 360px 폭에서 그림이 0.88배라 글자를 가로형보다 크게(작은 글자 11px 안팎) 둔다.
 *  호스트로 가는 길은 오른쪽 바깥 두 줄을 탄다. 요약 배치는 안쪽 줄, 챗봇은 바깥 줄 하나로 답 생성과 임베딩.
 *  Ollama를 위에 두어야 두 줄이 엇갈리지 않는다 */
function Narrow() {
  const m = "arch-arrow-narrow";
  const TS = 16, SS = 12.5, LS = 12.5;
  return (
    <svg className="arch__svg arch__svg--narrow" viewBox="0 0 364 762" role="img" aria-labelledby="arch-narrow-title">
      <title id="arch-narrow-title">RUNSHOES 서비스 구성도</title>
      <defs><Marker id={m} /></defs>

      <rect className="arch__group arch__group--k8s" x={6} y={146} width={320} height={326} rx={12} />
      <Label x={318} y={464} size={LS} anchor="end" group="k8s">쿠버네티스</Label>
      <rect className="arch__group arch__group--pod" x={12} y={184} width={308} height={100} rx={8} />
      <Label x={312} y={301} size={LS} anchor="end" group="pod">Pod 두 벌, 노드 둘에 나눔</Label>
      <rect className="arch__group arch__group--host" x={6} y={556} width={320} height={200} rx={12} />
      <Label x={318} y={748} size={LS} anchor="end" group="host">호스트 (그래픽카드)</Label>

      <Arrow id={m} d="M166,58 V86" />
      <Label x={176} y={77} size={LS}>HTTPS, WebSocket</Label>
      <Arrow id={m} d="M166,140 V170" head={false} />
      <Arrow id={m} d="M88,170 H246" head={false} />
      <Arrow id={m} d="M88,170 V196" />
      <Arrow id={m} d="M246,170 V196" />
      <Label x={174} y={164} size={LS - 1}>ingress-nginx</Label>

      <Arrow id={m} d="M178,234 H158" />
      <Arrow id={m} d="M88,270 V306" />
      <Arrow id={m} d="M178,340 H158" />

      <Arrow id={m} d="M106,414 H120" />
      <Arrow id={m} d="M62,490 V442" />

      <Arrow id={m} d="M314,340 H338 V606 H316" />
      <Arrow id={m} d="M314,226 H352 V630 H316" />
      <Arrow id={m} d="M352,630 V694 H316" />

      <Box n={{ x: 18, y: 6, w: 296, h: 52, ...T.browser }} ts={TS} ss={SS} />
      <Box n={{ x: 18, y: 88, w: 296, h: 52, ...T.tunnel }} ts={TS} ss={SS} />
      <Box n={{ x: 20, y: 198, w: 136, h: 72, title: "앱: Spring Boot", sub: ["React 화면과 API", "로그인, 리뷰, 찜"] }} ts={TS - 1} ss={SS - 0.5} />
      <Box n={{ x: 178, y: 198, w: 136, h: 72, title: "챗봇: Python", sub: ["WebSocket 대화", "리뷰 색인"] }} ts={TS - 1} ss={SS - 0.5} />
      <Box n={{ x: 20, y: 308, w: 136, h: 64, title: "MySQL", sub: ["신발, 리뷰, 회원", "복제본 하나"] }} ts={TS - 1} ss={SS - 0.5} />
      <Box n={{ x: 178, y: 308, w: 136, h: 64, title: "리뷰 요약 배치", sub: ["하루 한 번"] }} ts={TS - 1} ss={SS - 0.5} />
      <Box n={{ x: 18, y: 388, w: 88, h: 52, title: "Jenkins", sub: ["빌드"] }} ts={TS - 2} ss={SS - 0.5} />
      <Box n={{ x: 122, y: 388, w: 88, h: 52, title: "Harbor", sub: ["이미지 보관"] }} ts={TS - 2} ss={SS - 0.5} />
      <Box n={{ x: 226, y: 388, w: 88, h: 52, title: "Argo CD", sub: ["Pod 교체"] }} ts={TS - 2} ss={SS - 0.5} />
      <Box n={{ x: 18, y: 492, w: 140, h: 48, title: "GitHub", sub: ["main에 push"] }} ts={TS - 1} ss={SS - 0.5} />
      <Box n={{ x: 18, y: 584, w: 296, h: 68, title: "Ollama", sub: ["gemma4:e4b", "챗봇 답 문장, 리뷰 요약"], host: true }} ts={TS} ss={SS} />
      <Box n={{ x: 18, y: 668, w: 296, h: 52, title: "임베딩 모델 서버", sub: ["KURE-v1"], host: true }} ts={TS} ss={SS} />
    </svg>
  );
}

export default function ArchDiagram() {
  return (
    <figure className="arch">
      <Wide />
      <Narrow />
      <figcaption className="arch__caption">
        점선 묶음은 쿠버네티스 노드를 띄운 호스트입니다. 그래픽카드를 쓰는 모델은 호스트에 두고 클러스터 안에서 사설망으로 부릅니다.
        <br />
        main에 push하면 Jenkins가 이미지를 Harbor에 올리고, Argo CD가 새 이미지로 앱 Pod를 바꿉니다.
      </figcaption>
    </figure>
  );
}
