// 시드 데이터 확충용 일회성 스크립트 (2026-07-28 실행 완료)
// scripts/seed-reviews.js
const fs = require("fs");
const path = require("path");

const dbPath = path.join(__dirname, "..", "db.json");
const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));

let nextId = Math.max(...db.reviews.map((r) => r.id)) + 1;

// shoeId별 추가할 리뷰: [author, rating, content, likeCount]
const additions = {
  1: [["초보러너민지", 5, "발이 안쪽으로 무너지는 편인데 이 신발 신고 나서 무릎 아픈 게 확실히 줄었어요.", 3]],
  4: [["장거리도전", 4, "40mm 스택하이트가 처음엔 어색했는데 20km 넘어가니 왜 두꺼운지 알겠더라고요.", 5]],
  5: [["인터벌러너", 4, "빠른 페이스로 치고 나갈 때 반발력이 확실히 다릅니다. 조깅화보단 인터벌용.", 2]],
  6: [
    ["레이스데이", 5, "10K 개인 기록 3분 단축했어요. 카본 플레이트 반발력이 확실히 다릅니다.", 12],
    ["첫풀코스", 4, "가볍긴 한데 발볼이 좁아서 발가락 쪽이 좀 눌려요. 반 사이즈 크게 신으세요.", 6],
  ],
  7: [
    ["매일러너", 5, "매일 신어도 부담 없는 조깅화. 무난하게 오래 신기 좋아요.", 4],
    ["발볼넓어요", 4, "브룩스가 발볼이 넉넉하다더니 정말 편해요. 국내 브랜드보다 낫네요.", 3],
  ],
  8: [
    ["뉴발유저", 5, "쿠션이 정말 푹신해서 장거리 회복주에 딱입니다.", 3],
    ["첫러닝화", 4, "가격 대비 만족스러운데 무게가 좀 나가는 편이에요.", 2],
    ["회복주전용", 5, "빡센 훈련 다음날 회복주용으로 신는데 발이 편해요.", 4],
  ],
  9: [
    ["아디다스팬", 4, "부스트 쿠션 특유의 탱글한 느낌이 좋아요. 일상화로도 손색없습니다.", 5],
    ["출퇴근러너", 4, "회사 다녀와서 가볍게 뛰기 좋은 신발. 디자인도 무난해요.", 2],
  ],
  10: [["템포훈련중", 5, "템포런 훈련용으로 구매했는데 딱 원하던 반응성이에요.", 4]],
  11: [
    ["온신발첫구매", 4, "클라우드테크 쿠션이 특이한데 적응되니 편합니다.", 3],
    ["디자인중시", 5, "성능도 좋지만 일단 예뻐서 삽니다. 인터벌에도 무난해요.", 6],
  ],
  12: [["보스턴시리즈", 5, "보스턴 시리즈 계속 신고 있는데 13세대가 제일 안정적이에요.", 3]],
  13: [["장거리안정화", 4, "안정화인데도 무겁지 않아서 LSD 훈련에 자주 신어요.", 3]],
  14: [
    ["슈퍼노바입문", 4, "장거리용으로 처음 신어봤는데 쿠션감이 부드러워요.", 2],
    ["주말러너", 4, "주말 장거리 러닝용으로 만족스럽습니다.", 3],
  ],
  15: [
    ["미즈노웨이브", 5, "웨이브 플레이트 특유의 안정감이 장거리에 딱이에요.", 4],
    ["오래된유저", 4, "라이더 시리즈만 몇 년째 신는데 29도 무난합니다.", 2],
  ],
  16: [["서브3도전", 5, "마라톤 서브3 페이스메이커로 신었는데 최고였습니다. 가볍고 반발력 최고.", 15]],
  17: [
    ["레이스전용화", 5, "레이스 당일에만 신는 전용화로 씁니다. 확실히 기록이 다르네요.", 5],
    ["아디제로팬", 4, "가볍고 반발력 좋은데 쿠션이 얇아서 장거리엔 안 맞아요.", 3],
  ],
  18: [
    ["트레일입문", 4, "산길 그립력이 확실히 다릅니다. 젖은 바위에서도 안정적이에요.", 3],
    ["주말산길러너", 5, "발볼 좁은 편이라 두꺼운 양말 신으면 딱 맞아요.", 2],
  ],
  19: [["호카트레일", 5, "쿠션이 두꺼워서 긴 트레일 코스에도 발이 편해요.", 4]],
  20: [
    ["트라부코첫구매", 4, "아식스 트레일화 처음 신어보는데 접지력이 좋네요.", 2],
    ["주말등산러너", 5, "가벼운 산길 정도는 이걸로 충분합니다.", 3],
    ["트레일러닝시작", 4, "입문용으로 무난하고 가격도 합리적이에요.", 2],
  ],
};

const now = Date.now();
let offset = 0;

for (const [shoeIdStr, reviews] of Object.entries(additions)) {
  const shoeId = Number(shoeIdStr);
  for (const [author, rating, content, likeCount] of reviews) {
    offset += 1;
    db.reviews.push({
      id: nextId++,
      shoeId,
      author,
      rating,
      content,
      likeCount,
      createdAt: new Date(now - offset * 3600 * 1000 * 7).toISOString(),
    });
  }
}

// shoes 집계 재계산 — reviewCount, rating만. likeCount(찜 수)는 건드리지 않는다
for (const shoe of db.shoes) {
  const related = db.reviews.filter((r) => r.shoeId === shoe.id);
  shoe.reviewCount = related.length;
  shoe.rating = related.length
    ? Math.round((related.reduce((s, r) => s + r.rating, 0) / related.length) * 10) / 10
    : shoe.rating;
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log("done. total reviews:", db.reviews.length);