import {
  BUILT_IN_TASK_STATUSES,
  CommandId,
  TaskNotification,
  TaskWorkbenchError,
  type ChatImageAttachment,
  type TaskStatus,
  type ThreadId,
  type TaskWorkbenchMutation,
  type TaskWorkbenchSnapshot,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Queue from "effect/Queue";
import * as Crypto from "effect/Crypto";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { resolveThreadWorkspaceCwd } from "./checkpointing/Utils.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";

export interface CurrentTask {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly attachments: ReadonlyArray<ChatImageAttachment>;
  readonly status: TaskStatus;
  readonly availableStatuses: ReadonlyArray<TaskStatus>;
}

export interface UpdateCurrentTaskInput {
  readonly title?: string | undefined;
  readonly content?: string | undefined;
  readonly content_file?: string | undefined;
  readonly status?: string | undefined;
}

export class TaskWorkbench extends Context.Service<
  TaskWorkbench,
  {
    readonly snapshot: Effect.Effect<TaskWorkbenchSnapshot, TaskWorkbenchError>;
    readonly mutate: (input: TaskWorkbenchMutation) => Effect.Effect<void, TaskWorkbenchError>;
    readonly stream: Stream.Stream<TaskWorkbenchSnapshot, TaskWorkbenchError>;
    readonly readCurrentTask: (
      threadId: ThreadId,
    ) => Effect.Effect<CurrentTask, TaskWorkbenchError>;
    readonly updateCurrentTask: (
      threadId: ThreadId,
      input: UpdateCurrentTaskInput,
    ) => Effect.Effect<CurrentTask, TaskWorkbenchError>;
  }
>()("t3/taskWorkbench") {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const crypto = yield* Crypto.Crypto;
  const engine = yield* OrchestrationEngineService;
  const projections = yield* ProjectionSnapshotQuery;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const changes = yield* PubSub.unbounded<void>();
  const lock = yield* Semaphore.make(1);
  const wrapError = (cause: unknown) =>
    Schema.is(TaskWorkbenchError)(cause)
      ? cause
      : new TaskWorkbenchError({ message: "Task data operation failed. Try again." });
  const snapshot = Effect.gen(function* () {
    const rows =
      yield* sql`SELECT id, thread_id AS "threadId", kind, summary, created_at AS "createdAt", read_at AS "readAt"
        FROM task_inbox
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 200`;
    const unreadRows = yield* sql<{ unreadCount: number }>`SELECT COUNT(*) AS "unreadCount"
      FROM task_inbox
      WHERE deleted_at IS NULL AND read_at IS NULL`;
    return {
      notifications: yield* Schema.decodeUnknownEffect(Schema.Array(TaskNotification))(rows),
      unreadCount: unreadRows[0]?.unreadCount ?? 0,
    };
  }).pipe(Effect.mapError(wrapError));

  const readCurrentTask = Effect.fn("TaskWorkbench.readCurrentTask")(function* (
    threadId: ThreadId,
  ) {
    const model = yield* projections.getCommandReadModel();
    const thread = model.threads.find((candidate) => candidate.id === threadId);
    if (!thread?.task) {
      return yield* new TaskWorkbenchError({
        message: "The current session is not bound to a task.",
      });
    }
    const availableStatuses = BUILT_IN_TASK_STATUSES;
    const status = availableStatuses.find((candidate) => candidate.id === thread.task?.statusId);
    if (!status) {
      return yield* new TaskWorkbenchError({
        message: "The task's current status no longer exists.",
      });
    }
    return {
      id: thread.id,
      title: thread.title,
      content: thread.task.content,
      attachments: thread.task.attachments,
      status,
      availableStatuses,
    } satisfies CurrentTask;
  }, Effect.mapError(wrapError));

  const readContentFile = Effect.fn("TaskWorkbench.readContentFile")(function* (
    threadId: ThreadId,
    requestedPath: string,
  ) {
    const model = yield* projections.getCommandReadModel();
    const thread = model.threads.find((candidate) => candidate.id === threadId);
    if (!thread)
      return yield* new TaskWorkbenchError({ message: "The current task does not exist." });
    const cwd = resolveThreadWorkspaceCwd({ thread, projects: model.projects });
    if (!cwd)
      return yield* new TaskWorkbenchError({
        message: "The current task has no workspace directory.",
      });
    const [canonicalRoot, canonicalFile] = yield* Effect.all([
      fileSystem.realPath(cwd),
      fileSystem.realPath(path.resolve(cwd, requestedPath)),
    ]).pipe(
      Effect.mapError(() => new TaskWorkbenchError({ message: "Could not read content_file." })),
    );
    const relative = path.relative(canonicalRoot, canonicalFile);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return yield* new TaskWorkbenchError({
        message: "content_file must be inside the task workspace.",
      });
    }
    const info = yield* fileSystem
      .stat(canonicalFile)
      .pipe(
        Effect.mapError(() => new TaskWorkbenchError({ message: "Could not read content_file." })),
      );
    if (info.type !== "File") {
      return yield* new TaskWorkbenchError({ message: "content_file must be a regular file." });
    }
    if (Number(info.size) > 2 * 1024 * 1024) {
      return yield* new TaskWorkbenchError({ message: "content_file cannot exceed 2 MiB." });
    }
    return yield* fileSystem
      .readFileString(canonicalFile)
      .pipe(
        Effect.mapError(
          () => new TaskWorkbenchError({ message: "content_file is not readable text." }),
        ),
      );
  });

  const updateCurrentTask = Effect.fn("TaskWorkbench.updateCurrentTask")(function* (
    threadId: ThreadId,
    input: UpdateCurrentTaskInput,
  ) {
    if (input.content !== undefined && input.content_file !== undefined) {
      return yield* new TaskWorkbenchError({
        message: "content and content_file cannot be provided together.",
      });
    }
    if (
      input.title === undefined &&
      input.content === undefined &&
      input.content_file === undefined &&
      input.status === undefined
    ) {
      return yield* new TaskWorkbenchError({ message: "Provide at least one field to update." });
    }
    const model = yield* projections.getCommandReadModel();
    const thread = model.threads.find((candidate) => candidate.id === threadId);
    if (!thread?.task) {
      return yield* new TaskWorkbenchError({
        message: "The current session is not bound to a task.",
      });
    }
    const availableStatuses = BUILT_IN_TASK_STATUSES;
    const nextStatus = input.status
      ? availableStatuses.find((candidate) => candidate.id === input.status)
      : availableStatuses.find((candidate) => candidate.id === thread.task?.statusId);
    if (!nextStatus) {
      return yield* new TaskWorkbenchError({
        message: `Invalid status. Available statuses: ${availableStatuses.map((status) => status.id).join(", ")}`,
      });
    }
    const title = input.title?.trim();
    if (input.title !== undefined && !title) {
      return yield* new TaskWorkbenchError({ message: "Task title cannot be empty." });
    }
    const content =
      input.content_file !== undefined
        ? yield* readContentFile(threadId, input.content_file)
        : (input.content ?? thread.task.content);
    const task = {
      ...thread.task,
      content,
      statusId: nextStatus.id,
    };
    yield* engine.dispatch({
      type: "thread.meta.update",
      commandId: CommandId.make(yield* crypto.randomUUIDv4),
      threadId,
      ...(title ? { title } : {}),
      task,
    });
    return {
      id: thread.id,
      title: title ?? thread.title,
      content: task.content,
      attachments: task.attachments,
      status: nextStatus,
      availableStatuses,
    } satisfies CurrentTask;
  }, Effect.mapError(wrapError));
  const mutate = Effect.fn("TaskWorkbench.mutate")(
    function* (input: TaskWorkbenchMutation) {
      const now = DateTime.formatIso(yield* DateTime.now);
      switch (input.type) {
        case "notification.read": {
          if (input.read) {
            yield* sql`UPDATE task_inbox SET read_at = ${now} WHERE id = ${input.id} AND deleted_at IS NULL`;
            break;
          }
          yield* sql.withTransaction(
            Effect.gen(function* () {
              yield* sql`UPDATE task_inbox
                SET read_at = ${now}
                WHERE thread_id = (SELECT thread_id FROM task_inbox WHERE id = ${input.id})
                  AND id <> ${input.id}
                  AND read_at IS NULL
                  AND deleted_at IS NULL`;
              yield* sql`UPDATE task_inbox SET read_at = NULL WHERE id = ${input.id} AND deleted_at IS NULL`;
            }),
          );
          break;
        }
        case "notification.read-thread":
          yield* sql`UPDATE task_inbox
            SET read_at = ${now}
            WHERE thread_id = ${input.threadId}
              AND read_at IS NULL
              AND deleted_at IS NULL`;
          break;
        case "notification.delete":
          yield* sql`UPDATE task_inbox SET deleted_at = ${now} WHERE id = ${input.id}`;
          break;
      }
      yield* PubSub.publish(changes, undefined);
    },
    lock.withPermits(1),
    Effect.mapError(wrapError),
  );

  const stream = Stream.unwrap(
    Effect.gen(function* () {
      // Subscribe before reading the snapshot; updates during the read stay buffered.
      const buffer = yield* Queue.unbounded<void>();
      yield* Effect.forkScoped(
        Stream.merge(
          Stream.fromPubSub(changes),
          engine.streamDomainEvents.pipe(
            Stream.filter((event) => {
              if (event.type === "thread.session-set") {
                return !["starting", "running"].includes(event.payload.session.status);
              }
              if (event.type === "thread.activity-appended") {
                return (
                  event.payload.activity.kind === "approval.requested" ||
                  event.payload.activity.kind === "user-input.requested"
                );
              }
              return (
                event.type === "thread.message-sent" &&
                event.payload.role === "assistant" &&
                !event.payload.streaming
              );
            }),
            Stream.map(() => undefined),
          ),
        ).pipe(Stream.runForEach(() => Queue.offer(buffer, undefined))),
        { startImmediately: true },
      );
      const initial = yield* snapshot;
      return Stream.concat(
        Stream.succeed(initial),
        Stream.fromQueue(buffer).pipe(Stream.mapEffect(() => snapshot)),
      );
    }),
  );
  return { snapshot, mutate, stream, readCurrentTask, updateCurrentTask };
});

export const layer = Layer.effect(TaskWorkbench, make);
