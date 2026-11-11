import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Shoe, Term } from "../types";
import { API } from "../api";
import { useAuth } from "../auth/useAuth";
import { apiFetch } from "../auth/session";
import { useShoeLike } from "../auth/useShoeLike";
import ShoeCard from "../components/ShoeCard";
import ShoeModal from "../components/ShoeModal";
import { fetchRecommend, type RecommendResult } from "../utils/compareApi";
import "./Recommend.css";

interface Option {
  value: string;
  label: string;
  desc: string;
}

interface Question {
  key: string;
  title: string;
  note?: string;          // 질문 아래 한 줄 — 무엇과 견주는지
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
    // 가격 칸은 발매가(정가)만 담는다(01a 1-5) — 추천 이유도 "발매가"로 말한다(2026-11-11 사용자, 작업 3-3)
    note: "발매가(정가) 기준이에요 — 할인가는 보지 않아요",
    // 예산은 넘으면 안 되는 선(상한) — 그 안의 신발은 가격으로 가르지 않는다(2026-11-11 사용자, docs/10_recommend.md)
    options: [
      {
        value: "low",
        label: "20만원까지",
        desc: "그보다 비싸면 부담돼요",
      },
      {
        value: "mid",
        label: "30만원까지",
        desc: "좋은 신발이라면 이 정도까지는 괜찮아요",
      },
      {
        value: "unknown",
        label: "가격은 상관없어요",
        desc: "잘 맞는 신발이면 가격은 나중에 볼게요",
      },
    ],
  },
];

function Recommend() {
  const navigate = useNavigate();

  const [shoes, setShoes] = useState<Shoe[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { status, user } = useAuth();

  const [reload, setReload] = useState(0);
  const getShoes = () => setReload((n) => n + 1);

  const getTerms = async () => {
    const res = await fetch(`${API}/terms`);
    setTerms(await res.json());
  };

  useEffect(() => {
    getTerms();
  }, []);

  // 첫 refresh 뒤 · 로그인 · 로그아웃 · 찜 · 리뷰 뒤에 다시(liked 가 그 사람 기준이다)
  useEffect(() => {
    if (status === "loading") return;
    apiFetch("/shoes")
      .then((res) => res.json())
      .then(setShoes)
      .catch((e) => console.error(e));
  }, [status, user?.id, reload]);

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

  // 점수 · 이유 · 순서는 서버가 정한다(GET /api/recommend, 2026-11-10 작업 3 — 옮기기 전 계산은 scripts/parity/reference/recommend.mjs).
  // 카드(사진 · 찜)는 이 화면이 받은 /api/shoes 로 그린다
  const [got, setGot] = useState<{ key: string; data: RecommendResult[] | "error" } | null>(null);
  const answersKey = done ? JSON.stringify(answers) : "";
  useEffect(() => {
    if (!answersKey) return;
    const ctrl = new AbortController();
    fetchRecommend(JSON.parse(answersKey), ctrl.signal)
      .then((data) => setGot({ key: answersKey, data }))
      .catch((e) => e.name !== "AbortError" && setGot({ key: answersKey, data: "error" }));
    return () => ctrl.abort();
  }, [answersKey]);
  const picked = got?.key === answersKey ? got.data : "loading";   // 답이 바뀌면(다시 해보기) 새 응답까지 "고르는 중"

  const byId = new Map(shoes.map((s) => [s.id, s]));
  const results = Array.isArray(picked)
    ? picked.flatMap((r) => { const shoe = byId.get(r.id); return shoe ? [{ shoe, score: r.score, reasons: r.reasons, notes: r.notes }] : []; })
    : [];

  const selectedShoe = shoes.find((s) => s.id === selectedId) ?? null;

  const toggleLike = useShoeLike(() => getShoes());

  // 평점 · 리뷰 수는 서버가 리뷰를 쓸 때 다시 센다 — 목록만 다시 받는다
  const handleReviewChange = () => getShoes();

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
        {question.note && <p className="recommend__qnote">{question.note}</p>}

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

      {(picked === "loading" || (Array.isArray(picked) && shoes.length === 0)) && <p className="recommend__loading">고르는 중이에요…</p>}
      {picked === "error" && <p className="recommend__loading">추천을 불러오지 못했어요</p>}
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
              {results[0].notes.map((note, i) => (
                <li key={`n${i}`} className="is-note"><span>ⓘ</span>{note}</li>
              ))}
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
                  {/* 못 본 조건 — ✓ 셋에 끼지 않고 따로(조건이 아니라 상태) */}
                  {result.notes.map((note, j) => (
                    <li key={`n${j}`} className="is-note"><span>ⓘ</span>{note}</li>
                  ))}
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
        {/* 결과 그대로 비교하기로(2026-11-09) — 이미 고른 신발이라 자동 채우기는 하지 않는다 */}
        {results.length >= 2 && (
          <button className="recommend__compare" onClick={() => navigate(`/compare?ids=${results.map((r) => r.shoe.id).join(",")}&why=${results.map(() => "r").join(",")}`)}>
            1~{results.length}위 비교하기
          </button>
        )}
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
