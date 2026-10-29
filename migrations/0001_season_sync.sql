-- 새메뉴 자동 반영: 음료가 어느 새메뉴 행사에서 왔는지 기록해 행사가 끝나면 함께 지운다.
ALTER TABLE drinks ADD COLUMN source_event_id TEXT;

-- 처리한 새메뉴 행사. 같은 행사를 다시 읽지 않고, 종료일이 지나면 연결된 음료를 지우는 기준이 된다.
CREATE TABLE IF NOT EXISTS menu_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  release_date TEXT NOT NULL,
  expire_date TEXT,
  status TEXT NOT NULL CHECK (status IN ('added', 'failed', 'expired')),
  items TEXT NOT NULL DEFAULT '[]',
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL
);

-- 마지막 확인 결과 (단일 행). 관리자 화면에 보여준다.
CREATE TABLE IF NOT EXISTS season_sync (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ran_at TEXT NOT NULL,
  trigger TEXT NOT NULL,
  report TEXT NOT NULL DEFAULT '{}'
);
