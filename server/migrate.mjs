// migrations/*.sql 가운데 아직 적용하지 않은 것을 순서대로 적용한다.
// 적용 기록은 wrangler와 같은 d1_migrations 테이블에 남긴다. 그래서 D1에서 내보낸 SQL을 넣은 DB도 이어서 쓸 수 있다.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export function applyMigrations(sqlite, dir, log = console.log) {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS d1_migrations(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`);
  const applied = new Set(sqlite.prepare("SELECT name FROM d1_migrations").all().map((r) => r.name));
  const pending = readdirSync(dir).filter((f) => f.endsWith(".sql") && !applied.has(f)).sort();
  for (const name of pending) {
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      sqlite.exec(readFileSync(path.join(dir, name), "utf8"));
      sqlite.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(name);
      sqlite.exec("COMMIT");
      log(`[migrate] ${name} 적용`);
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw new Error(`[migrate] ${name} 실패: ${error.message}`);
    }
  }
  return pending;
}
