import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { describe, expect, it } from "vite-plus/test";

import {
  isTaskThread,
  taskDetails,
  taskHasStarted,
  taskOpensEditor,
  type TaskThreadShell,
} from "./taskModel";

describe("task model", () => {
  it("does not synthesize task state for a plain thread", () => {
    expect(isTaskThread({ task: undefined } as EnvironmentThreadShell)).toBe(false);
  });

  it("returns the persisted task details unchanged", () => {
    const task = {
      content: "Persisted task",
      attachments: [],
      statusId: "in-progress",
      orderKey: "n",
    };
    const thread = { task } as unknown as EnvironmentThreadShell;

    expect(isTaskThread(thread)).toBe(true);
    if (isTaskThread(thread)) expect(taskDetails(thread)).toBe(task);
  });

  it("keeps tasks without a first turn in the editor", () => {
    const unstarted = { task: { content: "" }, latestTurn: null } as TaskThreadShell;
    const started = { task: { content: "" }, latestTurn: { turnId: "turn-1" } } as TaskThreadShell;

    expect(taskHasStarted(unstarted)).toBe(false);
    expect(taskOpensEditor(unstarted)).toBe(true);
    expect(taskHasStarted(started)).toBe(true);
    expect(taskOpensEditor(started)).toBe(false);
  });
});
