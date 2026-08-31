import { describe, expect, it } from "vite-plus/test";

import { isCreateTaskSubmitShortcut, resolveTaskBoardSearch } from "./createTaskDialog.logic";

const shortcutEvent = (
  overrides: Partial<Parameters<typeof isCreateTaskSubmitShortcut>[0]> = {},
) => ({
  key: "Enter",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  isComposing: false,
  defaultPrevented: false,
  ...overrides,
});

describe("isCreateTaskSubmitShortcut", () => {
  it("accepts Command+Enter and Ctrl+Enter", () => {
    expect(isCreateTaskSubmitShortcut(shortcutEvent({ metaKey: true }))).toBe(true);
    expect(isCreateTaskSubmitShortcut(shortcutEvent({ ctrlKey: true }))).toBe(true);
  });

  it("rejects unrelated or already-handled combinations", () => {
    expect(isCreateTaskSubmitShortcut(shortcutEvent())).toBe(false);
    expect(isCreateTaskSubmitShortcut(shortcutEvent({ key: "a", metaKey: true }))).toBe(false);
    expect(isCreateTaskSubmitShortcut(shortcutEvent({ metaKey: true, shiftKey: true }))).toBe(
      false,
    );
    expect(isCreateTaskSubmitShortcut(shortcutEvent({ ctrlKey: true, altKey: true }))).toBe(false);
    expect(isCreateTaskSubmitShortcut(shortcutEvent({ metaKey: true, isComposing: true }))).toBe(
      false,
    );
    expect(
      isCreateTaskSubmitShortcut(shortcutEvent({ ctrlKey: true, defaultPrevented: true })),
    ).toBe(false);
  });
});

describe("resolveTaskBoardSearch", () => {
  it("returns the global board when no project is the origin", () => {
    expect(resolveTaskBoardSearch()).toEqual({});
  });

  it("preserves the originating project board", () => {
    expect(resolveTaskBoardSearch("local:project-2")).toEqual({ project: "local:project-2" });
  });
});
