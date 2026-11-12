-- MS(Entra ID) 로그인: 팀원 명단을 config.users(이름 JSON)에서 members 테이블로 옮긴다.
-- 처음 로그인할 때 이메일, 없으면 이름으로 명단과 맞춰 Entra 계정(oid)을 연결한다.
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  oid TEXT UNIQUE,
  last_login_at TEXT,
  last_nudged_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO members (name)
SELECT trim(value) FROM json_each((SELECT users FROM config WHERE id = 1)) WHERE trim(value) <> '';

-- 주문은 팀원 id로 1인 1주문을 지킨다. 기존 주문은 주문자 이름으로 이어 준다.
ALTER TABLE orders ADD COLUMN member_id INTEGER;
UPDATE orders SET member_id = (SELECT id FROM members WHERE members.name = orders.requester);
CREATE UNIQUE INDEX IF NOT EXISTS orders_member_idx ON orders (member_id) WHERE member_id IS NOT NULL;

-- "새 주문 시작"을 누르면 지금 주문을 order_history로 옮겨 내 주문 내역에 남긴다.
ALTER TABLE config ADD COLUMN round_started_at TEXT;
UPDATE config SET round_started_at = COALESCE((SELECT MIN(created_at) FROM orders), CURRENT_TIMESTAMP) WHERE id = 1;

CREATE TABLE IF NOT EXISTS order_history (
  id TEXT PRIMARY KEY,
  round_started_at TEXT NOT NULL,
  archived_at TEXT NOT NULL,
  member_id INTEGER,
  requester TEXT NOT NULL,
  menu_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'others',
  size TEXT NOT NULL,
  temp TEXT NOT NULL,
  options TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  unit_price INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS order_history_member_idx ON order_history (member_id, round_started_at);
