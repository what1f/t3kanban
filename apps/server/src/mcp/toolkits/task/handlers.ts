import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { TaskWorkbench } from "../../../taskWorkbench.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { TaskToolError, TaskToolkit, UpdateCurrentTaskInput } from "./tools.ts";

const taskInvocation = Effect.gen(function* () {
  const invocation = yield* McpInvocationContext.McpInvocationContext;
  if (!invocation.capabilities.has("task")) {
    return yield* new TaskToolError({ message: "This MCP session does not have task access." });
  }
  return invocation;
});

const handlers = {
  get_current_task: Effect.fn("TaskToolkit.get_current_task")(function* () {
    const invocation = yield* taskInvocation;
    const workbench = yield* TaskWorkbench;
    return yield* workbench
      .readCurrentTask(invocation.threadId)
      .pipe(Effect.mapError((error) => new TaskToolError({ message: error.message })));
  }),
  update_task: Effect.fn("TaskToolkit.update_task")(function* (
    input: Schema.Schema.Type<typeof UpdateCurrentTaskInput>,
  ) {
    const invocation = yield* taskInvocation;
    const workbench = yield* TaskWorkbench;
    return yield* workbench
      .updateCurrentTask(invocation.threadId, input)
      .pipe(Effect.mapError((error) => new TaskToolError({ message: error.message })));
  }),
} satisfies Parameters<typeof TaskToolkit.toLayer>[0];

export const TaskToolkitHandlersLive = TaskToolkit.toLayer(handlers);
