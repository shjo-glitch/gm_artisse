// Cloudflare D1과 같은 모양(prepare·bind·first·all·run·batch)으로 SQLite 파일을 쓰게 하는 어댑터.
// functions/api 와 lib/ 코드를 고치지 않고 Node 서버에서 그대로 돌리기 위해 쓴다.
import { DatabaseSync } from "node:sqlite";

const plain = (row) => (row ? { ...row } : null);

class Statement {
  constructor(sqlite, sql, params = []) {
    this.sqlite = sqlite;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) {
    return new Statement(this.sqlite, this.sql, params);
  }
  firstSync(column) {
    const row = plain(this.sqlite.prepare(this.sql).get(...this.params));
    return column && row ? row[column] ?? null : row;
  }
  allSync() {
    return { success: true, results: this.sqlite.prepare(this.sql).all(...this.params).map(plain), meta: {} };
  }
  runSync() {
    const r = this.sqlite.prepare(this.sql).run(...this.params);
    return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async first(column) { return this.firstSync(column); }
  async all() { return this.allSync(); }
  async run() { return this.runSync(); }
}

export function openD1(file) {
  const sqlite = new DatabaseSync(file);
  sqlite.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  return {
    sqlite,
    prepare: (sql) => new Statement(sqlite, sql),
    // D1의 batch는 한 트랜잭션이다. 중간에 await를 두지 않아야 다른 요청의 문장이 끼어들지 않는다.
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((s) => (/^\s*(select|with)\b/i.test(s.sql) ? s.allSync() : s.runSync()));
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    async exec(sql) {
      sqlite.exec(sql);
      return { count: 0, duration: 0 };
    },
    close: () => sqlite.close(),
  };
}
