import { EnvironmentId, TaskNotification, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { latestNotificationPerTask } from "./taskInboxModel";

const notification = (environmentId: string, threadId: string, id: string, createdAt: string) => ({
  ...TaskNotification.make({
    id,
    threadId: ThreadId.make(threadId),
    kind: "completed",
    summary: id,
    createdAt,
    readAt: null,
  }),
  environmentId: EnvironmentId.make(environmentId),
});

describe("latestNotificationPerTask", () => {
  it("keeps only the newest notification for each environment task", () => {
    const result = latestNotificationPerTask([
      notification("local", "task-a", "a-old", "2026-08-29T10:00:00.000Z"),
      notification("local", "task-b", "b-latest", "2026-08-29T12:00:00.000Z"),
      notification("local", "task-a", "a-latest", "2026-08-29T11:00:00.000Z"),
      notification("remote", "task-a", "remote-a", "2026-08-29T09:00:00.000Z"),
    ]);

    expect(result.map(({ environmentId, id }) => `${environmentId}:${id}`)).toEqual([
      "local:b-latest",
      "local:a-latest",
      "remote:remote-a",
    ]);
  });
});
