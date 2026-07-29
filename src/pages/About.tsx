import "./About.css";
import { asset } from "../api";
import PipelineDiagram from "../components/PipelineDiagram";

const About = () => {
  return (
    <main className="about">
      <h1 className="about__title">About</h1>
      <nav className="about__anchors">
        <a href={`${import.meta.env.BASE_URL}about#part1`}>
          <span>PART.01</span>이 사이트에 대해
        </a>
        <a href={`${import.meta.env.BASE_URL}about#part2`}>
          <span>PART.02</span>
          어떻게 만들었나
        </a>
      </nav>
      <section className="about__part" id="part1">
        <p className="about__partlabel">PART.01</p>
        <h2 className="about__parttitle">이 사이트에 대해</h2>

        <p className="about__lead">
          러닝화 스펙을 다 보여주되, 모르는 말이 없게
        </p>
        <p className="about__body">
          러닝화 정보는 대부분 상급자 기준으로 쓰여 있습니다. 드롭, 스택하이트,
          프로네이션 같은 용어가 설명 없이 나열되어 있어 초보 러너는 정작
          "나에게 맞는 신발인지"를 판단할 수 없습니다.
        </p>
        <p className="about__body">
          RUNSHOES는 정보를 덜어내지 않습니다. 대신 모든 전문 용어에 즉시 확인할
          수 있는 설명을 붙여 초보와 상급자가 같은 페이지를 볼 수 있게 했습니다.
        </p>

        <ul className="about__points">
          <li className="about__point">
            <h3>용어 툴팁</h3>
            <p>
              스펙 옆 ⓘ를 누르면 설명이 열립니다. 13개 용어를 데이터로
              관리합니다.
            </p>
          </li>
          <li className="about__point">
            <h3>해부도 히어로</h3>
            <p>
              뒤꿈치·밑창·측면 클로즈업에 용어 캡션을 붙여 첫 화면에서 성격을
              전달합니다.
            </p>
          </li>
          <li className="about__point">
            <h3>정보 없음의 명시</h3>
            <p>
              브랜드가 공개하지 않은 스펙은 추측하지 않고 "정보 없음"으로
              표기합니다.
            </p>
          </li>
          <li className="about__point">
            <h3>발볼 · 와이드</h3>
            <p>
              한국 러너에게 중요하지만 해외 사이트가 다루지 않는 항목을 전면에
              노출합니다.
            </p>
          </li>
        </ul>
        <h3 className="about__subtitle">맞춤 추천은 어떻게 고르나</h3>
        <p className="about__body">
          5개 문항에 답하면 최대 140점으로 채점해 상위 3켤레를 보여줍니다.
          용도에 가장 큰 배점을 둔 것은, 발볼이나 예산이 맞아도 용도가 다르면
          애초에 맞지 않는 신발이기 때문입니다.
        </p>

        <ul className="about__score">
          <li>
            <span>용도</span>
            <strong>40</strong>
          </li>
          <li>
            <span>발볼</span>
            <strong>30</strong>
          </li>
          <li>
            <span>안정성</span>
            <strong>30</strong>
          </li>
          <li>
            <span>쿠션</span>
            <strong>20</strong>
          </li>
          <li>
            <span>예산</span>
            <strong>20</strong>
          </li>
          <li className="about__score--total">
            <span>합계</span>
            <strong>140</strong>
          </li>
        </ul>

        <p className="about__note">
          동점이면 아래의 종합 점수로 순위를 가릅니다.
        </p>
        <h3 className="about__subtitle">순위는 어떻게 매기나</h3>
        <p className="about__body">
          러너들의 선택 화면의 종합 점수입니다. 평점만으로 순위를 매기면 리뷰
          1개짜리 5.0이 100개짜리 4.5보다 위에 오게 됩니다. 그래서 리뷰가 적은
          신발은 평점을 그대로 반영하지 않습니다.
        </p>

        <div className="about__formula">
          <code>평점 × 20 × 신뢰도 + 좋아요 × 0.5</code>
          <p className="about__formulanote">신뢰도 = 리뷰 수 ÷ (리뷰 수 + 3)</p>
        </div>

        <ul className="about__ratio">
          <li>
            <strong>리뷰 1개</strong>
            <span>평점의 25% 반영</span>
          </li>
          <li>
            <strong>리뷰 3개</strong>
            <span>50%</span>
          </li>
          <li>
            <strong>리뷰 10개</strong>
            <span>약 77%</span>
          </li>
        </ul>
        <h3 className="about__subtitle">정보를 덜어내지 않는다는 것</h3>
        <p className="about__body">
          기획 의도는 화면 문구가 아니라 데이터 구조에서 지켜집니다. 용어와
          "정보 없음"을 다루는 방식이 그 두 축입니다.
        </p>
        <div className="about__principle">
          <div>
            <h4>용어를 데이터로 관리한다</h4>
            <p>
              13개 용어를 <code>terms</code>에 저장하고, 스펙 옆 ⓘ가 그 값을
              읽어 툴팁으로 띄웁니다. 설명을 화면에 직접 쓰지 않았기 때문에 한
              곳만 고치면 사이트 전체에 반영되고, 나중에 용어사전 페이지를 붙일
              때도 같은 데이터를 그대로 씁니다.
            </p>
          </div>
          <div>
            <h4>모르는 값은 0이 아니라 없음이다</h4>
            <p>
              브랜드가 공개하지 않은 스펙이 실제로 있습니다. 호카는 미드솔 폼
              이름을 밝히지 않습니다. 이때 0을 넣으면 "무게 0g"이라는 틀린
              정보가 되므로
              <code>null</code>로 두고 화면에 "정보 없음"으로 표시합니다.
              추측해서 채우지 않습니다.
            </p>
          </div>
        </div>
        <h3 className="about__subtitle">리뷰가 많으면, 요약도 보여줍니다</h3>
        <p className="about__body">
          리뷰가 3개 이상인 신발은 Ollama로 구동한 로컬 언어 모델(gemma4 8B)이
          리뷰를 읽고 좋았던 점과 아쉬운 점을 나눠 정리합니다. 공감을 많이 받은
          리뷰일수록 더 비중 있게 반영되며, 리뷰들의 의견이 서로 반대되는
          경우에는 한쪽만 골라 보여주지 않고 "의견이 갈립니다"처럼 양쪽을 함께
          안내하도록 프롬프트를 설계했습니다. 계산된 요약은 리뷰가 바뀔 때만
          새로 생성해 저장해두고, 그 외에는 저장된 결과를 보여줍니다.
        </p>

        <h3 className="about__subtitle">주요 화면</h3>

        <figure className="about__shot">
          <img
            src={asset("/images/screenshots/home-hero.png")}
            alt="홈 히어로"
          />
          <figcaption>
            홈 — 해부도 히어로. 클로즈업에 용어 캡션을 붙였습니다
          </figcaption>
        </figure>

        <div className="about__shots">
          <figure className="about__shot">
            <img
              src={asset("/images/screenshots/home-list.png")}
              alt="카드 그리드"
            />
            <figcaption>홈 — 용도별 필터와 정렬, 표본 카드 그리드</figcaption>
          </figure>
          <figure className="about__shot">
            <img
              src={asset("/images/screenshots/home-liked.png")}
              alt="찜한 목록"
            />
            <figcaption>
              찜한 것만 보기 — 별도 페이지 없이 토글로 걸러냅니다
            </figcaption>
          </figure>
        </div>

        <figure className="about__shot">
          <img
            src={asset("/images/screenshots/detail-tooltip.png")}
            alt="상세 모달"
          />
          <figcaption>
            상세 모달 — 스펙 옆 ⓘ를 누르면 용어 설명이 열립니다
          </figcaption>
        </figure>

        <figure className="about__shot">
          <img
            src={asset("/images/screenshots/detail-review.png")}
            alt="리뷰"
          />
          <figcaption>
            리뷰 — 도움이 된 리뷰는 베스트로 상단에 고정됩니다
          </figcaption>
        </figure>

        <figure className="about__shot">
          <img
            src={asset("/images/screenshots/detail-summary.png")}
            alt="리뷰 요약"
          />
          <figcaption>
            로컬 LLM(Ollama)이 리뷰를 읽고 요약합니다. 이 사례는 리뷰 의견이
            갈리는 경우를 보여줍니다
          </figcaption>
        </figure>

        <div className="about__shots">
          <figure className="about__shot">
            <img
              src={asset("/images/screenshots/recommend-question.png")}
              alt="맞춤 추천 질문"
            />
            <figcaption>맞춤 추천 — 한 번에 한 문항씩 답합니다</figcaption>
          </figure>
          <figure className="about__shot">
            <img
              src={asset("/images/screenshots/recommend-result.png")}
              alt="맞춤 추천 결과"
            />
            <figcaption>
              맞춤 추천 결과 — 맞은 조건과 아쉬운 조건을 함께 보여줍니다
            </figcaption>
          </figure>
          <figure className="about__shot">
            <img
              src={asset("/images/screenshots/best.png")}
              alt="러너들의 선택"
            />
            <figcaption>
              러너들의 선택 — 카드마다 종합 점수를 함께 표기합니다
            </figcaption>
          </figure>
          <figure className="about__shot">
            <img src={asset("/images/screenshots/admin.png")} alt="등록·관리" />
            <figcaption>
              등록·관리 — 브랜드 필터와 검색, 행마다 수정·삭제
            </figcaption>
          </figure>
        </div>

        <figure className="about__shot">
          <img
            src={asset("/images/screenshots/admin-form.png")}
            alt="등록 폼"
          />
          <figcaption>등록·수정 폼 — 스펙 입력과 삭제</figcaption>
        </figure>
      </section>

      <hr className="about__divider" />

      <section className="about__part" id="part2">
        <p className="about__partlabel">PART.02</p>
        <h2 className="about__parttitle">어떻게 만들었나</h2>

        <p className="about__lead">수동 배포에서 GitOps까지</p>
        <p className="about__body">
          처음부터 쿠버네티스로 시작하지 않았습니다. 배포 방식이 불편해질 때마다
          한 단계씩 옮겼고, 그 과정에서 왜 그 도구가 필요한지를 알게 됐습니다.
        </p>

        <ol className="about__steps">
          <li>
            <span className="about__stepnum">01</span>
            <h4>웹 터미널 수동 배포</h4>
            <p>
              학교 웹 터미널에 접속해 <code>git pull</code>, 빌드, 서버 재시작을
              직접 실행했습니다. 배포할 때마다 같은 명령을 반복해야 했고, 빌드
              옵션을 빠뜨리면 화면이 백지로 떴습니다.
            </p>
          </li>
          <li>
            <span className="about__stepnum">02</span>
            <h4>컨테이너와 쿠버네티스</h4>
            <p>
              Dockerfile로 실행 환경을 고정하고 클러스터에 올렸습니다. 데이터가
              파드와 함께 사라지지 않도록 PVC를 붙였고,
              <code>initContainer</code>가 최초 1회 <code>db.json</code>을
              복사하도록 했습니다.
            </p>
          </li>
          <li>
            <span className="about__stepnum">03</span>
            <h4>Jenkins CI</h4>
            <p>
              push하면 Kaniko가 이미지를 빌드해 Harbor에 올리도록 했습니다.
              빌드는 자동이 됐지만 배포는 여전히 <code>kubectl</code>{" "}
              명령이었습니다.
            </p>
          </li>
          <li>
            <span className="about__stepnum">04</span>
            <h4>ArgoCD GitOps</h4>
            <p>
              명령으로 클러스터를 바꾸는 대신, Git에 적힌 상태를 클러스터가
              따라오게 했습니다. 지금 무엇이 배포돼 있는지가 레포에 그대로
              남습니다.
            </p>
          </li>
        </ol>
        <h3 className="about__subtitle">파이프라인</h3>
        <PipelineDiagram />
        <p className="about__note">
          push 한 번으로 빌드 · 이미지 저장 · 매니페스트 갱신 · 배포가
          이어집니다.
        </p>
        <h3 className="about__subtitle">막혔던 지점</h3>
        <p className="about__body">
          구축 과정에서 실제로 멈춰 섰던 문제들입니다. 원인을 찾는 데 걸린
          시간이 대부분 배운 시간이었습니다.
        </p>

        <div className="about__trouble">
          <article>
            <h4>이미지 빌드가 메모리 부족으로 죽었다</h4>
            <dl>
              <dt>증상</dt>
              <dd>
                Kaniko가 <code>yarn install</code>까지 통과한 뒤 OOMKilled로
                에이전트 파드째 사라졌습니다.
              </dd>
              <dt>원인</dt>
              <dd>
                메모리를 늘려 잡았더니 이번엔 파드가 아예 뜨지 않았습니다.
                vcluster에 컨테이너당 2Gi 상한의 LimitRange가 걸려 있어 요청
                자체가 거부된 것이었습니다.
              </dd>
              <dt>해결</dt>
              <dd>
                상한 안에서 requests 1Gi / limits 2Gi로 맞추고, Kaniko의 스냅샷
                옵션(<code>--snapshot-mode=redo</code>,{" "}
                <code>--single-snapshot</code>)으로 빌드 중 메모리 사용을
                줄였습니다. 빌드 스테이지의 Node 힙도 함께 제한했습니다.
              </dd>
            </dl>
          </article>

          <article>
            <h4>HTTPS로 들어가면 404가 떴다</h4>
            <dl>
              <dt>증상</dt>
              <dd>Ingress를 만들었는데 HTTP는 되고 HTTPS는 404였습니다.</dd>
              <dt>원인</dt>
              <dd>
                클러스터의 Traefik이 HTTP를 HTTPS로 전역 리다이렉트하는데,
                Ingress가 <code>websecure</code> 엔트리포인트를 받지 않아 넘어온
                요청을 처리할 라우터가 없었습니다.
              </dd>
              <dt>해결</dt>
              <dd>
                엔트리포인트에 <code>web,websecure</code>를 함께 선언하고{" "}
                <code>tls</code> 블록을 추가했습니다.
              </dd>
            </dl>
          </article>

          <article>
            <h4>빌드는 되는데 배포가 안 바뀌었다</h4>
            <dl>
              <dt>증상</dt>
              <dd>새 이미지를 올려도 파드가 그대로였습니다.</dd>
              <dt>원인</dt>
              <dd>
                이미지 태그를 <code>:main</code>으로 고정해 쓰고 있었습니다.
                매니페스트가 변하지 않으니 쿠버네티스 입장에서는 바꿀 것이
                없었습니다.
              </dd>
              <dt>해결</dt>
              <dd>
                빌드 번호를 태그로 붙였습니다. 태그가 매번 달라지니 롤아웃이
                걸리고, 어느 빌드가 배포됐는지도 태그만 보면 알 수 있게
                됐습니다.
              </dd>
            </dl>
          </article>

          <article>
            <h4>배포 명령을 파이프라인에 넣는 게 맞을까</h4>
            <dl>
              <dt>상황</dt>
              <dd>
                처음에는 Jenkins가 <code>kubectl set image</code>로 직접
                배포했습니다. 동작은 했지만 클러스터의 현재 상태가 어디에도
                기록되지 않았습니다.
              </dd>
              <dt>판단</dt>
              <dd>
                명령으로 바꾸면 누가 언제 무엇을 배포했는지 로그를 뒤져야 알 수
                있습니다. 원하는 상태를 Git에 적어두고 클러스터가 그걸 따라오게
                하면, 레포를 보는 것만으로 현재 상태를 알 수 있습니다.
              </dd>
              <dt>변경</dt>
              <dd>
                Jenkins는 gitops 레포의 이미지 태그를 커밋하는 데까지만 하고,
                배포는 ArgoCD가 맡도록 했습니다.
              </dd>
            </dl>
          </article>
          <article>
            <h4>같은 학교 네트워크인데도 서버가 서로를 못 찾았다</h4>
            <dl>
              <dt>시도</dt>
              <dd>
                리뷰 요약에 로컬 PC의 Ollama(gemma4 8B)를 그대로 활용하기로
                했습니다. 클러스터 안에 별도로 LLM을 띄우는 대신, 이미 로컬에
                있던 모델을 재사용하는 쪽을 택했습니다.
              </dd>
              <dt>막힌 지점</dt>
              <dd>
                같은 학교 네트워크 안이라 ping은 됐지만, VM에서 로컬 PC의
                포트로는 연결이 안 됐습니다. Ollama가 내부 인터페이스에서만 듣고
                있었고, 윈도우 방화벽도 외부 연결을 막고 있었습니다.
              </dd>
              <dt>해결</dt>
              <dd>
                <code>OLLAMA_HOST=0.0.0.0</code>으로 외부 인터페이스에서도 듣게
                하고, 방화벽에 해당 포트의 인바운드 규칙을 추가했습니다.
              </dd>
            </dl>
          </article>

          <article>
            <h4>요약이 매번 다르게 나왔다 — 존댓말 혼용, 소수 의견 누락</h4>
            <dl>
              <dt>증상</dt>
              <dd>
                같은 형식으로 요청해도 어떤 리뷰는 존댓말, 어떤 리뷰는 반말로
                요약됐습니다. 좋아요 수가 비슷한 리뷰끼리 의견이 정반대인데도,
                한쪽만 반영되고 다른 쪽은 사라지는 경우도 있었습니다.
              </dd>
              <dt>원인</dt>
              <dd>
                문체를 지정하지 않아 모델이 리뷰 원문의 말투를 따라간
                것이었습니다. 상반된 의견 처리도 규칙이 없어, 모델이 더
                두드러지는 쪽 하나만 골라 담고 있었습니다.
              </dd>
              <dt>해결</dt>
              <dd>
                프롬프트에 존댓말 사용을 명시하고, 의견이 반대되면 한쪽만 고르지
                말고 함께 언급하라는 규칙을 추가했습니다. 좋아요 수도 함께
                전달해 공감을 많이 받은 의견에 더 비중을 두도록 했습니다. 8B급
                로컬 모델이라 완벽하진 않지만, 실제로 상반된 두 의견을 "의견이
                갈립니다"로 함께 담아내는 것을 확인했습니다.
                <pre className="about__prompt">
                  {`각 리뷰 앞의 "(공감 N개)"는 다른 사용자들이 그 리뷰에 공감한 수입니다. 공감을 많이 받은 리뷰의 의견을 더 비중 있게 반영하세요. 의견이 서로 반대된다면, 한쪽만 고르지 말고 "의견이 갈립니다"처럼 양쪽을 함께 언급하세요. 문장은 반드시 정중한 존댓말(합니다체)로 작성하세요.`}
                </pre>
              </dd>
            </dl>
          </article>
        </div>
        <h3 className="about__subtitle">
          파이프라인 및 AI연동의 실제 동작 화면
        </h3>
        <p className="about__body">
          push 이후 실제로 무슨 일이 일어나는지, 그리고 리뷰 요약이 어떻게
          처리되는지 각 도구에 남은 기록입니다.
        </p>

        <figure className="about__shot">
          <img
            src={asset("/images/screenshots/argocd-tree.png")}
            alt="ArgoCD 리소스 트리"
          />
          <figcaption>
            ArgoCD — Synced · Healthy 상태. jenkins-ci가 올린 커밋을 읽어
            배포하고, Deployment 아래 ReplicaSet 이력이 리비전별로 남습니다
          </figcaption>
        </figure>

        <figure className="about__shot">
          <img
            src={asset("/images/screenshots/harbor-tags.png")}
            alt="Harbor 아티팩트"
          />
          <figcaption>
            Harbor — 빌드 번호가 태그로 쌓입니다. latest는 최신 빌드를 함께
            가리킵니다
          </figcaption>
        </figure>

        <figure className="about__shot">
          <img
            src={asset("/images/screenshots/jenkins-stages.png")}
            alt="Jenkins Stage View"
          />
          <figcaption>
            Jenkins — push마다 이미지 빌드·푸시와 매니페스트 갱신이 순서대로
            실행됩니다
          </figcaption>
        </figure>
        <figure className="about__shot">
          <img
            src={asset("/images/screenshots/network-check.png")}
            alt="네트워크 연결 확인"
          />
          <figcaption>
            학교 VM에서 로컬 PC의 Ollama로 연결이 확인됩니다
          </figcaption>
        </figure>

        <figure className="about__shot">
          <img
            src={asset("/images/screenshots/summary-log.png")}
            alt="요약 생성 로그"
          />
          <figcaption>
            리뷰 조회 후 요약이 생성되는 서버 로그 — 리뷰 5개를 읽고 요약을
            생성한 기록입니다
          </figcaption>
        </figure>
        <h3 className="about__subtitle">기술 스택</h3>

        <div className="about__stack">
          <div>
            <h4>프론트엔드</h4>
            <ul>
              <li>React 19</li>
              <li>TypeScript 6</li>
              <li>Vite 8</li>
              <li>React Router 7</li>
            </ul>
          </div>
          <div>
            <h4>서버 · 데이터</h4>
            <ul>
              <li>Express 4</li>
              <li>json-server</li>
              <li>PVC 영속화</li>
            </ul>
          </div>
          <div>
            <h4>컨테이너 · 오케스트레이션</h4>
            <ul>
              <li>Docker</li>
              <li>Kubernetes (RKE2)</li>
              <li>Traefik Ingress</li>
            </ul>
          </div>
          <div>
            <h4>CI · CD</h4>
            <ul>
              <li>Jenkins</li>
              <li>Kaniko</li>
              <li>Harbor</li>
              <li>ArgoCD</li>
              <li>Kustomize</li>
            </ul>
          </div>
          <div>
            <h4>AI 연동</h4>
            <ul>
              <li>Ollama</li>
              <li>gemma4 (8B)</li>
            </ul>
          </div>
        </div>

        <p className="about__closing">
          요건을 채우는 것으로 시작했지만, 만들고 나니 배포하는 방법이 문제가
          됐습니다. 수동 배포의 불편함이 CI를 부르고, 명령형 배포의 한계가
          GitOps를 부르는 과정을 직접 겪으면서 각 도구가 왜 존재하는지를 알게
          됐습니다. 지금도 <code>git push</code> 한 번이면 이 사이트가
          갱신됩니다.
        </p>
      </section>
    </main>
  );
};

export default About;
