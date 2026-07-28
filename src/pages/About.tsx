import "./About.css";
import { asset } from "../api";

const About = () => {
  return (
    <main className="about">
      <h1 className="about__title">About</h1>

      <section className="about__part">
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

        <div className="about__shots">
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
          <figure className="about__shot">
            <img
              src={asset("/images/screenshots/admin-form.png")}
              alt="등록 폼"
            />
            <figcaption>
              등록·수정 폼 — 공개되지 않은 스펙은 비워두면 "정보 없음"으로
              저장됩니다
            </figcaption>
          </figure>
        </div>
      </section>

      <hr className="about__divider" />

      <section className="about__part">
        <p className="about__partlabel">PART.02</p>
        <h2 className="about__parttitle">어떻게 만들었나</h2>
      </section>
    </main>
  );
};

export default About;
