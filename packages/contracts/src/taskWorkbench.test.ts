import { assert, it } from "@effect/vitest";

import { BUILT_IN_TASK_STATUSES } from "./taskWorkbench.ts";

it("places blocked tasks after review and before done", () => {
  assert.deepStrictEqual(
    BUILT_IN_TASK_STATUSES.map((status) => status.id),
    ["todo", "in-progress", "in-review", "blocked", "done"],
  );
  assert.strictEqual(BUILT_IN_TASK_STATUSES[3]?.name, "Blocked");
  assert.strictEqual(BUILT_IN_TASK_STATUSES[3]?.completed, false);
});
