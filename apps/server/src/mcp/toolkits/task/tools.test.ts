import { describe, expect, it } from "@effect/vitest";
import { Tool } from "effect/unstable/ai";

import { GetCurrentTaskTool } from "./tools.ts";

describe("task MCP tools", () => {
  it("publishes an object input schema for get_current_task", () => {
    expect(Tool.getJsonSchema(GetCurrentTaskTool)).toEqual({
      type: "object",
      additionalProperties: false,
    });
  });
});
