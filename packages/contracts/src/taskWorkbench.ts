import * as Schema from "effect/Schema";
import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ThreadId } from "./baseSchemas.ts";

export const TaskStatus = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(60)),
  position: Schema.Int,
  completed: Schema.Boolean,
});
export type TaskStatus = typeof TaskStatus.Type;

export const BUILT_IN_TASK_STATUSES: ReadonlyArray<TaskStatus> = Schema.decodeUnknownSync(
  Schema.Array(TaskStatus),
)([
  { id: "todo", name: "Todo", position: 0, completed: false },
  { id: "in-progress", name: "In Progress", position: 1, completed: false },
  { id: "in-review", name: "In Review", position: 2, completed: false },
  { id: "blocked", name: "Blocked", position: 3, completed: false },
  { id: "done", name: "Done", position: 4, completed: true },
]);

export const TaskNotificationKind = Schema.Literals([
  "completed",
  "failed",
  "interrupted",
  "approval",
  "question",
]);
export const TaskNotification = Schema.Struct({
  id: TrimmedNonEmptyString,
  threadId: ThreadId,
  kind: TaskNotificationKind,
  summary: Schema.String,
  createdAt: IsoDateTime,
  readAt: Schema.NullOr(IsoDateTime),
});
export type TaskNotification = typeof TaskNotification.Type;

export const TaskWorkbenchSnapshot = Schema.Struct({
  notifications: Schema.Array(TaskNotification),
  unreadCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type TaskWorkbenchSnapshot = typeof TaskWorkbenchSnapshot.Type;

export const TaskWorkbenchMutation = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("notification.read"),
    id: TrimmedNonEmptyString,
    read: Schema.Boolean,
  }),
  Schema.Struct({
    type: Schema.Literal("notification.read-thread"),
    threadId: ThreadId,
  }),
  Schema.Struct({ type: Schema.Literal("notification.delete"), id: TrimmedNonEmptyString }),
]);
export type TaskWorkbenchMutation = typeof TaskWorkbenchMutation.Type;

export class TaskWorkbenchError extends Schema.TaggedErrorClass<TaskWorkbenchError>()(
  "TaskWorkbenchError",
  { message: Schema.String },
) {}
