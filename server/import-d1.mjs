// Cloudflare D1에서 내보낸 SQL(wrangler d1 export)을 빈 SQLite 파일에 넣는다. 운영을 쿠버네티스로 옮길 때 쓴다.
//   node server/import-d1.mjs <export.sql> [db 파일, 기본: $DATA_DIR/attije.db]
// 서버는 시작할 때 $DATA_DIR/import.sql 이 있으면 이 함수로 자동으로 넣는다(server.mjs).
// 넣은 뒤에는 d1_migrations 기록을 보고 남은 마이그레이션만 적용한다.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

export function importD1Export(exportFile, target) {
  if (!existsSync(exportFile)) throw new Error(`${exportFile} 파일이 없습니다.`);
  const sqlite = new DatabaseSync(target);
  try {
    // D1 export는 CREATE TABLE에 IF NOT EXISTS가 없어서 빈 DB에만 넣을 수 있다.
    const tables = sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get().n;
    if (tables > 0) throw new Error(`${target}에 이미 테이블이 ${tables}개 있습니다. 비어 있는 DB에만 넣습니다.`);
    sqlite.exec("BEGIN");
    try {
      sqlite.exec(readFileSync(exportFile, "utf8"));
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
    const count = (table) => { try { return sqlite.prepare(`SELECT count(*) AS n FROM "${table}"`).get().n; } catch { return "-"; } };
    let applied = [];
    try { applied = sqlite.prepare("SELECT name FROM d1_migrations ORDER BY id").all().map((r) => r.name); } catch { /* 기록이 없는 export */ }
    return { members: count("members"), drinks: count("drinks"), orders: count("orders"), order_history: count("order_history"), applied };
  } finally {
    sqlite.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [exportFile, target = path.join(process.env.DATA_DIR || "./data", "attije.db")] = process.argv.slice(2);
  if (!exportFile) {
    console.error("사용법: node server/import-d1.mjs <export.sql> [db 파일]");
    process.exit(1);
  }
  try {
    const r = importD1Export(exportFile, target);
    console.log(`넣었습니다: ${target}`);
    console.log(`  members ${r.members} · drinks ${r.drinks} · orders ${r.orders} · order_history ${r.order_history}`);
    console.log(`  적용된 마이그레이션: ${r.applied.join(", ") || "없음"}`);
  } catch (error) {
    console.error(`넣지 못했습니다: ${error.message}`);
    console.error("서버를 멈추고 DB 파일(-wal, -shm 포함)을 지운 뒤 다시 실행하세요.");
    process.exit(1);
  }
}
