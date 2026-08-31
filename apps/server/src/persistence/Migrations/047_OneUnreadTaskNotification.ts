import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`UPDATE task_inbox
    SET read_at = created_at
    WHERE id IN (
      SELECT id
      FROM (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY thread_id
            ORDER BY created_at DESC, id DESC
          ) AS unread_position
        FROM task_inbox
        WHERE read_at IS NULL AND deleted_at IS NULL
      ) ranked_unread
      WHERE unread_position > 1
    )`;

  yield* sql`CREATE UNIQUE INDEX task_inbox_one_unread_per_thread
    ON task_inbox (thread_id)
    WHERE read_at IS NULL AND deleted_at IS NULL`;
});
