import type { ContextMenuItem } from "@t3tools/contracts";

export type ProjectSidebarMenuAction = "pin" | "reveal" | "remove";

export function orderProjectsWithPinnedFirst<T>(
  projects: readonly T[],
  pinnedProjectKeys: readonly string[],
  getProjectKey: (project: T) => string,
): T[] {
  const projectByKey = new Map(projects.map((project) => [getProjectKey(project), project]));
  const ordered: T[] = [];
  const seen = new Set<string>();

  for (const projectKey of pinnedProjectKeys) {
    const project = projectByKey.get(projectKey);
    if (project === undefined || seen.has(projectKey)) {
      continue;
    }
    seen.add(projectKey);
    ordered.push(project);
  }

  for (const project of projects) {
    const projectKey = getProjectKey(project);
    if (!seen.has(projectKey)) {
      seen.add(projectKey);
      ordered.push(project);
    }
  }

  return ordered;
}

export function buildProjectSidebarMenuItems(input: {
  readonly isPinned: boolean;
  readonly revealLabel: string;
  readonly revealDisabled: boolean;
}): ReadonlyArray<ContextMenuItem<ProjectSidebarMenuAction>> {
  return [
    {
      id: "pin",
      label: input.isPinned ? "Unpin" : "Pin",
      icon: input.isPinned ? "pin-off" : "pin",
    },
    {
      id: "reveal",
      label: input.revealLabel,
      icon: "folder",
      disabled: input.revealDisabled,
    },
    {
      id: "remove",
      label: "Remove project",
      icon: "trash",
      destructive: true,
      separatorBefore: true,
    },
  ];
}
