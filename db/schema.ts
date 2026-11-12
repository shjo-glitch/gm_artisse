export const schemaSql = {
  config: `CREATE TABLE IF NOT EXISTS config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    users TEXT NOT NULL DEFAULT '[]',
    options TEXT NOT NULL DEFAULT '[]',
    orders_closed INTEGER NOT NULL DEFAULT 0,
    round_started_at TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  drinks: `CREATE TABLE IF NOT EXISTS drinks (
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    tall_price INTEGER NOT NULL DEFAULT 0,
    grande_price INTEGER NOT NULL DEFAULT 0,
    ice_only INTEGER NOT NULL DEFAULT 0,
    hot_only INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    source_event_id TEXT,
    extras TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (category, name)
  )`,
  orders: `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    menu_name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'others',
    requester TEXT NOT NULL,
    member_id INTEGER,
    size TEXT NOT NULL CHECK (size IN ('Tall', 'Grande')),
    temp TEXT NOT NULL DEFAULT 'ICE' CHECK (temp IN ('ICE', 'HOT')),
    options TEXT NOT NULL DEFAULT '[]',
    note TEXT NOT NULL DEFAULT '',
    unit_price INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  ordersCreatedAtIndex: "CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at)",
  // 1인 1주문: 팀원 id가 있는 주문은 팀원마다 하나만
  ordersMemberIndex: "CREATE UNIQUE INDEX IF NOT EXISTS orders_member_idx ON orders (member_id) WHERE member_id IS NOT NULL",
  // 주문할 수 있는 팀원. 처음 MS 로그인할 때 이메일, 없으면 이름으로 Entra 계정(oid)을 연결한다.
  members: `CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    oid TEXT UNIQUE,
    last_login_at TEXT,
    last_nudged_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  // "새 주문 시작" 때 옮겨 둔 지난 주문 (내 주문 > 지난 주문)
  orderHistory: `CREATE TABLE IF NOT EXISTS order_history (
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
  )`,
  orderHistoryMemberIndex: "CREATE INDEX IF NOT EXISTS order_history_member_idx ON order_history (member_id, round_started_at)",
  menuEvents: `CREATE TABLE IF NOT EXISTS menu_events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    release_date TEXT NOT NULL,
    expire_date TEXT,
    status TEXT NOT NULL CHECK (status IN ('added', 'failed', 'expired')),
    items TEXT NOT NULL DEFAULT '[]',
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT NOT NULL DEFAULT '',
    checked_at TEXT NOT NULL
  )`,
  seasonSync: `CREATE TABLE IF NOT EXISTS season_sync (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    ran_at TEXT NOT NULL,
    trigger TEXT NOT NULL,
    report TEXT NOT NULL DEFAULT '{}'
  )`,
} as const;

export type ConfigRow = {
  id: 1;
  // 예전 팀원 이름 목록(JSON). 0004부터는 members 테이블을 쓴다.
  users: string;
  options: string;
  orders_closed: 0 | 1;
  round_started_at: string | null;
  updated_at: string;
};

export type MemberRow = {
  id: number;
  name: string;
  email: string | null;
  oid: string | null;
  last_login_at: string | null;
  last_nudged_at: string | null;
  created_at: string;
};

export type DrinkRow = {
  category: string;
  name: string;
  tall_price: number;
  grande_price: number;
  ice_only: 0 | 1;
  hot_only: 0 | 1;
  sort_order: number;
  source_event_id: string | null;
  // [{ title, mode: "count" | "pick", max, choices: [{ name, price }] }]
  extras: string;
};

export type MenuEventRow = {
  id: string;
  title: string;
  release_date: string;
  expire_date: string | null;
  status: "added" | "failed" | "expired";
  items: string;
  attempts: number;
  error: string;
  checked_at: string;
};

export type OrderRow = {
  id: string;
  menu_name: string;
  category: string;
  requester: string;
  member_id: number | null;
  size: "Tall" | "Grande";
  temp: "ICE" | "HOT";
  options: string;
  note: string;
  unit_price: number;
  created_at: string;
  updated_at: string;
};

export type OrderHistoryRow = Omit<OrderRow, "size" | "temp"> & {
  round_started_at: string;
  archived_at: string;
  size: string;
  temp: string;
};

