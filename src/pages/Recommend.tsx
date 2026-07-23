import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Shoe, Term } from "../types";
import { API } from "../api";
import ShoeCard from "../components/ShoeCard";
import ShoeModal from "../components/ShoeModal";
import "./Recommend.css";

interface Option {
  value: string;
  label: string;
  desc: string;
}

interface Question {
  key: string;
  title: string;
  options: Option[];
}

const QUESTIONS: Question[] = [
  {
    key: "purpose",
    title: "어떤 달리기를 주로 하시나요?",
    options: [
      {
        value: "조깅·회복주",
        label: "조깅·회복주",
        desc: "편한 속도로 30분에서 1시간쯤 달려요",
      },
      {
        value: "템포·인터벌",
        label: "템포·인터벌",
        desc: "숨이 찰 정도로 속도를 올리는 훈련을 해요",
      },
      {
        value: "LSD·장거리",
        label: "LSD·장거리",
        desc: "천천히 오래, 20km 넘게 달리는 날이 있어요",
      },
      {
        value: "레이스",
        label: "레이스",
        desc: "대회에 나가서 기록을 줄이려고 해요",
      },
      {
        value: "트레일",
        label: "트레일",
        desc: "포장도로가 아닌 산길이나 흙길을 달려요",
      },
    ],
  },
  {
    key: "width",
    title: "발볼이 넓은 편인가요?",
    options: [
      {
        value: "넓음",
        label: "넓은 편이에요",
        desc: "신발이 자주 조이고 답답합니다",
      },
      {
        value: "보통",
        label: "보통이에요",
        desc: "특별히 불편했던 적은 없습니다",
      },
      { value: "unknown", label: "잘 모르겠어요", desc: "" },
    ],
  },
  {
    key: "stability",
    title: "신던 운동화 밑창이 어떻게 닳았나요?",
    options: [
      {
        value: "안정화",
        label: "엄지발가락 쪽이 더 닳았어요",
        desc: "발이 안쪽으로 기울며 착지하는 편입니다",
      },
      {
        value: "중립화",
        label: "전체적으로 고르게 닳았어요",
        desc: "발이 곧게 착지하는 편입니다",
      },
      {
        value: "중립화-outer",
        label: "새끼발가락 쪽이 더 닳았어요",
        desc: "발이 바깥쪽으로 기울며 착지하는 편입니다",
      },
      {
        value: "unknown",
        label: "잘 모르겠어요",
        desc: "확인이 어려우면 넘어가도 됩니다",
      },
    ],
  },
  {
    key: "cushion",
    title: "쿠션은 어느 정도가 좋으세요?",
    options: [
      {
        value: "high",
        label: "푹신할수록 좋아요",
        desc: "발밑에 두툼하게 깔린 느낌이 좋습니다",
      },
      {
        value: "mid",
        label: "적당한 게 좋아요",
        desc: "너무 물렁하지도 딱딱하지도 않게",
      },
      {
        value: "low",
        label: "바닥이 느껴지면 좋겠어요",
        desc: "지면을 딛는 감각이 살아 있는 쪽이 좋습니다",
      },
      { value: "unknown", label: "잘 모르겠어요", desc: "" },
    ],
  },
  {
    key: "price",
    title: "예산은 어느 정도세요?",
    options: [
      {
        value: "low",
        label: "20만원 미만",
        desc: "부담 없이 신을 수 있는 가격대예요",
      },
      {
        value: "mid",
        label: "20~30만원",
        desc: "좋은 신발이라면 이 정도는 괜찮아요",
      },
      {
        value: "high",
        label: "30만원 이상도 괜찮아요",
        desc: "성능이 확실하다면 가격은 상관없어요",
      },
      {
        value: "unknown",
        label: "상관없어요",
        desc: "가격은 나중에 생각할게요",
      },
    ],
  },
];

interface Reason {
  hit: boolean;
  text: string;
}

function Recommend() {
  const navigate = useNavigate();

  const [shoes, setShoes] = useState<Shoe[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const getShoes = async () => {
    const res = await fetch(`${API}/shoes`);
    setShoes(await res.json());
  };

  const getTerms = async () => {
    const res = await fetch(`${API}/terms`);
    setTerms(await res.json());
  };

  useEffect(() => {
    getShoes();
    getTerms();
  }, []);

  const select = (key: string, value: string) => {
    setAnswers({ ...answers, [key]: value });

    if (step === QUESTIONS.length - 1) {
      setDone(true);
    } else {
      setStep(step + 1);
    }
  };

  const back = () => {
    if (step > 0) setStep(step - 1);
  };

  const restart = () => {
    setAnswers({});
    setStep(0);
    setDone(false);
  };

  const evaluate = (shoe: Shoe) => {
    let score = 0;
    const reasons: Reason[] = [];

    // 용도
    if (shoe.purpose === answers.purpose) {
      score += 40;
      reasons.push({ hit: true, text: `${shoe.purpose}에 맞는 신발이에요` });
    } else {
      reasons.push({
        hit: false,
        text: `${shoe.purpose}용이지만 다른 조건이 잘 맞아요`,
      });
    }

    // 발볼
    if (answers.width === "넓음") {
      if (shoe.width === "넓음") {
        score += 30;
        reasons.push({ hit: true, text: "발볼이 넓게 나온 모델이에요" });
      } else if (shoe.wideAvailable) {
        score += 20;
        reasons.push({ hit: true, text: "와이드 모델이 따로 있어요" });
      } else {
        reasons.push({
          hit: false,
          text: "발볼은 보통이고 와이드 모델은 없어요",
        });
      }
    } else if (answers.width === "보통") {
      if (shoe.width === "보통") {
        score += 20;
        reasons.push({ hit: true, text: "발볼이 보통으로 나왔어요" });
      } else {
        reasons.push({ hit: false, text: `발볼은 ${shoe.width}로 나왔어요` });
      }
    } else {
      reasons.push({
        hit: false,
        text: shoe.wideAvailable
          ? `발볼은 ${shoe.width}, 와이드 모델도 있어요`
          : `발볼은 ${shoe.width}로 나왔어요`,
      });
    }

    // 안정성
    if (
      answers.stability === "안정화" ||
      answers.stability === "중립화" ||
      answers.stability === "중립화-outer"
    ) {
      const want = answers.stability === "안정화" ? "안정화" : "중립화";
      if (shoe.stability === want) {
        score += 30;
        reasons.push({
          hit: true,
          text:
            want === "안정화"
              ? "발이 안쪽으로 무너지는 걸 잡아줘요"
              : "교정 장치가 없는 중립화예요",
        });
      } else {
        reasons.push({
          hit: false,
          text: `${shoe.stability}지만 다른 조건이 잘 맞아요`,
        });
      }
    } else {
      reasons.push({
        hit: false,
        text:
          shoe.stability === "안정화"
            ? "안정화예요 — 발이 안쪽으로 무너지는 걸 잡아줍니다"
            : "교정 장치가 없는 중립화예요",
      });
    }

    // 쿠션
    if (answers.cushion !== "unknown" && shoe.stackHeight !== null) {
      const h = shoe.stackHeight;
      const fit =
        (answers.cushion === "high" && h >= 40) ||
        (answers.cushion === "mid" && h >= 35 && h < 40) ||
        (answers.cushion === "low" && h < 35);

      if (fit) {
        score += 20;
        reasons.push({
          hit: true,
          text: `쿠션 두께가 원하시는 정도예요 (${h}mm)`,
        });
      } else {
        reasons.push({
          hit: false,
          text:
            h >= 40
              ? `쿠션이 원하시는 것보다 두꺼워요 (${h}mm)`
              : `쿠션이 원하시는 것보다 얇아요 (${h}mm)`,
        });
      }
    } else if (shoe.stackHeight !== null) {
      reasons.push({
        hit: false,
        text: `쿠션 두께는 ${shoe.stackHeight}mm예요`,
      });
    }

    // 예산
    if (answers.price !== "unknown" && shoe.price !== null) {
      const p = shoe.price;
      const fit =
        (answers.price === "low" && p < 200000) ||
        (answers.price === "mid" && p >= 200000 && p < 300000) ||
        (answers.price === "high" && p >= 300000);

      if (fit) {
        score += 20;
        reasons.push({
          hit: true,
          text: `예산에 맞아요 (${p.toLocaleString()}원)`,
        });
      } else if (
        (answers.price === "low" && p >= 200000) ||
        (answers.price === "mid" && p >= 300000)
      ) {
        reasons.push({
          hit: false,
          text: "예산보다 높지만 조건이 잘 맞아 함께 담았어요",
        });
      } else {
        reasons.push({
          hit: false,
          text: `생각하신 것보다 저렴해요 (${p.toLocaleString()}원)`,
        });
      }
    } else if (shoe.price !== null) {
      reasons.push({
        hit: false,
        text: `${shoe.price.toLocaleString()}원이에요`,
      });
    }
    return { score, reasons };
  };

  // 점수가 같으면 평점/리뷰/좋아요가 높은 쪽이 위로
  const results = [...shoes]
    .map((shoe) => ({ shoe, ...evaluate(shoe) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const sa =
        a.shoe.rating * 20 + a.shoe.reviewCount * 3 + a.shoe.likeCount * 0.5;
      const sb =
        b.shoe.rating * 20 + b.shoe.reviewCount * 3 + b.shoe.likeCount * 0.5;
      return sb - sa;
    })
    .slice(0, 3);

  const selectedShoe = shoes.find((s) => s.id === selectedId) ?? null;

  const toggleLike = async (shoe: Shoe) => {
    await fetch(`${API}/shoes/${shoe.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        liked: !shoe.liked,
        likeCount: shoe.liked ? shoe.likeCount - 1 : shoe.likeCount + 1,
      }),
    });
    getShoes();
  };

  const handleReviewChange = async () => {
    const res = await fetch(`${API}/reviews?shoeId=${selectedId}`);
    const list = await res.json();

    const reviewCount = list.length;
    const rating =
      reviewCount === 0
        ? 0
        : Math.round(
            (list.reduce(
              (sum: number, r: { rating: number }) => sum + r.rating,
              0,
            ) /
              reviewCount) *
              10,
          ) / 10;

    await fetch(`${API}/shoes/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, reviewCount }),
    });

    getShoes();
  };

  // 질문 화면
  if (!done) {
    const question = QUESTIONS[step];

    return (
      <div className="recommend">
        <div className="recommend__head">
          <p className="recommend__step">
            {step + 1} / {QUESTIONS.length}
          </p>
          <div className="recommend__bar">
            <span
              style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }}
            />
          </div>
        </div>

        <h2 className="recommend__question">{question.title}</h2>

        <ul className="recommend__options">
          {question.options.map((option) => (
            <li key={option.value}>
              <button
                className={`recommend__option ${
                  answers[question.key] === option.value ? "is-active" : ""
                }`}
                onClick={() => select(question.key, option.value)}
              >
                <strong>{option.label}</strong>
                {option.desc && <span>{option.desc}</span>}
              </button>
            </li>
          ))}
        </ul>

        {step > 0 && (
          <button className="recommend__back" onClick={back}>
            이전 질문으로
          </button>
        )}
      </div>
    );
  }

  // 결과 화면
  return (
    <div className="recommend recommend--result">
      <div className="recommend__resulthead">
        <h2 className="recommend__title">이런 신발은 어떠세요</h2>
        <p className="recommend__desc">
          조건에 가장 가까운 순으로 3켤레를 골랐습니다.
          <em>모든 조건을 만족하지 않아도 함께 보여드려요.</em>
        </p>
      </div>

      {results.length > 0 && (
        <div className="recommend__top">
          <div className="recommend__topitem">
            <ShoeCard
              shoe={results[0].shoe}
              index={0}
              rank={1}
              onClick={() => setSelectedId(results[0].shoe.id)}
              onToggleLike={() => toggleLike(results[0].shoe)}
            />
            <ul className="recommend__reasons">
              {results[0].reasons.map((reason, i) => (
                <li key={i} className={reason.hit ? "is-hit" : ""}>
                  <span>{reason.hit ? "✓" : "·"}</span>
                  {reason.text}
                </li>
              ))}
            </ul>
          </div>

          <div className="recommend__rest">
            {results.slice(1).map((result, i) => (
              <div className="recommend__restitem" key={result.shoe.id}>
                <ShoeCard
                  shoe={result.shoe}
                  index={i + 1}
                  rank={i + 2}
                  onClick={() => setSelectedId(result.shoe.id)}
                  onToggleLike={() => toggleLike(result.shoe)}
                />
                <ul className="recommend__reasons recommend__reasons--small">
                  {result.reasons
                    .filter((r) => r.hit)
                    .slice(0, 3)
                    .map((reason, j) => (
                      <li key={j} className="is-hit">
                        <span>✓</span>
                        {reason.text}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="recommend__actions">
        <button className="recommend__again" onClick={restart}>
          다시 해보기
        </button>
        <button className="recommend__all" onClick={() => navigate("/")}>
          전체 목록 보기
        </button>
      </div>

      {selectedShoe && (
        <ShoeModal
          shoe={selectedShoe}
          terms={terms}
          onClose={() => setSelectedId(null)}
          onReviewChange={handleReviewChange}
        />
      )}
    </div>
  );
}

export default Recommend;
