-- scripts/verify-seed.mjs 의 입력 — 행마다 "<table>\t<db.json 과 같은 모양의 JSON>". 순서는 db.json 과 같게(id, terms 는 row_no).
-- BOOLEAN 은 tinyint 라 JSON_OBJECT 가 1/0 으로 낸다 — true/false 로 바꾼다
SELECT 'shoes', JSON_OBJECT(
  'id', id, 'brand', brand, 'model', model, 'purpose', purpose, 'stability', stability, 'midsole', midsole,
  'weight', weight, 'drop', drop_mm, 'stackHeight', stack_height, 'width', width,
  'wideAvailable', CAST(IF(wide_available, 'true', 'false') AS JSON), 'carbon', CAST(IF(carbon, 'true', 'false') AS JSON),
  'price', price, 'image', image, 'images', images, 'summary', summary, 'description', description,
  'rating', rating, 'reviewCount', review_count, 'likeCount', like_count, 'liked', CAST(IF(liked, 'true', 'false') AS JSON))
FROM shoes ORDER BY id;

SELECT 'reviews', JSON_OBJECT(
  'id', id, 'shoeId', shoe_id, 'author', author, 'rating', rating, 'content', content,
  'createdAt', DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.%fZ'), 'likeCount', like_count,
  'liked', CAST(IF(liked, 'true', 'false') AS JSON))
FROM reviews ORDER BY id;

SELECT 'terms', JSON_OBJECT('id', id, 'key', term_key, 'name', name, 'short', short, 'description', description)
FROM terms ORDER BY row_no;
