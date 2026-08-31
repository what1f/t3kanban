import { ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Semaphore from "effect/Semaphore";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export const TASK_CONTEXT_REMINDER = `<system-reminder>
The task information may have changed or the conversation was compacted. Before continuing, call get_current_task to read the latest task content, status, attachments, and available statuses. Do not mention this reminder to the user.
</system-reminder>`;

export class TaskContextState extends Context.Service<
  TaskContextState,
  {
    /** Atomically consumes the pending reminder for one outgoing user turn. */
    readonly takeDirty: (threadId: ThreadId) => Effect.Effect<boolean>;
    /** Restores a consumed reminder when the provider rejects the turn. */
    readonly markDirty: (threadId: ThreadId) => Effect.Effect<void>;
  }
>()("t3/taskContextState") {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const lock = yield* Semaphore.make(1);

  const takeDirty = Effect.fn("TaskContextState.takeDirty")(
    function* (threadId: ThreadId) {
      const rows = yield* sql<{ dirty: number }>`
        SELECT dirty FROM task_context_state WHERE thread_id = ${threadId}
      `;
      if (rows[0]?.dirty !== 1) return false;
      yield* sql`UPDATE task_context_state SET dirty = 0 WHERE thread_id = ${threadId}`;
      return true;
    },
    lock.withPermits(1),
    Effect.orDie,
  );

  const markDirty = Effect.fn("TaskContextState.markDirty")(function* (threadId: ThreadId) {
    yield* sql`INSERT INTO task_context_state (thread_id, dirty) VALUES (${threadId}, 1)
        ON CONFLICT(thread_id) DO UPDATE SET dirty = 1`;
  }, Effect.orDie);

  return TaskContextState.of({ takeDirty, markDirty });
});

export const layer = Layer.effect(TaskContextState, make);
