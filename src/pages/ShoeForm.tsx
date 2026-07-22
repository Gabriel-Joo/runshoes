import { API } from "../api";
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal";
import "./ShoeForm.css";

const PURPOSES = [
  "조깅·회복주",
  "템포·인터벌",
  "LSD·장거리",
  "레이스",
  "트레일",
];
const STABILITIES = ["중립화", "안정화"];
const WIDTHS = ["좁음", "보통", "넓음"];

function ShoeForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [purpose, setPurpose] = useState(PURPOSES[0]);
  const [stability, setStability] = useState(STABILITIES[0]);
  const [midsole, setMidsole] = useState("");
  const [weight, setWeight] = useState("");
  const [drop, setDrop] = useState("");
  const [stackHeight, setStackHeight] = useState("");
  const [width, setWidth] = useState(WIDTHS[1]);
  const [wideAvailable, setWideAvailable] = useState(false);
  const [carbon, setCarbon] = useState(false);
  const [price, setPrice] = useState("");
  const [image, setImage] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [images, setImages] = useState("");

  const getShoe = async () => {
    const res = await fetch(`${API}/shoes/${id}`);
    const shoe = await res.json();

    setBrand(shoe.brand);
    setModel(shoe.model);
    setPurpose(shoe.purpose);
    setStability(shoe.stability);
    setMidsole(shoe.midsole ?? "");
    setWeight(shoe.weight === null ? "" : String(shoe.weight));
    setDrop(shoe.drop === null ? "" : String(shoe.drop));
    setStackHeight(shoe.stackHeight === null ? "" : String(shoe.stackHeight));
    setWidth(shoe.width);
    setWideAvailable(shoe.wideAvailable);
    setCarbon(shoe.carbon);
    setPrice(shoe.price === null ? "" : String(shoe.price));
    setImage(shoe.image);
    setImages((shoe.images ?? []).join("\n"));
    setSummary(shoe.summary);
    setDescription(shoe.description);
  };

  useEffect(() => {
    if (isEdit) getShoe();
  }, [id]);

  const toNumber = (v: string) => (v.trim() === "" ? null : Number(v));

  const buildBody = () => ({
    brand,
    model,
    purpose,
    stability,
    midsole: midsole.trim() === "" ? null : midsole,
    weight: toNumber(weight),
    drop: toNumber(drop),
    stackHeight: toNumber(stackHeight),
    width,
    wideAvailable,
    carbon,
    price: toNumber(price),
    image,
    images: images
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s !== ""),
    summary,
    description,
  });

  const save = async () => {
    if (!brand.trim() || !model.trim()) {
      alert("브랜드와 모델명은 필수입니다.");
      return;
    }

    if (isEdit) {
      await fetch(`${API}/shoes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      });
    } else {
      await fetch(`${API}/shoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildBody(),
          rating: 0,
          reviewCount: 0,
          likeCount: 0,
          liked: false,
        }),
      });
    }

    navigate("/admin");
  };

  const remove = async () => {
    const res = await fetch(`${API}/reviews?shoeId=${id}`);
    const reviews = await res.json();

    for (const review of reviews) {
      await fetch(`${API}/reviews/${review.id}`, {
        method: "DELETE",
      });
    }

    await fetch(`${API}/shoes/${id}`, { method: "DELETE" });

    navigate("/admin");
  };

  return (
    <div className="form">
      <h2 className="form__title">{isEdit ? "러닝화 수정" : "러닝화 등록"}</h2>

      <div className="form__grid">
        <label className="form__field">
          <span>브랜드</span>
          <input value={brand} onChange={(e) => setBrand(e.target.value)} />
        </label>

        <label className="form__field">
          <span>모델명</span>
          <input value={model} onChange={(e) => setModel(e.target.value)} />
        </label>

        <label className="form__field">
          <span>용도</span>
          <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            {PURPOSES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="form__field">
          <span>안정성</span>
          <select
            value={stability}
            onChange={(e) => setStability(e.target.value)}
          >
            {STABILITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="form__field">
          <span>미드솔</span>
          <input
            value={midsole}
            onChange={(e) => setMidsole(e.target.value)}
            placeholder="모르면 비워 두세요"
          />
        </label>

        <label className="form__field">
          <span>발볼</span>
          <select value={width} onChange={(e) => setWidth(e.target.value)}>
            {WIDTHS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>

        <label className="form__field">
          <span>중량 (g)</span>
          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </label>

        <label className="form__field">
          <span>드롭 (mm)</span>
          <input
            type="number"
            value={drop}
            onChange={(e) => setDrop(e.target.value)}
          />
        </label>

        <label className="form__field">
          <span>스택하이트 (mm)</span>
          <input
            type="number"
            value={stackHeight}
            onChange={(e) => setStackHeight(e.target.value)}
            placeholder="모르면 비워 두세요"
          />
        </label>

        <label className="form__field">
          <span>가격 (원)</span>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>

        <label className="form__field form__field--wide">
          <span>이미지 경로</span>
          <input
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="/images/파일명.png"
          />
        </label>

        <label className="form__field form__field--wide">
          <span>추가 이미지 (한 줄에 하나씩)</span>
          <textarea
            value={images}
            onChange={(e) => setImages(e.target.value)}
            rows={4}
            placeholder={
              "/images/모델명.png\n/images/모델명-2.png\n/images/모델명-3.png"
            }
          />
        </label>

        <label className="form__field form__field--wide">
          <span>한 줄 요약</span>
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="○○한 분에게"
          />
        </label>

        <label className="form__field form__field--wide">
          <span>상세 설명</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
          />
        </label>

        <div className="form__checks">
          <label className="form__check">
            <input
              type="checkbox"
              checked={wideAvailable}
              onChange={(e) => setWideAvailable(e.target.checked)}
            />
            와이드 모델 있음
          </label>

          <label className="form__check">
            <input
              type="checkbox"
              checked={carbon}
              onChange={(e) => setCarbon(e.target.checked)}
            />
            카본 플레이트
          </label>
        </div>
      </div>

      <div className="form__actions">
        {isEdit && (
          <button className="form__delete" onClick={() => setConfirmOpen(true)}>
            삭제
          </button>
        )}
        <button className="form__cancel" onClick={() => navigate("/admin")}>
          취소
        </button>
        <button className="form__save" onClick={save}>
          {isEdit ? "수정" : "등록"}
        </button>
        {confirmOpen && (
          <ConfirmModal
            message={`'${model}'을(를) 삭제할까요?`}
            detail="등록된 리뷰도 함께 삭제되며 되돌릴 수 없습니다."
            onConfirm={remove}
            onCancel={() => setConfirmOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

export default ShoeForm;
