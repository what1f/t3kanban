import { describe, expect, it } from "vite-plus/test";

import { buildProjectSidebarMenuItems, orderProjectsWithPinnedFirst } from "./taskSidebar.logic";

describe("orderProjectsWithPinnedFirst", () => {
  it("keeps pinned projects first while preserving the remaining project order", () => {
    const projects = [{ key: "project-a" }, { key: "project-b" }, { key: "project-c" }];

    expect(
      orderProjectsWithPinnedFirst(
        projects,
        ["project-b", "missing", "project-b"],
        (project) => project.key,
      ),
    ).toEqual([{ key: "project-b" }, { key: "project-a" }, { key: "project-c" }]);
  });
});

describe("buildProjectSidebarMenuItems", () => {
  it("builds the pin, reveal, and destructive remove actions", () => {
    expect(
      buildProjectSidebarMenuItems({
        isPinned: false,
        revealLabel: "Reveal in Finder",
        revealDisabled: false,
      }),
    ).toEqual([
      { id: "pin", label: "Pin", icon: "pin" },
      { id: "reveal", label: "Reveal in Finder", icon: "folder", disabled: false },
      {
        id: "remove",
        label: "Remove project",
        icon: "trash",
        destructive: true,
        separatorBefore: true,
      },
    ]);
    expect(
      buildProjectSidebarMenuItems({
        isPinned: true,
        revealLabel: "Reveal in Finder",
        revealDisabled: true,
      })[0],
    ).toEqual({ id: "pin", label: "Unpin", icon: "pin-off" });
  });
});
