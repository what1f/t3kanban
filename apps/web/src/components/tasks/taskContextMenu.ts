import type { ContextMenuItem, TaskStatus } from "@t3tools/contracts";

export type TaskContextMenuAction =
  | "status:menu"
  | `status:${string}`
  | "edit"
  | "archive"
  | "delete";

export interface TaskContextMenuInput {
  readonly statuses: ReadonlyArray<TaskStatus>;
  readonly currentStatusId: string;
  readonly isRunning: boolean;
}

/**
 * Actions available from a task card's context menu. The menu is routed
 * through the existing LocalApi bridge so Electron gets a native menu while
 * the web client gets the same nested fallback menu.
 */
export function buildTaskContextMenuItems(
  input: TaskContextMenuInput,
): ReadonlyArray<ContextMenuItem<TaskContextMenuAction>> {
  const statusChildren = input.statuses.map(
    (status): ContextMenuItem<TaskContextMenuAction> => ({
      id: `status:${status.id}`,
      label: status.id === input.currentStatusId ? `${status.name} ✓` : status.name,
    }),
  );
  return [
    statusChildren.length > 0
      ? {
          id: "status:menu",
          label: "Status",
          children: statusChildren,
        }
      : { id: "status:menu", label: "Status", disabled: true },
    { id: "edit", label: "Edit task", icon: "pencil" },
    {
      id: "archive",
      label: "Archive task",
      icon: "archive",
      disabled: input.isRunning,
      separatorBefore: true,
    },
    {
      id: "delete",
      label: "Delete…",
      destructive: true,
      icon: "trash",
    },
  ];
}
