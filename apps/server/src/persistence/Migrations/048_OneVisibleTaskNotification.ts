import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`UPDATE task_inbox
    SET deleted_at = created_at
    WHERE id IN (
      SELECT id
      FROM (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY thread_id
            ORDER BY created_at DESC, id DESC
          ) AS visible_position
        FROM task_inbox
        WHERE deleted_at IS NULL
      ) ranked_visible
      WHERE visible_position > 1
    )`;

  yield* sql`CREATE UNIQUE INDEX task_inbox_one_visible_per_thread
    ON task_inbox (thread_id)
    WHERE deleted_at IS NULL`;
});
