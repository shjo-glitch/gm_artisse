-- 버전 2(키오스크): HOT 전용 메뉴와 메뉴별 유료 옵션(아티제 앱 기준)
ALTER TABLE drinks ADD COLUMN hot_only INTEGER NOT NULL DEFAULT 0;
-- [{"title": "옵션 추가", "mode": "count" | "pick", "max": 5, "choices": [{"name": "샷추가", "price": 700, "soldOut": false}]}]
ALTER TABLE drinks ADD COLUMN extras TEXT NOT NULL DEFAULT '[]';
