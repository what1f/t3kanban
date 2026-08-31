interface CreateTaskSubmitShortcutEvent {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly isComposing?: boolean;
  readonly defaultPrevented?: boolean;
}

export function isCreateTaskSubmitShortcut(event: CreateTaskSubmitShortcutEvent): boolean {
  return (
    event.key === "Enter" &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    !event.isComposing &&
    !event.defaultPrevented
  );
}

export function resolveTaskBoardSearch(projectKey?: string): { project?: string } {
  return projectKey ? { project: projectKey } : {};
}
