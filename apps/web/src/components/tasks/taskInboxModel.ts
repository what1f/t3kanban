import type { EnvironmentId, TaskNotification } from "@t3tools/contracts";

export type EnvironmentTaskNotification = TaskNotification & {
  readonly environmentId: EnvironmentId;
};

export function latestNotificationPerTask(
  notifications: ReadonlyArray<EnvironmentTaskNotification>,
) {
  const latestByTask = new Map<string, EnvironmentTaskNotification>();
  for (const notification of notifications) {
    const key = `${notification.environmentId}:${notification.threadId}`;
    const current = latestByTask.get(key);
    if (
      !current ||
      notification.createdAt > current.createdAt ||
      (notification.createdAt === current.createdAt && notification.id > current.id)
    ) {
      latestByTask.set(key, notification);
    }
  }
  return [...latestByTask.values()].toSorted((a, b) =>
    b.createdAt === a.createdAt ? b.id.localeCompare(a.id) : b.createdAt.localeCompare(a.createdAt),
  );
}
