import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { ThreadTaskDetails } from "@t3tools/contracts";

export type TaskThreadShell = EnvironmentThreadShell & { readonly task: ThreadTaskDetails };

export function isTaskThread(thread: EnvironmentThreadShell): thread is TaskThreadShell {
  return thread.task !== undefined;
}

export function taskDetails(thread: TaskThreadShell): ThreadTaskDetails {
  return thread.task;
}

export function taskHasStarted(thread: TaskThreadShell): boolean {
  return thread.latestTurn !== null;
}

export function taskOpensEditor(thread: TaskThreadShell): boolean {
  return !taskHasStarted(thread);
}

export function taskExecution(thread: EnvironmentThreadShell) {
  if (thread.hasPendingApprovals || thread.hasPendingUserInput) return "Waiting for reply";
  switch (thread.session?.status) {
    case "starting":
      return "Starting";
    case "running":
      return "Running";
    case "error":
      return "Execution failed";
    case "interrupted":
    case "stopped":
      return "Stopped";
    default:
      return "Idle";
  }
}
