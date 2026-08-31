import { useNavigate } from "@tanstack/react-router";
import { InboxIcon, MailIcon, MailOpenIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { isElectron } from "../../env";
import { cn } from "../../lib/utils";
import { useProjects, useThreadShells } from "../../state/entities";
import { taskWorkbench, useTaskWorkbenches } from "../../state/taskWorkbench";
import { useAtomCommand } from "../../state/use-atom-command";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { latestNotificationPerTask } from "./taskInboxModel";

const REASONS = {
  completed: "Round finished",
  failed: "Execution failed",
  interrupted: "Execution interrupted",
  approval: "Waiting for approval",
  question: "Waiting for reply",
};
export function TaskInboxPage() {
  const { snapshots, errors } = useTaskWorkbenches();
  const threads = useThreadShells();
  const projects = useProjects();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const mutate = useAtomCommand(taskWorkbench.mutate);
  const navigate = useNavigate();
  const notifications = latestNotificationPerTask(
    [...snapshots].flatMap(([environmentId, value]) =>
      value.notifications.map((notification) => ({ ...notification, environmentId })),
    ),
  ).filter((notification) => !unreadOnly || !notification.readAt);
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <WorkspacePageHeader electron={isElectron} className="border-b border-border/60">
        <InboxIcon className="size-4 text-muted-foreground" />
        <h1 className="text-sm font-medium">Inbox</h1>
      </WorkspacePageHeader>
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border/60 px-5">
        {[false, true].map((unread) => (
          <button
            key={String(unread)}
            onClick={() => setUnreadOnly(unread)}
            className={cn(
              "rounded-md px-3 py-1 text-xs text-muted-foreground",
              unreadOnly === unread && "bg-muted text-foreground",
            )}
          >
            {unread ? "Unread" : "All notifications"}
          </button>
        ))}
      </div>
      {errors.length > 0 && (
        <p role="alert" className="px-5 py-3 text-sm text-destructive">
          {errors[0]}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {notifications.map((n) => {
          const thread = threads.find(
            (t) => t.id === n.threadId && t.environmentId === n.environmentId,
          );
          const project = projects.find(
            (p) => p.id === thread?.projectId && p.environmentId === n.environmentId,
          );
          return (
            <article
              key={`${n.environmentId}:${n.id}`}
              className={cn(
                "group flex items-center gap-3 border-b border-border/50 px-5 py-4 hover:bg-muted/20",
                !n.readAt && "bg-muted/10",
              )}
            >
              <span className={cn("size-1.5 shrink-0 rounded-full", !n.readAt && "bg-primary")} />
              <button
                className="min-w-0 flex-1 text-left"
                onClick={async () => {
                  await mutate({
                    environmentId: n.environmentId,
                    input: { type: "notification.read", id: n.id, read: true },
                  });
                  void navigate({
                    to: "/$environmentId/$threadId",
                    params: { environmentId: n.environmentId, threadId: n.threadId },
                  });
                }}
              >
                <div className="flex items-center gap-3">
                  <span className={cn("truncate text-sm", !n.readAt && "font-medium")}>
                    {thread?.title ?? "Task record"}
                  </span>
                  <span className="shrink-0 rounded-md border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {REASONS[n.kind]}
                  </span>
                </div>
                <p className="mt-1.5 truncate text-xs text-muted-foreground">{n.summary}</p>
                <p className="mt-2 text-[11px] text-muted-foreground/60">
                  {project?.title ?? "Project"} ·{" "}
                  {new Date(n.createdAt).toLocaleString("en-US", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </button>
              <button
                aria-label={n.readAt ? "Mark unread" : "Mark read"}
                className="rounded-md p-2 text-muted-foreground hover:bg-muted"
                onClick={() =>
                  void mutate({
                    environmentId: n.environmentId,
                    input: { type: "notification.read", id: n.id, read: !n.readAt },
                  })
                }
              >
                {n.readAt ? <MailIcon className="size-4" /> : <MailOpenIcon className="size-4" />}
              </button>
              <button
                aria-label="Delete notification"
                className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
                onClick={() =>
                  void mutate({
                    environmentId: n.environmentId,
                    input: { type: "notification.delete", id: n.id },
                  })
                }
              >
                <Trash2Icon className="size-4" />
              </button>
            </article>
          );
        })}
        {notifications.length === 0 && (
          <div className="flex h-72 flex-col items-center justify-center gap-3 text-muted-foreground">
            <InboxIcon className="size-8 stroke-1" />
            <p className="text-sm">
              {unreadOnly ? "No unread notifications" : "No notifications yet"}
            </p>
            <p className="text-xs text-muted-foreground/65">
              Results appear here after each Agent turn finishes.
            </p>
          </div>
        )}
      </div>
    </SidebarInset>
  );
}
