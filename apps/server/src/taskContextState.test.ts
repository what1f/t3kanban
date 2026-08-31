import { ThreadId } from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { TaskContextState, layer } from "./taskContextState.ts";

it.effect("consumes a dirty reminder once and is dirtied again by compaction", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const state = yield* TaskContextState;
    const threadId = ThreadId.make("thread-task-context");

    yield* state.markDirty(threadId);
    expect(yield* state.takeDirty(threadId)).toBe(true);
    expect(yield* state.takeDirty(threadId)).toBe(false);

    yield* sql`INSERT INTO projection_thread_activities (
      activity_id, thread_id, turn_id, tone, kind, summary, payload_json, sequence, created_at
    ) VALUES (
      'activity-compacted', ${threadId}, NULL, 'info', 'context-compaction',
      'Context compacted', '{}', 1, '2026-01-01T00:00:00.000Z'
    )`;

    expect(yield* state.takeDirty(threadId)).toBe(true);
    expect(yield* state.takeDirty(threadId)).toBe(false);
  }).pipe(Effect.provide(layer.pipe(Layer.provideMerge(SqlitePersistenceMemory)))),
);
