import { ChatImageAttachment, TaskStatus } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { TaskWorkbench } from "../../../taskWorkbench.ts";

export class TaskToolError extends Schema.TaggedErrorClass<TaskToolError>()("TaskToolError", {
  message: Schema.String,
}) {}

export const CurrentTask = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  content: Schema.String,
  attachments: Schema.Array(ChatImageAttachment),
  status: TaskStatus,
  availableStatuses: Schema.Array(TaskStatus),
});

const dependencies = [McpInvocationContext.McpInvocationContext, TaskWorkbench];
const EmptyTaskToolInput = Schema.Record(Schema.String, Schema.Never);

export const GetCurrentTaskTool = Tool.make("get_current_task", {
  description:
    "Read the task bound to this agent session, including its latest title, content, image attachments, current status, and available board statuses. Call this after a task-change reminder or whenever the current task may have changed outside the conversation.",
  parameters: EmptyTaskToolInput,
  success: CurrentTask,
  failure: TaskToolError,
  dependencies,
})
  .annotate(Tool.Title, "Get current task")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const UpdateCurrentTaskInput = Schema.Struct({
  title: Schema.optional(Schema.String),
  content: Schema.optional(Schema.String),
  content_file: Schema.optional(Schema.String),
  status: Schema.optional(Schema.String),
});

export const UpdateCurrentTaskTool = Tool.make("update_task", {
  description:
    "Update the task bound to this agent session. Supply one or more of title, status, or content. For long Markdown, use content_file with a file inside the task workspace instead of content; content and content_file are mutually exclusive.",
  parameters: UpdateCurrentTaskInput,
  success: CurrentTask,
  failure: TaskToolError,
  dependencies,
})
  .annotate(Tool.Title, "Update current task")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const TaskToolkit = Toolkit.make(GetCurrentTaskTool, UpdateCurrentTaskTool);
