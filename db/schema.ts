export const schemaSql = {
  config: `CREATE TABLE IF NOT EXISTS config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    users TEXT NOT NULL DEFAULT '[]',
    options TEXT NOT NULL DEFAULT '[]',
    orders_closed INTEGER NOT NULL DEFAULT 0,
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
    size TEXT NOT NULL CHECK (size IN ('Tall', 'Grande')),
    temp TEXT NOT NULL DEFAULT 'ICE' CHECK (temp IN ('ICE', 'HOT')),
    options TEXT NOT NULL DEFAULT '[]',
    note TEXT NOT NULL DEFAULT '',
    unit_price INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  ordersCreatedAtIndex: "CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at)",
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
  users: string;
  options: string;
  orders_closed: 0 | 1;
  updated_at: string;
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
  size: "Tall" | "Grande";
  temp: "ICE" | "HOT";
  options: string;
  note: string;
  unit_price: number;
  created_at: string;
  updated_at: string;
};

