CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  users TEXT NOT NULL DEFAULT '[]',
  options TEXT NOT NULL DEFAULT '[]',
  orders_closed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS drinks (
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  tall_price INTEGER NOT NULL DEFAULT 0,
  grande_price INTEGER NOT NULL DEFAULT 0,
  ice_only INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (category, name)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  menu_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'others',
  requester TEXT NOT NULL,
  size TEXT NOT NULL CHECK (size IN ('Tall', 'Grande')),
  temp TEXT NOT NULL DEFAULT 'ICE' CHECK (temp IN ('ICE', 'HOT')),
  options TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  unit_price INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at);

INSERT OR REPLACE INTO config (id, users, options, orders_closed, updated_at)
VALUES (1, '["강선영","고민수","구자철","권오섭","권혁진","김부윤","김수길","김은우","김진석","김형석","박민수","박병훈","박수미","서기석","서은정","안성덕","엄태인","윤창일","윤형석","이상협","이태우","전미화","정대훈","정준용","조수한","조인재","진광호","최원석"]', '["연하게","덜달게","디카페인","더달게","두유","오트밀크"]', 1, CURRENT_TIMESTAMP);

INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('coffee', '카페 아메리카노', 4900, 5400, 0, 0);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('coffee', '카페라떼', 5600, 6100, 0, 1);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('coffee', '카푸치노', 5600, 6100, 0, 2);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('coffee', '캐러멜 마끼아또', 6500, 7000, 0, 3);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('coffee', '바닐라라떼', 6300, 6800, 0, 4);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('coffee', '스패니쉬라떼', 6300, 6800, 0, 5);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('coffee', '플랫화이트', 5600, 6100, 0, 6);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('real-fruit-beverage', '리얼후르츠 오렌지주스', 8300, 8800, 1, 7);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('real-fruit-beverage', '리얼후르츠 자몽주스', 8300, 8800, 1, 8);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('real-fruit-beverage', '리얼후르츠 토마토주스', 8300, 8800, 1, 9);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('real-fruit-beverage', '로열자몽티', 6700, 7200, 0, 10);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('real-fruit-beverage', '클래식 레몬 허니 티', 6700, 7200, 0, 11);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('real-fruit-beverage', '시그니처 오렌지 에이드', 6700, 7200, 1, 12);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('real-fruit-beverage', '시그니처 레몬 에이드', 6700, 7200, 1, 13);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('real-fruit-beverage', '시그니처 자몽 에이드', 6700, 7200, 1, 14);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('tea', '캐모마일', 5800, 6300, 0, 15);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('tea', '페퍼민트', 5800, 6300, 0, 16);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('tea', '잉글리쉬 블랙퍼스트', 5800, 6300, 0, 17);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('tea', '루이보스', 5800, 6300, 0, 18);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('others', '데일리 요거트 스무디', 6600, 7100, 1, 19);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('others', '레몬 요거트 스무디', 6900, 7400, 1, 20);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('others', '발로나 초코 프라페', 6900, 7400, 1, 21);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('others', '발로나 더블 초콜릿', 6900, 7400, 0, 22);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('others', '애플밀크티', 6300, 6800, 0, 23);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('others', '잉글리쉬 티 라떼', 6300, 6800, 0, 24);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('others', '제주 말차 라떼', 6200, 6700, 0, 25);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('others', '발로나 자바칩 프라페', 6400, 6900, 1, 26);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('coffee', '콜드브루', 5200, 5900, 1, 27);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('coffee', '콜드브루 라떼', 5700, 6400, 1, 28);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('coffee', '대용량 아메리카노 (매그넘)', 5900, 0, 0, 29);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('real-fruit-beverage', '스윗 피치 요거트', 7500, 8000, 1, 30);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('tea', '자스민 피치 아이스티', 6800, 0, 1, 31);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('coffee', '자스민 티스프레소', 7300, 0, 1, 32);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('others', '애플망고 요거트 스무디', 6900, 7600, 1, 33);
INSERT OR REPLACE INTO drinks (category, name, tall_price, grande_price, ice_only, sort_order) VALUES ('others', '주문 안함', 0, 0, 1, 34);

INSERT OR REPLACE INTO orders (id, menu_name, category, requester, size, temp, options, note, unit_price, created_at, updated_at) VALUES ('b3ad5550-fff0-407e-8b30-640a8972b83e', '대용량 아메리카노 (매그넘)', 'coffee', '조수한', 'Tall', 'ICE', '[]', '', 5900, '2026-06-10T02:01:44.37207+00:00', '2026-06-22T00:11:23.742+00:00');
INSERT OR REPLACE INTO orders (id, menu_name, category, requester, size, temp, options, note, unit_price, created_at, updated_at) VALUES ('3b1aabd1-8bde-40f2-8762-ce9def8aa28d', '콜드브루 라떼', 'coffee', '박수미', 'Grande', 'ICE', '[]', '', 6400, '2026-06-10T02:03:13.005231+00:00', '2026-06-10T02:03:13.005231+00:00');
INSERT OR REPLACE INTO orders (id, menu_name, category, requester, size, temp, options, note, unit_price, created_at, updated_at) VALUES ('93c5ca71-b806-4029-9a56-95f17952b0b6', '제주 말차 라떼', 'others', '서기석', 'Grande', 'ICE', '[]', '', 6700, '2026-06-10T02:03:31.249308+00:00', '2026-06-10T02:03:31.249308+00:00');
INSERT OR REPLACE INTO orders (id, menu_name, category, requester, size, temp, options, note, unit_price, created_at, updated_at) VALUES ('d940b78c-f9c9-41a1-8701-26bd57f53021', '카페라떼', 'coffee', '박병훈', 'Grande', 'ICE', '["연하게"]', '', 6100, '2026-06-10T02:03:45.444421+00:00', '2026-06-10T02:04:05.306+00:00');
INSERT OR REPLACE INTO orders (id, menu_name, category, requester, size, temp, options, note, unit_price, created_at, updated_at) VALUES ('f6a73efc-3a55-4f3f-b333-dc49c815e436', '애플망고 요거트 스무디', 'others', '권오섭', 'Grande', 'ICE', '[]', '', 7600, '2026-06-10T02:04:00.849037+00:00', '2026-06-30T01:15:55.021+00:00');
INSERT OR REPLACE INTO orders (id, menu_name, category, requester, size, temp, options, note, unit_price, created_at, updated_at) VALUES ('408758a7-2ec5-46b2-82a5-5450407a496f', '스패니쉬라떼', 'coffee', '황의덕', 'Grande', 'HOT', '["더달게"]', '', 6800, '2026-06-10T02:04:29.168387+00:00', '2026-06-30T01:20:18.944+00:00');
INSERT OR REPLACE INTO orders (id, menu_name, category, requester, size, temp, options, note, unit_price, created_at, updated_at) VALUES ('fd0e22e7-7fa7-4219-a372-f18e4d1122d2', '콜드브루 라떼', 'coffee', '최원석', 'Grande', 'ICE', '[]', '', 6400, '2026-06-10T02:05:07.25+00:00', '2026-06-10T02:05:07.25+00:00');
INSERT OR REPLACE INTO orders (id, menu_name, category, requester, size, temp, options, note, unit_price, created_at, updated_at) VALUES ('2c8753d1-461d-43a5-a7b3-063c6e77b9f9', '카페라떼', 'coffee', '고민수', 'Grande', 'HOT', '[]', '', 6100, '2026-06-10T02:05:20.559549+00:00', '2026-06-10T05:16:36.264+00:00');
INSERT OR REPLACE INTO orders (id, menu_name, category, requester, size, temp, options, note, unit_price, created_at, updated_at) VALUES ('69f32da3-9465-4e2f-a52c-a4aeb4472acf', '콜드브루 라떼', 'coffee', '고상태', 'Grande', 'ICE', '[]', '', 6400, '2026-06-10T02:07:49.190096+00:00', '2026-06-10T02:07:49.190096+00:00');
INSERT OR REPLACE INTO orders (id, menu_name, category, requester, size, temp, options, note, unit_price, created_at, updated_at) VALUES ('1d909014-df4c-4a6f-95c1-7c06ac14044b', '리얼후르츠 오렌지주스', 'real-fruit-beverage', '조인재', 'Grande', 'ICE', '[]', '', 8800, '2026-06-10T02:12:56.657186+00:00', '2026-06-30T01:20:56.175+00:00');
INSERT OR REPLACE INTO orders (id, menu_name, category, requester, size, temp, options, note, unit_price, created_at, updated_at) VALUES ('d4e9d6af-6c36-4b09-a154-22f4d15cf2e5', '카페라떼', 'coffee', '윤창일', 'Grande', 'ICE', '["디카페인"]', '', 6100, '2026-06-10T02:14:41.567141+00:00', '2026-06-10T02:14:41.567141+00:00');
INSERT OR REPLACE INTO orders (id, menu_name, category, requester, size, temp, options, note, unit_price, created_at, updated_at) VALUES ('1636ad99-a499-4a77-9164-b210379faded', '대용량 아메리카노 (매그넘)', 'coffee', '권혁진', 'Tall', 'ICE', '[]', '', 5900, '2026-06-10T02:16:00.844964+00:00', '2026-06-10T02:16:00.844964+00:00');
INSERT OR REPLACE INTO orders (id, menu_name, category, requester, size, temp, options, note, unit_price, created_at, updated_at) VALUES ('2d6ba073-07a6-49b8-8d3a-acd050541d8a', '콜드브루 라떼', 'coffee', '안성덕', 'Grande', 'ICE', '[]', '', 6400, '2026-06-10T02:37:11.326369+00:00', '2026-06-10T02:37:11.326369+00:00');
INSERT OR REPLACE INTO orders (id, menu_name, category, requester, size, temp, options, note, unit_price, created_at, updated_at) VALUES ('9f060dfd-bd9a-4511-a88f-3fb7e54d0188', '콜드브루', 'coffee', '김부윤', 'Tall', 'ICE', '[]', '', 5200, '2026-06-10T04:12:31.92441+00:00', '2026-06-10T04:12:31.92441+00:00');
INSERT OR REPLACE INTO orders (id, menu_name, category, requester, size, temp, options, note, unit_price, created_at, updated_at) VALUES ('de4873cd-bce1-4626-b83b-8dbd8958f252', '데일리 요거트 스무디', 'others', '이상협', 'Grande', 'ICE', '[]', '', 7100, '2026-06-10T04:16:26.734493+00:00', '2026-06-10T04:16:26.734493+00:00');
INSERT OR REPLACE INTO orders (id, menu_name, category, requester, size, temp, options, note, unit_price, created_at, updated_at) VALUES ('4f6f28eb-37c6-4c7a-a920-6e12190637ae', '스패니쉬라떼', 'coffee', '진광호', 'Grande', 'HOT', '["덜달게","디카페인"]', '', 6800, '2026-06-30T01:15:56.783332+00:00', '2026-06-30T01:15:56.783332+00:00');
INSERT OR REPLACE INTO orders (id, menu_name, category, requester, size, temp, options, note, unit_price, created_at, updated_at) VALUES ('df2ca89c-6896-42d9-a072-456b81eefbb1', '주문 안함', 'others', '구자철', 'Tall', 'ICE', '[]', '', 0, '2026-06-30T04:43:39.255788+00:00', '2026-06-30T04:43:39.255788+00:00');
INSERT OR REPLACE INTO orders (id, menu_name, category, requester, size, temp, options, note, unit_price, created_at, updated_at) VALUES ('9ec4fcb2-bbad-416b-a957-ef525fd94fa8', '주문 안함', 'others', '정준용', 'Tall', 'ICE', '[]', '', 0, '2026-06-30T04:43:44.229092+00:00', '2026-06-30T04:43:44.229092+00:00');
INSERT OR REPLACE INTO orders (id, menu_name, category, requester, size, temp, options, note, unit_price, created_at, updated_at) VALUES ('1f4745e6-aa12-4999-943c-b8b31d73779c', '주문 안함', 'others', '박민수', 'Tall', 'ICE', '[]', '', 0, '2026-06-30T04:43:48.425235+00:00', '2026-06-30T04:43:48.425235+00:00');

