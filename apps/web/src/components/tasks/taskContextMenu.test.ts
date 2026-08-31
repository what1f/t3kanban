import type { TaskStatus } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { buildTaskContextMenuItems } from "./taskContextMenu";

const statuses: readonly TaskStatus[] = [
  { id: "todo", name: "Todo", position: 0, completed: false },
  { id: "review", name: "In Review", position: 1, completed: false },
];

describe("buildTaskContextMenuItems", () => {
  it("exposes status, edit, archive, and destructive delete actions", () => {
    const items = buildTaskContextMenuItems({
      statuses,
      currentStatusId: "todo",
      isRunning: false,
    });

    expect(items.map((item) => item.label)).toEqual([
      "Status",
      "Edit task",
      "Archive task",
      "Delete…",
    ]);
    expect(items[0]?.children?.map((item) => item.id)).toEqual(["status:todo", "status:review"]);
    expect(items[0]?.children?.[0]?.label).toContain("✓");
    expect(items[1]).toMatchObject({ id: "edit", icon: "pencil" });
    expect(items[2]).toMatchObject({
      id: "archive",
      icon: "archive",
      disabled: false,
      separatorBefore: true,
    });
    expect(items[3]).toMatchObject({ destructive: true, icon: "trash" });
  });

  it("disables archive while the task is running", () => {
    const items = buildTaskContextMenuItems({
      statuses,
      currentStatusId: "todo",
      isRunning: true,
    });

    expect(items[2]).toMatchObject({ id: "archive", disabled: true });
  });
});
