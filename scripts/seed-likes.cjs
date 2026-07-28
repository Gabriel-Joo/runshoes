// 시드 데이터 확충용 일회성 스크립트 (2026-07-28 실행 완료)
const path = require("path");

const dbPath = path.join(__dirname, "..", "db.json");
const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));

for (const review of db.reviews) {
  if (!review.likeCount || review.likeCount === 0) {
    // 0~4 사이 랜덤, 가끔(10% 확률) 5~8
    review.likeCount =
      Math.random() < 0.1
        ? Math.floor(Math.random() * 4) + 5
        : Math.floor(Math.random() * 5);
  }
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log("done");
