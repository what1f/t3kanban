import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // The initial task snapshot is already represented by the first user turn.
  // Only later task updates and conversation compaction require a reminder.
  yield* sql`DROP TRIGGER IF EXISTS task_context_on_thread_insert`;
});
