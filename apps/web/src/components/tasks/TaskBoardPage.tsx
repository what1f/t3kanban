import {
  scopedProjectKey,
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { isValidOrderKey, planOrderKeyReorder } from "@t3tools/client-runtime/state/thread-sort";
import { BUILT_IN_TASK_STATUSES, type TaskStatus } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { Columns3Icon, ListIcon, PlusIcon, SearchIcon, Settings2Icon } from "lucide-react";
import { useCallback, useMemo, useState, type MouseEvent } from "react";
import { openCommandPalette } from "../../commandPaletteBus";
import { isElectron } from "../../env";
import { cn } from "../../lib/utils";
import { useProjects, useServerConfigs, useThreadShells } from "../../state/entities";
import { useTaskWorkbenches } from "../../state/taskWorkbench";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { readLocalApi } from "../../localApi";
import { useClientSettings } from "../../hooks/useSettings";
import { useThreadActions } from "../../hooks/useThreadActions";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { TaskStatusIcon } from "./TaskStatusIcon";
import { buildTaskContextMenuItems } from "./taskContextMenu";
import {
  isTaskThread,
  taskDetails,
  taskExecution,
  taskOpensEditor,
  type TaskThreadShell,
} from "./taskModel";

export function compareTaskOrder(a: EnvironmentThreadShell, b: EnvironmentThreadShell) {
  const aKey = a.task?.orderKey;
  const bKey = b.task?.orderKey;
  const aHasKey = aKey !== undefined && isValidOrderKey(aKey);
  const bHasKey = bKey !== undefined && isValidOrderKey(bKey);
  if (aHasKey && bHasKey) return aKey.localeCompare(bKey) || taskKey(a).localeCompare(taskKey(b));
  if (aHasKey !== bHasKey) return aHasKey ? -1 : 1;
  return a.createdAt.localeCompare(b.createdAt) || taskKey(a).localeCompare(taskKey(b));
}

const taskKey = (thread: EnvironmentThreadShell) =>
  scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));

export function resolveDirectTaskCreateProjectKey(
  selectedProjectKey: string | undefined,
  projectKeys: readonly string[],
): string | null {
  return selectedProjectKey ?? (projectKeys.length === 1 ? projectKeys[0]! : null);
}

export interface TaskStatusGroup {
  readonly status: TaskStatus;
  readonly tasks: ReadonlyArray<TaskThreadShell>;
}

export function groupTasksByStatus(
  tasks: readonly TaskThreadShell[],
  statuses: readonly TaskStatus[],
): ReadonlyArray<TaskStatusGroup> {
  const groups = statuses.map((status) => ({
    status,
    tasks: [] as TaskThreadShell[],
  }));
  const groupsByStatusId = new Map(groups.map((group) => [group.status.id, group]));
  const fallback = groups[0];

  for (const task of tasks) {
    const group = groupsByStatusId.get(task.task.statusId) ?? fallback;
    group?.tasks.push(task);
  }

  return groups.filter((group) => group.tasks.length > 0);
}

export function TaskBoardPage({ projectKey }: { projectKey?: string }) {
  const projects = useProjects();
  const threads = useThreadShells();
  const configs = useServerConfigs();
  const { errors } = useTaskWorkbenches();
  const project = projects.find(
    (p) => scopedProjectKey(scopeProjectRef(p.environmentId, p.id)) === projectKey,
  );
  const statuses = BUILT_IN_TASK_STATUSES;
  const [view, setView] = useState<"board" | "list">("board");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState<{
    projectKey?: string;
    returnProjectKey?: string;
    statusId?: string;
  } | null>(null);
  const [editing, setEditing] = useState<TaskThreadShell | null>(null);
  const [dragged, setDragged] = useState<TaskThreadShell | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const update = useAtomCommand(threadEnvironment.updateMetadata);
  const confirmThreadArchive = useClientSettings((settings) => settings.confirmThreadArchive);
  const { archiveThread, confirmAndDeleteThread } = useThreadActions();
  const projectOptions = projects.map((candidate) => ({
    key: scopedProjectKey(scopeProjectRef(candidate.environmentId, candidate.id)),
    title: candidate.title,
  }));
  const directCreateProjectKey = resolveDirectTaskCreateProjectKey(
    projectKey,
    projectOptions.map((option) => option.key),
  );
  const beginCreate = (targetProjectKey?: string, statusId?: string) =>
    setCreating({
      ...(targetProjectKey ? { projectKey: targetProjectKey } : {}),
      ...(projectKey ? { returnProjectKey: projectKey } : {}),
      ...(statusId ? { statusId } : {}),
    });
  const tasks = useMemo(
    () =>
      threads
        .filter(isTaskThread)
        .filter(
          (t) =>
            !t.archivedAt &&
            (!projectKey ||
              (t.projectId === project?.id && t.environmentId === project?.environmentId)) &&
            (!query ||
              `${t.title} ${t.task?.content ?? ""}`.toLowerCase().includes(query.toLowerCase())),
        )
        .toSorted(compareTaskOrder),
    [threads, projectKey, project, query],
  );
  const listGroups = useMemo(() => groupTasksByStatus(tasks, statuses), [tasks, statuses]);
  const statusFor = (thread: EnvironmentThreadShell) =>
    statuses.find((s) => s.id === thread.task?.statusId) ?? statuses[0];
  const projectName = (thread: EnvironmentThreadShell) =>
    projects.find((p) => p.id === thread.projectId && p.environmentId === thread.environmentId)
      ?.title ?? "Project";
  const agentName = (thread: EnvironmentThreadShell) =>
    thread.task?.assigned === false
      ? "Unassigned"
      : (configs
          .get(thread.environmentId)
          ?.providers.find((p) => p.instanceId === thread.modelSelection.instanceId)?.displayName ??
        thread.modelSelection.instanceId);
  const open = (thread: TaskThreadShell) => {
    if (taskOpensEditor(thread)) {
      setEditing(thread);
      return;
    }
    void navigate({
      to: "/$environmentId/$threadId",
      params: { environmentId: thread.environmentId, threadId: thread.id },
    });
  };
  const openTaskContextMenu = useCallback(
    async (event: MouseEvent, thread: EnvironmentThreadShell) => {
      event.preventDefault();
      event.stopPropagation();
      const api = readLocalApi();
      if (!api) return;
      const threadStatuses = statuses;
      if (!isTaskThread(thread)) return;
      const currentTask = taskDetails(thread);
      const clicked = await api.contextMenu.show(
        buildTaskContextMenuItems({
          statuses: threadStatuses,
          currentStatusId: currentTask.statusId,
          isRunning: thread.session?.status === "running" && thread.session.activeTurnId != null,
        }),
        { x: event.clientX, y: event.clientY },
      );
      if (!clicked) return;
      setError(null);
      if (clicked === "edit") {
        setEditing(thread);
        return;
      }
      if (clicked === "archive") {
        if (confirmThreadArchive) {
          const confirmed = await api.dialogs.confirm(`Archive task "${thread.title}"?`);
          if (!confirmed) return;
        }
        const result = await archiveThread(scopeThreadRef(thread.environmentId, thread.id));
        if (result._tag === "Failure") setError("Could not archive the task. Try again.");
        return;
      }
      if (clicked === "delete") {
        const result = await confirmAndDeleteThread({
          environmentId: thread.environmentId,
          threadId: thread.id,
        });
        if (result._tag === "Failure") setError("Could not delete the task. Try again.");
        return;
      }
      if (clicked.startsWith("status:")) {
        const statusId = clicked.slice("status:".length);
        const status = threadStatuses.find((candidate) => candidate.id === statusId);
        if (!status) return;
        const result = await update({
          environmentId: thread.environmentId,
          input: {
            threadId: thread.id,
            task: { ...currentTask, statusId: status.id },
          },
        });
        if (result._tag === "Failure") setError("Could not update the task status. Try again.");
        return;
      }
    },
    [archiveThread, confirmAndDeleteThread, confirmThreadArchive, statuses, update],
  );
  const move = async (status: TaskStatus, before?: EnvironmentThreadShell) => {
    if (!dragged) return;
    const draggedKey = taskKey(dragged);
    const other = tasks.filter((t) => taskKey(t) !== draggedKey && statusFor(t)?.id === status.id);
    const index = before ? other.findIndex((t) => taskKey(t) === taskKey(before)) : other.length;
    const source = dragged;
    const ordered = [...other];
    ordered.splice(index < 0 ? ordered.length : index, 0, source);
    const orderedByKey = new Map(ordered.map((thread) => [taskKey(thread), thread]));
    const assignments = planOrderKeyReorder({
      orderedIds: [...orderedByKey.keys()],
      keysById: new Map([...orderedByKey].map(([key, thread]) => [key, thread.task.orderKey])),
      movedId: taskKey(source),
    });
    setDragged(null);
    setDropTarget(null);
    setError(null);
    const results = await Promise.all(
      assignments.map((assignment) => {
        const thread = orderedByKey.get(assignment.id)!;
        return update({
          environmentId: thread.environmentId,
          input: {
            threadId: thread.id,
            task: {
              ...taskDetails(thread),
              ...(thread === source ? { statusId: status.id } : {}),
              orderKey: assignment.orderKey,
            },
          },
        });
      }),
    );
    if (results.some((result) => result._tag === "Failure"))
      setError("Could not move the task. Try again.");
  };
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <WorkspacePageHeader electron={isElectron} className="border-b border-border/60">
        <span className="text-sm font-medium">{project?.title ?? "All tasks"}</span>
        <span className="text-sm text-muted-foreground/45">/</span>
        <span className="text-sm text-muted-foreground">Tasks</span>
        <div className="no-drag ml-auto flex items-center gap-2">
          {project && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Project settings"
              onClick={() =>
                void navigate({ to: "/projects/$projectKey", params: { projectKey: projectKey! } })
              }
            >
              <Settings2Icon className="size-4" />
            </Button>
          )}
          {projects.length === 0 ? null : projectKey && directCreateProjectKey ? (
            <Button size="sm" variant="outline" onClick={() => beginCreate(directCreateProjectKey)}>
              <PlusIcon className="size-3.5" />
              New task
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => beginCreate(undefined)}>
              <PlusIcon className="size-3.5" />
              New task
            </Button>
          )}
        </div>
      </WorkspacePageHeader>
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4">
        <label className="flex max-w-64 items-center gap-2 text-muted-foreground">
          <SearchIcon className="size-3.5" />
          <input
            aria-label="Search tasks"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks…"
            className="min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground/60"
          />
        </label>
        <div className="flex items-center rounded-lg bg-muted/30 p-0.5" aria-label="Task view">
          {(
            [
              ["board", Columns3Icon, "Board"],
              ["list", ListIcon, "List"],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              onClick={() => setView(value)}
              aria-pressed={view === value}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-muted-foreground",
                view === value && "bg-muted text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>
      {(error || errors.length > 0) && (
        <p role="alert" className="px-5 py-2 text-sm text-destructive">
          {error ?? errors[0]}
        </p>
      )}
      {projects.length === 0 ? (
        <div className="grid flex-1 place-content-center gap-4 text-center">
          <h1 className="text-lg font-medium">Start with a project</h1>
          <p className="text-sm text-muted-foreground">
            Connect a local directory to organize your Agent work.
          </p>
          <Button
            variant="outline"
            onClick={() =>
              openCommandPalette({ open: "add-project", afterProjectAdd: "task-board" })
            }
          >
            <PlusIcon className="size-4" />
            Add project
          </Button>
        </div>
      ) : view === "board" ? (
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4" aria-label="Task board">
          {statuses.map((status) => {
            const column = tasks.filter((t) => statusFor(t)?.id === status.id);
            return (
              <section
                key={status.id}
                aria-label={`${status.name} column`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTarget(status.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  void move(status);
                }}
                className={cn(
                  "flex min-w-[250px] flex-1 flex-col rounded-xl border border-border/60 bg-muted/10 transition-colors",
                  dropTarget === status.id && "border-primary/40 bg-muted/30",
                )}
              >
                <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/50 px-3">
                  <TaskStatusIcon status={status} />
                  <h2 className="text-sm font-medium">{status.name}</h2>
                  <span className="rounded-full bg-muted/70 px-1.5 text-xs tabular-nums text-muted-foreground">
                    {column.length}
                  </span>
                  {projectKey && directCreateProjectKey ? (
                    <button
                      aria-label={`Add task to ${status.name}`}
                      className="ml-auto cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => beginCreate(directCreateProjectKey, status.id)}
                    >
                      <PlusIcon className="size-4" />
                    </button>
                  ) : (
                    <button
                      aria-label={`Add task to ${status.name}`}
                      className="ml-auto cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => beginCreate(undefined, status.id)}
                    >
                      <PlusIcon className="size-4" />
                    </button>
                  )}
                </div>
                <div className="min-h-20 flex-1 space-y-2 overflow-y-auto p-2">
                  {column.map((thread) => (
                    <article
                      key={`${thread.environmentId}:${thread.id}`}
                      draggable
                      onDragStart={(e) => {
                        setDragged(thread);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", thread.id);
                      }}
                      onDragEnd={() => {
                        setDragged(null);
                        setDropTarget(null);
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void move(status, thread);
                      }}
                      onContextMenu={(event) => void openTaskContextMenu(event, thread)}
                      className={cn(
                        "rounded-lg border border-border/60 bg-background/65 text-left transition-colors hover:border-border",
                        dragged?.id === thread.id && "opacity-40",
                      )}
                    >
                      <button
                        className="w-full space-y-2.5 p-3 text-left"
                        onClick={() => open(thread)}
                      >
                        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                          <span className="truncate">{projectName(thread)}</span>
                          <span className="shrink-0 rounded-full border border-border/70 px-1.5 py-0.5 text-[10px]">
                            {agentName(thread)}
                          </span>
                        </div>
                        <h3 className="line-clamp-2 text-sm leading-5">{thread.title}</h3>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span
                            className={cn(
                              "size-1.5 rounded-full bg-muted-foreground/40",
                              thread.session?.status === "running" &&
                                "animate-pulse bg-emerald-500",
                            )}
                          />
                          {taskExecution(thread)}
                        </div>
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          {listGroups.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border/60">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/10 text-xs text-muted-foreground">
                    <th className="py-3 pl-3 font-normal">Task</th>
                    <th className="font-normal">Project</th>
                    <th className="font-normal">Assigned</th>
                    <th className="pr-3 font-normal">Execution</th>
                  </tr>
                </thead>
                {listGroups.map(({ status, tasks: groupTasks }) => (
                  <tbody key={status.id}>
                    <tr className="border-b border-border/60 bg-muted/10">
                      <th colSpan={4} scope="rowgroup" className="px-3 py-2.5 text-left">
                        <div className="flex items-center gap-2">
                          <TaskStatusIcon status={status} />
                          <span className="text-sm font-medium">{status.name}</span>
                          <span className="rounded-full bg-muted/70 px-1.5 text-xs tabular-nums text-muted-foreground">
                            {groupTasks.length}
                          </span>
                          <button
                            aria-label={`Add task to ${status.name}`}
                            className="ml-auto cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={() =>
                              beginCreate(
                                projectKey && directCreateProjectKey
                                  ? directCreateProjectKey
                                  : undefined,
                                status.id,
                              )
                            }
                          >
                            <PlusIcon className="size-4" />
                          </button>
                        </div>
                      </th>
                    </tr>
                    {groupTasks.map((thread) => (
                      <tr
                        key={`${thread.environmentId}:${thread.id}`}
                        onContextMenu={(event) => void openTaskContextMenu(event, thread)}
                        className="border-b border-border/50 last:border-b-0 hover:bg-muted/25"
                      >
                        <td className="max-w-96">
                          <button
                            className="w-full px-3 py-3.5 text-left"
                            onClick={() => open(thread)}
                          >
                            {thread.title}
                          </button>
                        </td>
                        <td className="pr-4 text-xs text-muted-foreground">
                          {projectName(thread)}
                        </td>
                        <td className="pr-4 text-xs text-muted-foreground">{agentName(thread)}</td>
                        <td className="pr-3 text-xs text-muted-foreground">
                          {taskExecution(thread)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          )}
          {listGroups.length === 0 && (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {query ? "No matching tasks" : "No tasks yet"}
            </p>
          )}
        </div>
      )}
      {creating && <CreateTaskDialog {...creating} onClose={() => setCreating(null)} />}
      {editing && <CreateTaskDialog editingTask={editing} onClose={() => setEditing(null)} />}
    </SidebarInset>
  );
}
