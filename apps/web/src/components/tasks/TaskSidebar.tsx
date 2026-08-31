import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { isAtomCommandInterrupted } from "@t3tools/client-runtime/state/runtime";
import {
  ChevronDownIcon,
  InboxIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SettingsIcon,
  SquareKanbanIcon,
} from "lucide-react";
import { useCallback, useMemo, useState, type MouseEvent } from "react";
import { scopedProjectKey, scopeProjectRef } from "@t3tools/client-runtime/environment";
import { readLocalApi } from "../../localApi";
import {
  revealInFileExplorerLabel,
  revealInFileExplorerLabelForKind,
  revealInFileExplorerLabelForOs,
} from "../preview/fileExplorerLabel";
import { useProjects, useServerConfigs, useThreadShells } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { shellEnvironment } from "../../state/shell";
import { useTaskWorkbenches } from "../../state/taskWorkbench";
import { useAtomCommand } from "../../state/use-atom-command";
import { useUiStateStore } from "../../uiStateStore";
import { openCommandPalette } from "../../commandPaletteBus";
import { isElectron } from "../../env";
import { cn } from "../../lib/utils";
import { toastManager } from "../ui/toast";
import { SidebarChromeHeader } from "../sidebar/SidebarChrome";
import { SidebarContent, SidebarFooter, useSidebar } from "../ui/sidebar";
import { ProjectFavicon } from "../ProjectFavicon";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { buildProjectSidebarMenuItems, orderProjectsWithPinnedFirst } from "./taskSidebar.logic";

function projectKey(project: Pick<EnvironmentProject, "environmentId" | "id">): string {
  return scopedProjectKey(scopeProjectRef(project.environmentId, project.id));
}

interface CreatingTask {
  readonly projectKey?: string;
  readonly returnProjectKey?: string;
}

export default function TaskSidebar() {
  const projects = useProjects();
  const threads = useThreadShells();
  const serverConfigs = useServerConfigs();
  const { snapshots } = useTaskWorkbenches();
  const [expanded, setExpanded] = useState(true);
  const [creating, setCreating] = useState<CreatingTask | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const pinnedProjectKeys = useUiStateStore((state) => state.pinnedProjectKeys);
  const setProjectPinned = useUiStateStore((state) => state.setProjectPinned);
  const deleteProject = useAtomCommand(projectEnvironment.delete, { reportFailure: false });
  const revealProjectInFileManager = useAtomCommand(shellEnvironment.openInEditor, {
    reportFailure: false,
  });
  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };
  const unread = [...snapshots.values()].reduce(
    (total, snapshot) => total + snapshot.unreadCount,
    0,
  );
  const selectedProject = new URLSearchParams(location.searchStr).get("project");
  const orderedProjects = useMemo(
    () => orderProjectsWithPinnedFirst(projects, pinnedProjectKeys, projectKey),
    [pinnedProjectKeys, projects],
  );
  const projectThreadCountByKey = useMemo(() => {
    const counts = new Map<string, number>();
    for (const thread of threads) {
      const key = scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [threads]);
  const revealLabelForProject = useCallback(
    (project: EnvironmentProject): string => {
      const config = serverConfigs.get(project.environmentId);
      if (config?.shellRevealInFileManagerKind !== undefined) {
        return revealInFileExplorerLabelForKind(config.shellRevealInFileManagerKind);
      }
      if (config !== undefined) {
        return revealInFileExplorerLabelForOs(config.environment.platform.os);
      }
      return revealInFileExplorerLabel(typeof navigator === "undefined" ? "" : navigator.platform);
    },
    [serverConfigs],
  );
  const handleRevealProject = useCallback(
    async (project: EnvironmentProject) => {
      const result = await revealProjectInFileManager({
        environmentId: project.environmentId,
        input: {
          cwd: project.workspaceRoot,
          editor: "file-manager",
          reveal: true,
        },
      });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        toastManager.add({
          type: "error",
          title: "Could not show the project folder",
          description: "Try again.",
        });
      }
    },
    [revealProjectInFileManager],
  );
  const handleRemoveProject = useCallback(
    async (project: EnvironmentProject) => {
      const api = readLocalApi();
      if (!api) return;

      const key = projectKey(project);
      const threadCount = projectThreadCountByKey.get(key) ?? 0;
      const confirmed = await api.dialogs.confirm(
        threadCount > 0
          ? `Remove project "${project.title}" and delete its ${threadCount} task${threadCount === 1 ? "" : "s"}?`
          : `Remove project "${project.title}"?`,
        { variant: "destructive" },
      );
      if (!confirmed) return;

      const result = await deleteProject({
        environmentId: project.environmentId,
        input: {
          projectId: project.id,
          ...(threadCount > 0 ? { force: true } : {}),
        },
      });
      if (result._tag === "Failure") {
        if (!isAtomCommandInterrupted(result)) {
          toastManager.add({
            type: "error",
            title: "Could not remove the project",
            description: "Try again.",
          });
        }
        return;
      }

      setProjectPinned(key, false);
      setCreating(null);
      if (selectedProject === key) {
        void navigate({ to: "/", search: {} });
      }
    },
    [deleteProject, navigate, projectThreadCountByKey, selectedProject, setProjectPinned],
  );
  const openProjectMenu = useCallback(
    (event: MouseEvent<HTMLElement>, project: EnvironmentProject) => {
      event.preventDefault();
      event.stopPropagation();
      const api = readLocalApi();
      if (!api) return;

      const key = projectKey(project);
      const isPinned = pinnedProjectKeys.includes(key);
      const config = serverConfigs.get(project.environmentId);
      const clicked = api.contextMenu.show(
        buildProjectSidebarMenuItems({
          isPinned,
          revealLabel: revealLabelForProject(project),
          revealDisabled: config?.shellRevealInFileManager !== true,
        }),
        { x: event.clientX, y: event.clientY },
      );
      void clicked
        .then(async (action) => {
          if (action === "pin") {
            setProjectPinned(key, !isPinned);
          } else if (action === "reveal") {
            await handleRevealProject(project);
          } else if (action === "remove") {
            await handleRemoveProject(project);
          }
        })
        .catch(() => {
          toastManager.add({
            type: "error",
            title: "Could not open the project menu",
            description: "Try again.",
          });
        });
    },
    [
      handleRemoveProject,
      handleRevealProject,
      pinnedProjectKeys,
      revealLabelForProject,
      serverConfigs,
      setProjectPinned,
    ],
  );
  const row =
    "flex min-h-9 items-center gap-2.5 rounded-lg px-3 text-sm text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors";
  return (
    <>
      <SidebarChromeHeader isElectron={isElectron} />
      <SidebarContent className="gap-6 px-2 py-4">
        <nav className="space-y-1" aria-label="Workbench navigation">
          <Link
            to="/inbox"
            onClick={closeMobile}
            className={cn(
              row,
              location.pathname === "/inbox" && "bg-sidebar-accent text-sidebar-foreground",
            )}
          >
            <InboxIcon className="size-4" />
            Inbox
            {unread > 0 && (
              <span className="ml-auto rounded-md bg-muted px-1.5 text-xs tabular-nums">
                {unread}
              </span>
            )}
          </Link>
          <div
            className={cn(
              "group/task-board flex min-h-9 items-center rounded-lg px-1.5 transition-colors hover:bg-sidebar-accent",
              location.pathname === "/" &&
                !selectedProject &&
                "bg-sidebar-accent text-sidebar-foreground",
            )}
          >
            <Link
              to="/"
              search={{}}
              onClick={closeMobile}
              className="flex min-w-0 flex-1 items-center gap-2.5 px-1.5 py-1.5 text-sm text-sidebar-foreground/75"
            >
              <SquareKanbanIcon className="size-4" />
              Task board
            </Link>
            {projects.length > 0 && (
              <button
                aria-label="New task"
                onClick={() =>
                  setCreating(selectedProject ? { returnProjectKey: selectedProject } : {})
                }
                className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-background/70 hover:text-sidebar-foreground focus-visible:opacity-100 group-hover/task-board:opacity-100"
              >
                <PlusIcon className="size-3.5" />
              </button>
            )}
          </div>
        </nav>
        <section className="min-w-0">
          <div className="mb-1.5 flex h-8 items-center px-2.5 text-xs font-medium text-muted-foreground">
            <button
              className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left hover:text-sidebar-foreground"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
            >
              Projects
              <ChevronDownIcon
                className={cn("size-3.5 transition-transform", !expanded && "-rotate-90")}
              />
            </button>
            <button
              aria-label="Add project"
              onClick={() =>
                openCommandPalette({ open: "add-project", afterProjectAdd: "task-board" })
              }
              className="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <PlusIcon className="size-3.5" />
            </button>
          </div>
          {expanded && (
            <nav className="space-y-0.5" aria-label="Projects">
              {orderedProjects.map((project) => {
                const key = projectKey(project);
                return (
                  <div
                    key={key}
                    className={cn(
                      "group/project-row flex min-h-9 min-w-0 items-center rounded-md px-1.5 transition-colors hover:bg-sidebar-accent",
                      location.pathname === "/" &&
                        selectedProject === key &&
                        "bg-sidebar-accent text-sidebar-foreground",
                    )}
                    onContextMenu={(event) => openProjectMenu(event, project)}
                  >
                    <Link
                      to="/"
                      search={{ project: key }}
                      onClick={closeMobile}
                      className="flex min-w-0 flex-1 items-center gap-2.5 px-1 py-1.5 text-sm text-sidebar-foreground/80"
                    >
                      <ProjectFavicon
                        environmentId={project.environmentId}
                        cwd={project.workspaceRoot}
                        faviconPath={project.faviconPath}
                        className="size-4"
                      />
                      <span className="truncate">{project.title}</span>
                    </Link>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        aria-label={`Project actions for ${project.title}`}
                        aria-haspopup="menu"
                        onClick={(event) => openProjectMenu(event, project)}
                        className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-background/70 hover:text-sidebar-foreground focus-visible:opacity-100 group-hover/project-row:opacity-100"
                      >
                        <MoreHorizontalIcon className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`New task in ${project.title}`}
                        onClick={() => setCreating({ projectKey: key, returnProjectKey: key })}
                        className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-background/70 hover:text-sidebar-foreground focus-visible:opacity-100 group-hover/project-row:opacity-100"
                      >
                        <PlusIcon className="size-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </nav>
          )}
        </section>
      </SidebarContent>
      <SidebarFooter className="p-3">
        <Link
          to="/settings"
          onClick={closeMobile}
          aria-label="Settings"
          className="w-fit rounded-lg p-2 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          <SettingsIcon className="size-4" />
        </Link>
      </SidebarFooter>
      {creating && (
        <CreateTaskDialog {...creating} statusId="todo" onClose={() => setCreating(null)} />
      )}
    </>
  );
}
