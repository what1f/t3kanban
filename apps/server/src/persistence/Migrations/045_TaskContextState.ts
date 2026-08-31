import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`CREATE TABLE task_context_state (
    thread_id TEXT PRIMARY KEY,
    dirty INTEGER NOT NULL DEFAULT 1
  )`;

  // Task metadata is projected independently from provider turns. These
  // triggers keep the reminder state durable without adding transport state to
  // the Thread domain model.
  yield* sql`CREATE TRIGGER task_context_on_thread_insert
    AFTER INSERT ON projection_threads
    WHEN NEW.task_json IS NOT NULL
    BEGIN
      INSERT INTO task_context_state (thread_id, dirty) VALUES (NEW.thread_id, 1)
      ON CONFLICT(thread_id) DO UPDATE SET dirty = 1;
    END`;

  yield* sql`CREATE TRIGGER task_context_on_task_update
    AFTER UPDATE OF task_json ON projection_threads
    WHEN NEW.task_json IS NOT OLD.task_json
    BEGIN
      INSERT INTO task_context_state (thread_id, dirty) VALUES (NEW.thread_id, 1)
      ON CONFLICT(thread_id) DO UPDATE SET dirty = 1;
    END`;

  yield* sql`CREATE TRIGGER task_context_on_compaction
    AFTER INSERT ON projection_thread_activities
    WHEN NEW.kind = 'context-compaction'
    BEGIN
      INSERT INTO task_context_state (thread_id, dirty) VALUES (NEW.thread_id, 1)
      ON CONFLICT(thread_id) DO UPDATE SET dirty = 1;
    END`;

  yield* sql`INSERT INTO task_context_state (thread_id, dirty)
    SELECT thread_id, 1 FROM projection_threads WHERE task_json IS NOT NULL
    ON CONFLICT(thread_id) DO NOTHING`;
});
