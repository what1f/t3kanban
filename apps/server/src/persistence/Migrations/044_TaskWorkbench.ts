import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE projection_threads ADD COLUMN task_json TEXT`;
  yield* sql`CREATE TABLE task_inbox (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read_at TEXT,
    deleted_at TEXT
  )`;
  yield* sql`CREATE INDEX task_inbox_created ON task_inbox (created_at DESC, id)`;
});
