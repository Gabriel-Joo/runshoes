const express = require("express");
const jsonServer = require("json-server");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

const app = express();
const PORT = process.env.PORT || 3000;
const BASE = process.env.BASE_PATH
  ? process.env.BASE_PATH.replace(/\/$/, "")
  : "";
const DB = process.env.DB_PATH || path.join(__dirname, "db.json");
const OLLAMA_URL = process.env.OLLAMA_URL || "http://192.168.23.202:11434";
app.set("etag", false);
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  next();
});
app.use(express.json());
app.use((req, res, next) => {
  if (req.originalUrl.includes("/api/")) {
    res.set("Cache-Control", "no-store");
  }
  next();
});

// ── 리뷰 요약 (Ollama) ──────────────────────────────
const summaryCache = new Map(); // shoeId -> { summary, reviewCount }

const summaryHandler = async (req, res) => {
  const shoeId = Number(req.params.id);
  const db = JSON.parse(require("fs").readFileSync(DB, "utf-8"));
  const reviews = db.reviews.filter((r) => r.shoeId === shoeId);

  if (reviews.length < 3) {
    return res.json({ summary: null, reason: "리뷰가 3개 미만입니다" });
  }

  const cached = summaryCache.get(shoeId);
  if (cached && cached.reviewCount === reviews.length) {
    return res.json({ summary: cached.summary });
  }

  const reviewText = reviews
    .slice()
    .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
    .map((r) => `- (공감 ${r.likeCount ?? 0}개) ${r.content}`)
    .join("\n");
  const prompt = `다음은 러닝화 리뷰 ${reviews.length}개입니다. 각 리뷰 앞의 "(공감 N개)"는 다른 사용자들이 그 리뷰에 공감한 수입니다. 공감을 많이 받은 리뷰의 의견을 더 비중 있게 반영하세요. 리뷰 작성자들이 실제로 언급한 내용만 근거로 분석하세요. 리뷰에 없는 내용은 추측하지 마세요. 같은 주제에 대해 리뷰들의 의견이 서로 반대된다면, 한쪽만 고르지 말고 "의견이 갈립니다"처럼 양쪽을 함께 언급하세요. 문장은 반드시 정중한 존댓말(합니다체)로 작성하세요.

반드시 아래 JSON 형식으로만 답하세요. 다른 설명은 붙이지 마세요.
{"positive": "긍정적으로 언급된 점 한 문장 (존댓말)", "negative": "아쉽다고 언급된 점 한 문장 (존댓말, 없으면 null)"}

리뷰:
${reviewText}`;

  try {
    const { stdout } = await execFileAsync(
      "curl",
      [
        "-s",
        "-m",
        "40",
        "-X",
        "POST",
        `${OLLAMA_URL}/api/generate`,
        "-H",
        "Content-Type: application/json",
        "-d",
        JSON.stringify({ model: "gemma4", prompt, stream: false }),
      ],
      { maxBuffer: 1024 * 1024 * 10 },
    );

    const data = JSON.parse(stdout);

    let parsed;
    try {
      const jsonMatch = data.response.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      parsed = { positive: data.response.trim(), negative: null };
    }

    summaryCache.set(shoeId, { summary: parsed, reviewCount: reviews.length });
    console.log(
      `[summary] shoeId=${shoeId} 요약 생성 완료 (리뷰 ${reviews.length}개)`,
    );
    res.json({ summary: parsed });
  } catch (err) {
    console.error("summary error:", err.message);
    res.json({ summary: null, reason: "요약을 불러오지 못했습니다" });
  }
};

app.get("/api/shoes/:id/summary", summaryHandler);
if (!BASE && process.env.NODE_ENV !== "production") {
  app.get("/shoes/:id/summary", summaryHandler);
}
// ────────────────────────────────────────────────────

const router = jsonServer.router(DB);
app.use("/api", jsonServer.defaults(), router);
if (BASE) app.use(`${BASE}/api`, jsonServer.defaults(), router);
if (!BASE && process.env.NODE_ENV !== "production") {
  app.use("/", jsonServer.defaults(), router);
}
app.use(express.static(path.join(__dirname, "dist")));
if (BASE) app.use(BASE, express.static(path.join(__dirname, "dist")));
app.get("/*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});
app.listen(PORT, () => console.log(`listening on ${PORT}`));
