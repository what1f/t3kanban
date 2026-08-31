import { describe, expect, it } from "vite-plus/test";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";

import {
  compareTaskOrder,
  groupTasksByStatus,
  resolveDirectTaskCreateProjectKey,
} from "./TaskBoardPage";
import type { TaskThreadShell } from "./taskModel";

describe("resolveDirectTaskCreateProjectKey", () => {
  it("uses the only project from the all-tasks board", () => {
    expect(resolveDirectTaskCreateProjectKey(undefined, ["local:project-1"])).toBe(
      "local:project-1",
    );
  });

  it("uses the selected project and requires a choice when several are unselected", () => {
    expect(resolveDirectTaskCreateProjectKey("local:project-2", ["local:project-1"])).toBe(
      "local:project-2",
    );
    expect(
      resolveDirectTaskCreateProjectKey(undefined, ["local:project-1", "local:project-2"]),
    ).toBeNull();
  });
});

describe("compareTaskOrder", () => {
  const thread = (id: string, createdAt: string, orderKey: string): EnvironmentThreadShell =>
    ({ id, createdAt, task: { orderKey } }) as EnvironmentThreadShell;

  it("sorts materialized fractional keys lexically", () => {
    expect(
      [
        thread("later", "2026-01-01T00:00:00.000Z", "t"),
        thread("earlier", "2026-01-02T00:00:00.000Z", "g"),
      ]
        .toSorted(compareTaskOrder)
        .map((item) => item.id),
    ).toEqual(["earlier", "later"]);
  });

  it("keeps legacy non-fractional keys in stable creation order", () => {
    expect(
      [
        thread("later", "2026-01-02T00:00:00.000Z", "1700000000000"),
        thread("earlier", "2026-01-01T00:00:00.000Z", "1690000000000"),
      ]
        .toSorted(compareTaskOrder)
        .map((item) => item.id),
    ).toEqual(["earlier", "later"]);
  });
});

describe("groupTasksByStatus", () => {
  const statuses = [
    { id: "todo", name: "Todo", position: 0, completed: false },
    { id: "in-progress", name: "In Progress", position: 1, completed: false },
    { id: "done", name: "Done", position: 2, completed: true },
  ];
  const task = (id: string, statusId: string) =>
    ({
      id,
      task: { statusId },
    }) as unknown as TaskThreadShell;

  it("keeps configured status order and omits empty groups", () => {
    const groups = groupTasksByStatus(
      [task("done-1", "done"), task("todo-1", "todo"), task("todo-2", "todo")],
      statuses,
    );

    expect(groups.map((group) => [group.status.id, group.tasks.map((item) => item.id)])).toEqual([
      ["todo", ["todo-1", "todo-2"]],
      ["done", ["done-1"]],
    ]);
  });

  it("places an unknown task status in the first configured group", () => {
    const groups = groupTasksByStatus([task("legacy", "removed-status")], statuses);

    expect(groups[0]?.tasks.map((item) => item.id)).toEqual(["legacy"]);
  });
});
