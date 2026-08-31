import {
  BUILT_IN_TASK_STATUSES,
  type ChatImageAttachment,
  type EnvironmentId,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { useRouter } from "@tanstack/react-router";
import { ArrowLeftIcon, CheckIcon, EyeIcon, SquarePenIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useAssetUrl } from "../../assets/assetUrls";
import { useProject, useThread, useServerConfigs } from "../../state/entities";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import ChatMarkdown from "../ChatMarkdown";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { TaskStatusIcon } from "./TaskStatusIcon";

function TaskImage({
  environmentId,
  attachment,
}: {
  environmentId: EnvironmentId;
  attachment: ChatImageAttachment;
}) {
  const url = useAssetUrl(environmentId, { _tag: "attachment", attachmentId: attachment.id });
  return url ? (
    <a href={url} target="_blank" rel="noreferrer">
      <img
        src={url}
        alt={attachment.name}
        className="max-h-56 w-full rounded-lg border border-border object-contain"
      />
    </a>
  ) : (
    <p className="text-xs text-muted-foreground">{attachment.name}</p>
  );
}
export function TaskDetailsPanel({ threadRef }: { threadRef: ScopedThreadRef }) {
  const thread = useThread(threadRef);
  const project = useProject(
    thread ? scopeProjectRef(thread.environmentId, thread.projectId) : null,
  );
  const configs = useServerConfigs();
  const statuses = BUILT_IN_TASK_STATUSES;
  const update = useAtomCommand(threadEnvironment.updateMetadata);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingContent, setEditingContent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const originalContent = thread?.task?.content ?? "";
  useEffect(() => {
    setTitle(thread?.title ?? "");
    setContent(originalContent);
    setEditingTitle(false);
    setEditingContent(false);
  }, [thread?.id, thread?.title, originalContent]);
  if (!thread?.task) return null;
  const task = thread.task;
  const save = async (changes: { statusId?: string; title?: string; content?: string } = {}) => {
    const nextTitle = changes.title ?? title;
    const nextContent = changes.content ?? content;
    setBusy(true);
    setError(null);
    const result = await update({
      environmentId: thread.environmentId,
      input: {
        threadId: thread.id,
        title: nextTitle.trim() || nextContent.trim().slice(0, 80) || "Untitled task",
        task: { ...task, content: nextContent, statusId: changes.statusId ?? task.statusId },
      },
    });
    setBusy(false);
    if (result._tag === "Failure") {
      setError("Could not save changes. Try again.");
      return false;
    }
    return true;
  };
  const finishTitleEditing = async () => {
    if (title === thread.title) {
      setEditingTitle(false);
      return;
    }
    if (await save({ content: originalContent })) setEditingTitle(false);
  };
  const assignedAgent =
    configs
      .get(thread.environmentId)
      ?.providers.find((provider) => provider.instanceId === thread.modelSelection.instanceId)
      ?.displayName ?? thread.modelSelection.instanceId;
  const activeStatus = statuses.find((status) => status.id === task.statusId) ?? statuses[0]!;
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background" aria-label="Task details">
      <div className="shrink-0 space-y-3 p-5 pb-4">
        <button
          className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={() =>
            window.history.length > 1
              ? window.history.back()
              : void router.navigate({ to: "/", search: {} })
          }
        >
          <ArrowLeftIcon className="size-3.5" />
          Back to workbench
        </button>
        {editingTitle ? (
          <input
            autoFocus
            aria-label="Edit task title"
            disabled={busy}
            className="-mx-1 w-[calc(100%+0.5rem)] rounded-md border border-border bg-muted/20 px-1 py-1 text-base font-medium outline-none focus:ring-2 focus:ring-ring/60"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void finishTitleEditing()}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setTitle(thread.title);
                setEditingTitle(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="-mx-1 block w-[calc(100%+0.5rem)] cursor-text rounded-md px-1 py-1 text-left text-base font-medium hover:bg-muted/40"
            onClick={() => setEditingTitle(true)}
          >
            {thread.title}
          </button>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Menu>
            <MenuTrigger
              aria-label={`Status: ${activeStatus.name}`}
              disabled={busy}
              className="grid size-6 cursor-pointer place-items-center rounded-md border border-transparent outline-none hover:border-border hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <TaskStatusIcon status={activeStatus} />
            </MenuTrigger>
            <MenuPopup align="start" className="w-44">
              {statuses.map((status) => (
                <MenuItem
                  key={status.id}
                  onClick={() =>
                    void save({
                      statusId: status.id,
                      title: thread.title,
                      content: originalContent,
                    })
                  }
                >
                  <TaskStatusIcon status={status} />
                  <span className="flex-1">{status.name}</span>
                  {status.id === task.statusId && <CheckIcon className="size-3.5" />}
                </MenuItem>
              ))}
            </MenuPopup>
          </Menu>
          <span aria-hidden className="h-3 w-px bg-border" />
          <span className="truncate">{project?.title}</span>
          <span aria-hidden className="h-3 w-px bg-border" />
          <span className="truncate">{task.assigned === false ? "Unassigned" : assignedAgent}</span>
          <span aria-hidden className="h-3 w-px bg-border" />
          <span className="truncate">{thread.modelSelection.model}</span>
        </div>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      <section
        className="relative flex min-h-0 flex-1 flex-col border-t border-border/60"
        aria-label="Task content"
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                className="absolute top-3 right-3 z-10 bg-background/85 text-muted-foreground backdrop-blur-sm hover:text-foreground"
                size="icon-xs"
                variant="ghost-muted"
                disabled={busy}
                aria-label={editingContent ? "Preview and save task content" : "Edit task content"}
                onClick={() => {
                  if (!editingContent) {
                    setEditingContent(true);
                    return;
                  }
                  void save().then((saved) => saved && setEditingContent(false));
                }}
              />
            }
          >
            {editingContent ? <EyeIcon /> : <SquarePenIcon />}
          </TooltipTrigger>
          <TooltipPopup>{editingContent ? "Preview and save" : "Edit content"}</TooltipPopup>
        </Tooltip>
        {editingContent ? (
          <textarea
            autoFocus
            aria-label="Edit task content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setContent(originalContent);
                setEditingContent(false);
                setError(null);
              }
            }}
            className="min-h-0 flex-1 resize-none border-0 bg-transparent px-5 py-5 pr-12 font-mono text-sm leading-6 outline-none focus-visible:ring-0"
            placeholder="Add task content…"
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 pr-12">
            {content.trim() ? (
              <ChatMarkdown
                text={content}
                cwd={project?.workspaceRoot}
                threadRef={threadRef}
                className="text-foreground/90"
              />
            ) : (
              <button
                className="h-full w-full cursor-text text-left text-sm text-muted-foreground"
                onClick={() => setEditingContent(true)}
              >
                Add task content…
              </button>
            )}
            <div className="mt-5 space-y-3">
              {task.attachments.map((attachment) => (
                <TaskImage
                  key={attachment.id}
                  environmentId={thread.environmentId}
                  attachment={attachment}
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
