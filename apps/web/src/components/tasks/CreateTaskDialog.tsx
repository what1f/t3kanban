import { scopedProjectKey, scopeProjectRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  BUILT_IN_TASK_STATUSES,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  isProviderSendTurnSupportedImageMimeType,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  type ChatImageAttachment,
  type EnvironmentId,
  type ModelSelection,
  type ProviderOptionSelection,
} from "@t3tools/contracts";
import { getProviderOptionCurrentValue, getProviderOptionDescriptors } from "@t3tools/shared/model";
import { resolveDefaultThreadEnvMode } from "@t3tools/shared/threadEnvMode";
import { useNavigate } from "@tanstack/react-router";
import {
  BrainIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleDashedIcon,
  FolderIcon,
  PaperclipIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAssetUrl } from "../../assets/assetUrls";
import type { ComposerImageAttachment } from "../../composerDraftStore";
import { usePrimarySettings, useEnvironmentSettings } from "../../hooks/useSettings";
import {
  awaitAttachmentUploads,
  getUploadedAttachments,
  readAttachmentUpload,
  releaseAttachmentUpload,
  releaseAttachmentUploads,
  startOrRetryAttachmentUpload,
} from "../../lib/attachmentUploadQueue";
import { isHeicImageFile, prepareImageForAttachment } from "../../lib/imageCompression";
import { readT3ProjectFileDefaultThreadEnvMode } from "../../lib/t3ProjectFileDefaults";
import { cn, newMessageId, newThreadId, randomUUID } from "../../lib/utils";
import {
  getAppModelOptionsForInstance,
  resolveAppModelSelectionForInstance,
} from "../../modelSelection";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
} from "../../providerInstances";
import { useProjects, useServerConfigs } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { threadEnvironment } from "../../state/threads";
import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";
import { vcsEnvironment } from "../../state/vcs";
import { Button } from "../ui/button";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { TaskStatusIcon } from "./TaskStatusIcon";
import { isCreateTaskSubmitShortcut, resolveTaskBoardSearch } from "./createTaskDialog.logic";
import { taskHasStarted, type TaskThreadShell } from "./taskModel";

function withOption(
  options: ReadonlyArray<ProviderOptionSelection> | undefined,
  id: string,
  value: string,
): ReadonlyArray<ProviderOptionSelection> {
  return [...(options ?? []).filter((option) => option.id !== id), { id, value }];
}

function ExistingTaskImage({
  environmentId,
  attachment,
}: {
  environmentId: EnvironmentId;
  attachment: ChatImageAttachment;
}) {
  const url = useAssetUrl(environmentId, { _tag: "attachment", attachmentId: attachment.id });
  return url ? (
    <img
      src={url}
      alt={attachment.name}
      className="size-20 rounded-lg border border-border object-cover"
    />
  ) : (
    <div className="grid size-20 place-items-center rounded-lg border border-border px-2 text-center text-[10px] text-muted-foreground">
      <span className="line-clamp-3">{attachment.name}</span>
    </div>
  );
}

export function CreateTaskDialog({
  projectKey,
  statusId,
  returnProjectKey,
  editingTask,
  onClose,
}: {
  projectKey?: string;
  statusId?: string;
  returnProjectKey?: string;
  editingTask?: TaskThreadShell;
  onClose: () => void;
}) {
  const projects = useProjects();
  const configs = useServerConfigs();
  const fixedProjectKey = editingTask
    ? scopedProjectKey(scopeProjectRef(editingTask.environmentId, editingTask.projectId))
    : projectKey;
  const [selectedProjectKey, setSelectedProjectKey] = useState(
    fixedProjectKey ??
      (projects.length === 1
        ? scopedProjectKey(scopeProjectRef(projects[0]!.environmentId, projects[0]!.id))
        : ""),
  );
  const project =
    projects.find(
      (p) => scopedProjectKey(scopeProjectRef(p.environmentId, p.id)) === selectedProjectKey,
    ) ?? null;
  const settings = useEnvironmentSettings(project?.environmentId ?? projects[0]!.environmentId);
  const primarySettings = usePrimarySettings();
  const providers = project ? (configs.get(project.environmentId)?.providers ?? []) : [];
  const entries = useMemo(
    () =>
      applyProviderInstanceSettings(deriveProviderInstanceEntries(providers), settings).filter(
        (p) => p.enabled,
      ),
    [providers, settings],
  );
  const [instanceId, setInstanceId] = useState("");
  const entry = entries.find((p) => p.instanceId === instanceId) ?? null;
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<
    ReadonlyArray<ProviderOptionSelection> | undefined
  >();
  const lastSelection = project?.defaultModelSelection ?? null;
  const optionSelectionSource = editingTask?.modelSelection ?? lastSelection;
  const entrySignature = entries.map((candidate) => candidate.instanceId).join("\n");
  const rememberedSelectionSignature = JSON.stringify(lastSelection);
  const configured = entry ? settings.providerInstances?.[entry.instanceId]?.config : null;
  const instanceModels =
    configured &&
    typeof configured === "object" &&
    Array.isArray((configured as { customModels?: unknown }).customModels)
      ? (configured as { customModels: unknown[] }).customModels.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
  const legacyProvider = entry
    ? settings.providers[entry.driverKind as keyof typeof settings.providers]
    : null;
  const configuredModels = [
    ...new Set([...instanceModels, ...(legacyProvider?.customModels ?? [])]),
  ];
  const models = entry
    ? [
        ...getAppModelOptionsForInstance(settings, entry),
        ...configuredModels
          .filter(
            (slug) =>
              !getAppModelOptionsForInstance(settings, entry).some((model) => model.slug === slug),
          )
          .map((slug) => ({ slug, name: slug, isCustom: true })),
      ]
    : [];
  const model = entry
    ? resolveAppModelSelectionForInstance(
        entry.instanceId,
        settings,
        providers,
        selectedModel ||
          (lastSelection?.instanceId === entry.instanceId ? lastSelection.model : undefined),
      )
    : null;
  const activeModel = entry?.models.find((candidate) => candidate.slug === model) ?? null;
  const optionDescriptors = activeModel?.capabilities
    ? getProviderOptionDescriptors({ caps: activeModel.capabilities, selections: selectedOptions })
    : [];
  const reasoningDescriptor = optionDescriptors.find(
    (descriptor) =>
      descriptor.type === "select" &&
      ["reasoningEffort", "effort", "reasoning", "variant"].includes(descriptor.id),
  );
  const reasoningValue =
    reasoningDescriptor?.type === "select"
      ? getProviderOptionCurrentValue(reasoningDescriptor)
      : undefined;
  const statuses = BUILT_IN_TASK_STATUSES;
  const [selectedStatus, setSelectedStatus] = useState(
    editingTask?.task.statusId ?? statusId ?? "",
  );
  const status = statuses.find((s) => s.id === selectedStatus) ?? statuses[0];
  const [title, setTitle] = useState(editingTask?.title ?? "");
  const [content, setContent] = useState(editingTask?.task.content ?? "");
  const [existingAttachments, setExistingAttachments] = useState<
    ReadonlyArray<ChatImageAttachment>
  >(editingTask?.task.attachments ?? []);
  const [images, setImages] = useState<ComposerImageAttachment[]>([]);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const mountedRef = useRef(true);
  const imageInput = useRef<HTMLInputElement>(null);
  const [pendingImageCount, setPendingImageCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const createThread = useAtomCommand(threadEnvironment.create, { reportFailure: false });
  const updateThread = useAtomCommand(threadEnvironment.updateMetadata, { reportFailure: false });
  const updateProject = useAtomCommand(projectEnvironment.update, { reportFailure: false });
  const navigate = useNavigate();
  const vcs = useEnvironmentQuery(
    project
      ? vcsEnvironment.status({
          environmentId: project.environmentId,
          input: { cwd: project.workspaceRoot },
        })
      : null,
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const image of imagesRef.current) {
        releaseAttachmentUpload(image.id);
        URL.revokeObjectURL(image.previewUrl);
      }
    };
  }, []);
  useEffect(() => {
    if (!project) return;
    if (editingTask) {
      if (editingTask.task.assigned === false) {
        setInstanceId("");
        setSelectedModel("");
        setSelectedOptions(undefined);
        return;
      }
      setInstanceId(editingTask.modelSelection.instanceId);
      setSelectedModel(editingTask.modelSelection.model);
      setSelectedOptions(editingTask.modelSelection.options);
      return;
    }
    const remembered = project.defaultModelSelection;
    const nextEntry =
      entries.find((candidate) => candidate.instanceId === remembered?.instanceId) ?? entries[0];
    setInstanceId(nextEntry?.instanceId ?? "");
    setSelectedModel(
      remembered && remembered.instanceId === nextEntry?.instanceId ? remembered.model : "",
    );
    setSelectedOptions(
      remembered && remembered.instanceId === nextEntry?.instanceId
        ? remembered.options
        : undefined,
    );
  }, [editingTask, selectedProjectKey, project?.id, entrySignature, rememberedSelectionSignature]);
  const addImages = async (files: File[]) => {
    const acceptedFiles: File[] = [];
    let validationError: string | null = null;
    for (const file of files) {
      const isHeicImage = isHeicImageFile(file);
      if (!file.type.startsWith("image/") && !isHeicImage) {
        validationError = `Unsupported file type for '${file.name}'. Please attach image files only.`;
        continue;
      }
      if (!isHeicImage && !isProviderSendTurnSupportedImageMimeType(file.type)) {
        validationError = `'${file.name}' is not a supported image type. Attach GIF, HEIC, HEIF, JPEG, PNG, or WebP images.`;
        continue;
      }
      acceptedFiles.push(file);
    }
    if (validationError) setError(validationError);
    if (acceptedFiles.length === 0) return;

    setPendingImageCount((count) => count + acceptedFiles.length);
    try {
      const prepared = await Promise.all(
        acceptedFiles.map(async (file) => {
          try {
            return {
              file,
              result: await prepareImageForAttachment(file, PROVIDER_SEND_TURN_MAX_IMAGE_BYTES),
            };
          } catch {
            return { file, result: { ok: false as const, reason: "unreadable" as const } };
          }
        }),
      );
      if (!mountedRef.current) return;

      const added: ComposerImageAttachment[] = [];
      let preparationError: string | null = null;
      for (const item of prepared) {
        if (!item.result.ok) {
          preparationError =
            item.result.reason === "unreadable"
              ? `'${item.file.name}' could not be read as an image.`
              : `'${item.file.name}' is too large to attach, even after compression.`;
          continue;
        }
        const file = item.result.file;
        added.push({
          type: "image",
          id: randomUUID(),
          name: file.name || "image",
          mimeType: file.type,
          sizeBytes: file.size,
          file,
          previewUrl: URL.createObjectURL(file),
        });
      }
      if (added.length > 0) setImages((old) => [...old, ...added]);
      if (preparationError) setError(preparationError);
    } finally {
      if (mountedRef.current) {
        setPendingImageCount((count) => Math.max(0, count - acceptedFiles.length));
      }
    }
  };
  const submit = async () => {
    if (
      busy ||
      pendingImageCount > 0 ||
      !project ||
      !status ||
      (entry !== null && model === null) ||
      (!content.trim() && !title.trim() && images.length === 0 && existingAttachments.length === 0)
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const mode =
        editingTask?.task.workspaceMode ??
        resolveDefaultThreadEnvMode({
          projectSetting: project.defaultThreadEnvMode,
          projectFile:
            project.defaultThreadEnvMode == null
              ? await readT3ProjectFileDefaultThreadEnvMode(
                  project.environmentId,
                  project.workspaceRoot,
                )
              : null,
          globalDefault: primarySettings.defaultThreadEnvMode,
        });
      const selectedModelSelection: ModelSelection | null =
        entry && model
          ? {
              instanceId: entry.instanceId,
              model,
              ...(selectedOptions?.length ? { options: selectedOptions } : {}),
            }
          : editingTask?.task.assigned !== false
            ? (editingTask?.modelSelection ?? null)
            : null;
      const startsTurn =
        selectedModelSelection !== null && (!editingTask || !taskHasStarted(editingTask));
      const baseBranch = editingTask?.branch ?? vcs.data?.refName ?? null;
      if (mode === "worktree" && !baseBranch && (!editingTask || startsTurn)) {
        throw new Error(
          "This project has no usable Git branch. Choose local-directory mode in project settings or initialize a repository first.",
        );
      }

      let attachments: ReadonlyArray<ChatImageAttachment> = existingAttachments;
      if (images.length > 0) {
        const imageIds = images.map((image) => image.id);
        for (const image of images) {
          startOrRetryAttachmentUpload({ environmentId: project.environmentId, image });
        }
        await awaitAttachmentUploads(imageIds);
        let uploaded = getUploadedAttachments({ environmentId: project.environmentId, images });
        if (!uploaded) {
          const failedImages = images.filter((image) => {
            const upload = readAttachmentUpload(image.id);
            return upload?.status === "failed" && upload.environmentId === project.environmentId;
          });
          for (const image of failedImages) {
            startOrRetryAttachmentUpload({ environmentId: project.environmentId, image });
          }
          if (failedImages.length > 0) {
            await awaitAttachmentUploads(imageIds);
            uploaded = getUploadedAttachments({ environmentId: project.environmentId, images });
          }
        }
        if (!uploaded) throw new Error("Image upload failed. Try again.");
        attachments = [...existingAttachments, ...uploaded];
      }

      const threadId = editingTask?.id ?? newThreadId();
      const createdAt = new Date().toISOString();
      const fallbackModel = entries[0]
        ? resolveAppModelSelectionForInstance(entries[0].instanceId, settings, providers, undefined)
        : null;
      const internalModelSelection =
        selectedModelSelection ??
        editingTask?.modelSelection ??
        project.defaultModelSelection ??
        (entries[0] && fallbackModel
          ? {
              instanceId: entries[0].instanceId,
              model: fallbackModel,
            }
          : null);
      if (!internalModelSelection) throw new Error("Connect an Agent before creating a task.");
      const name = title.trim() || content.trim().slice(0, 80) || "Image task";
      const task = {
        content: content.trim(),
        attachments,
        statusId: status.id,
        orderKey: editingTask?.task.orderKey ?? createdAt,
        assigned: selectedModelSelection !== null,
        workspaceMode: mode,
      } as const;
      if (selectedModelSelection) {
        const remembered = await updateProject({
          environmentId: project.environmentId,
          input: { projectId: project.id, defaultModelSelection: selectedModelSelection },
        });
        if (remembered._tag === "Failure") throw squashAtomCommandFailure(remembered);
      }

      if (editingTask) {
        const updated = await updateThread({
          environmentId: editingTask.environmentId,
          input: {
            threadId: editingTask.id,
            title: name,
            task,
            ...(selectedModelSelection ? { modelSelection: selectedModelSelection } : {}),
          },
        });
        if (updated._tag === "Failure") throw squashAtomCommandFailure(updated);

        if (startsTurn && selectedModelSelection) {
          const started = await startTurn({
            environmentId: editingTask.environmentId,
            input: {
              threadId: editingTask.id,
              message: {
                messageId: newMessageId(),
                role: "user",
                text: content.trim() || title.trim(),
                attachments,
              },
              modelSelection: selectedModelSelection,
              runtimeMode: editingTask.runtimeMode ?? DEFAULT_RUNTIME_MODE,
              interactionMode: editingTask.interactionMode ?? DEFAULT_PROVIDER_INTERACTION_MODE,
              ...(mode === "worktree" && baseBranch && !editingTask.worktreePath
                ? {
                    bootstrap: {
                      prepareWorktree: {
                        projectCwd: project.workspaceRoot,
                        baseBranch,
                      },
                      runSetupScript: true,
                    },
                  }
                : {}),
              createdAt,
            },
          });
          if (started._tag === "Failure") {
            await updateThread({
              environmentId: editingTask.environmentId,
              input: { threadId: editingTask.id, task: { ...task, assigned: false } },
            });
            throw new Error("The Agent could not start. The task is still unassigned.");
          }
        }
      } else {
        const result = selectedModelSelection
          ? await startTurn({
              environmentId: project.environmentId,
              input: {
                threadId,
                message: {
                  messageId: newMessageId(),
                  role: "user",
                  text: content.trim() || title.trim(),
                  attachments,
                },
                modelSelection: selectedModelSelection,
                runtimeMode: DEFAULT_RUNTIME_MODE,
                interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
                bootstrap: {
                  createThread: {
                    projectId: project.id,
                    title: name,
                    task,
                    modelSelection: selectedModelSelection,
                    runtimeMode: DEFAULT_RUNTIME_MODE,
                    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
                    branch: baseBranch,
                    worktreePath: null,
                    createdAt,
                  },
                  ...(mode === "worktree" && baseBranch
                    ? {
                        prepareWorktree: {
                          projectCwd: project.workspaceRoot,
                          baseBranch,
                        },
                        runSetupScript: true,
                      }
                    : {}),
                },
                createdAt,
              },
            })
          : await createThread({
              environmentId: project.environmentId,
              input: {
                threadId,
                projectId: project.id,
                title: name,
                task,
                modelSelection: internalModelSelection,
                runtimeMode: DEFAULT_RUNTIME_MODE,
                interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
                branch: baseBranch,
                worktreePath: null,
                createdAt,
              },
            });
        if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      }

      releaseAttachmentUploads(images);
      if (!editingTask) {
        await navigate({
          to: "/",
          search: resolveTaskBoardSearch(returnProjectKey),
        });
      } else if (startsTurn) {
        await navigate({
          to: "/$environmentId/$threadId",
          params: { environmentId: project.environmentId, threadId },
        });
      }
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : editingTask
            ? "Could not save the task. Try again."
            : "Could not create the task. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogPopup
        showCloseButton={false}
        className="task-create-dialog w-[calc(100vw-2rem)] max-w-[920px] overflow-hidden rounded-[20px] border border-border bg-card shadow-2xl"
        aria-describedby={undefined}
      >
        <form
          onKeyDown={(event) => {
            if (
              !isCreateTaskSubmitShortcut({
                key: event.key,
                metaKey: event.metaKey,
                ctrlKey: event.ctrlKey,
                altKey: event.altKey,
                shiftKey: event.shiftKey,
                isComposing: event.nativeEvent.isComposing,
                defaultPrevented: event.defaultPrevented,
              })
            )
              return;
            event.preventDefault();
            void submit();
          }}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="flex min-h-0 flex-col"
        >
          <div className="flex items-center gap-3 px-7 pt-7 text-sm">
            <span className="max-w-64 truncate font-medium text-muted-foreground">
              {fixedProjectKey ? (project?.title ?? "Project") : "All tasks"}
            </span>
            <ChevronRightIcon className="size-4 text-muted-foreground" />
            <DialogTitle className="text-sm font-medium">
              {editingTask ? "Edit task" : "New task"}
            </DialogTitle>
          </div>
          <div className="flex min-h-0 flex-col px-7 pb-7 pt-10">
            <input
              aria-label="Task title"
              autoFocus
              placeholder="Task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
              className="w-full bg-transparent text-[26px] font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50"
            />
            <div className="relative mt-5 flex min-h-[245px] flex-col">
              <textarea
                aria-label="Task content"
                placeholder="Describe the task…"
                value={content}
                disabled={busy}
                onChange={(e) => setContent(e.target.value)}
                onPaste={(e) => {
                  const files = Array.from(e.clipboardData.files);
                  const imageFiles = files.filter(
                    (file) => file.type.startsWith("image/") || isHeicImageFile(file),
                  );
                  if (!imageFiles.length) return;
                  e.preventDefault();
                  void addImages(imageFiles);
                }}
                className="min-h-[180px] w-full flex-1 resize-none bg-transparent text-[15px] leading-7 outline-none placeholder:text-muted-foreground/60"
              />
              {(images.length > 0 || existingAttachments.length > 0) && (
                <div className="mb-12 flex flex-wrap gap-2">
                  {existingAttachments.map((attachment) => (
                    <div key={attachment.id} className="relative">
                      <ExistingTaskImage
                        environmentId={editingTask?.environmentId ?? project!.environmentId}
                        attachment={attachment}
                      />
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`Remove ${attachment.name}`}
                        onClick={() =>
                          setExistingAttachments((current) =>
                            current.filter((candidate) => candidate.id !== attachment.id),
                          )
                        }
                        className="absolute -right-1 -top-1 rounded-full bg-background p-1 shadow"
                      >
                        <XIcon className="size-3" />
                      </button>
                    </div>
                  ))}
                  {images.map((image) => (
                    <div key={image.id} className="relative">
                      <img
                        src={image.previewUrl}
                        alt={image.name}
                        className="size-20 rounded-lg border border-border object-cover"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`Remove ${image.name}`}
                        onClick={() => {
                          releaseAttachmentUpload(image.id);
                          URL.revokeObjectURL(image.previewUrl);
                          setImages((old) => old.filter((i) => i.id !== image.id));
                        }}
                        className="absolute -right-1 -top-1 rounded-full bg-background p-1 shadow"
                      >
                        <XIcon className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                aria-label="Add image"
                disabled={busy}
                onClick={() => imageInput.current?.click()}
                className="absolute bottom-0 right-0 grid size-9 place-items-center rounded-full border border-border/70 text-muted-foreground hover:bg-muted"
              >
                <PaperclipIcon className="size-4" />
              </button>
              <input
                ref={imageInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
                multiple
                className="hidden"
                onChange={(e) => {
                  void addImages(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </div>
            <div className="mt-9 flex flex-wrap gap-2 min-[900px]:flex-nowrap">
              {!fixedProjectKey && (
                <label className="relative flex h-8 items-center gap-2 rounded-lg border border-border px-2.5 pr-8 text-sm">
                  <FolderIcon className="size-3.5 text-muted-foreground" />
                  <select
                    aria-label="Project"
                    value={selectedProjectKey}
                    disabled={busy}
                    onChange={(event) => setSelectedProjectKey(event.target.value)}
                    className="max-w-48 appearance-none bg-transparent outline-none"
                  >
                    <option value="" disabled>
                      Select project
                    </option>
                    {projects.map((candidate) => {
                      const key = scopedProjectKey(
                        scopeProjectRef(candidate.environmentId, candidate.id),
                      );
                      return (
                        <option key={key} value={key}>
                          {candidate.title}
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDownIcon className="pointer-events-none absolute right-2.5 size-3.5 text-muted-foreground" />
                </label>
              )}
              <Menu>
                <MenuTrigger
                  aria-label="Status"
                  disabled={busy}
                  className="flex h-8 min-w-28 items-center gap-2 rounded-lg border border-border px-2.5 text-sm outline-none"
                >
                  {status && <TaskStatusIcon status={status} className="size-3.5" />}
                  <span className="flex-1 text-left">{status?.name}</span>
                  <ChevronDownIcon className="size-3.5 text-muted-foreground" />
                </MenuTrigger>
                <MenuPopup align="start" className="w-44">
                  {statuses.map((candidate) => (
                    <MenuItem key={candidate.id} onClick={() => setSelectedStatus(candidate.id)}>
                      <TaskStatusIcon status={candidate} />
                      <span className="flex-1">{candidate.name}</span>
                      {candidate.id === status?.id && <CheckIcon className="size-3.5" />}
                    </MenuItem>
                  ))}
                </MenuPopup>
              </Menu>
              <Menu>
                <MenuTrigger
                  aria-label="Assign Agent"
                  disabled={busy}
                  className="flex h-8 min-w-40 max-w-56 items-center gap-2 rounded-lg border border-border px-2.5 text-sm outline-none"
                >
                  {entry ? (
                    <ProviderInstanceIcon
                      driverKind={entry.driverKind}
                      displayName={entry.displayName}
                      accentColor={entry.accentColor}
                      className="size-4"
                      iconClassName="size-4"
                    />
                  ) : (
                    <CircleDashedIcon className="size-4 text-muted-foreground/70" />
                  )}
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-left",
                      !entry && "text-muted-foreground",
                    )}
                  >
                    {entry?.displayName ?? "Unassigned"}
                  </span>
                  <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
                </MenuTrigger>
                <MenuPopup align="start" className="w-56">
                  {(!editingTask || !taskHasStarted(editingTask)) && (
                    <MenuItem
                      onClick={() => {
                        setInstanceId("");
                        setSelectedModel("");
                        setSelectedOptions(undefined);
                      }}
                    >
                      <CircleDashedIcon className="size-4 text-muted-foreground/70" />
                      <span className="flex-1 text-muted-foreground">Unassigned</span>
                      {!entry && <CheckIcon className="size-3.5" />}
                    </MenuItem>
                  )}
                  {entries.map((candidate) => (
                    <MenuItem
                      key={candidate.instanceId}
                      onClick={() => {
                        setInstanceId(candidate.instanceId);
                        setSelectedModel("");
                        setSelectedOptions(
                          optionSelectionSource?.instanceId === candidate.instanceId
                            ? optionSelectionSource.options
                            : undefined,
                        );
                      }}
                    >
                      <ProviderInstanceIcon
                        driverKind={candidate.driverKind}
                        displayName={candidate.displayName}
                        accentColor={candidate.accentColor}
                        className="size-4"
                        iconClassName="size-4"
                      />
                      <span className="min-w-0 flex-1 truncate">{candidate.displayName}</span>
                      {candidate.instanceId === entry?.instanceId && (
                        <CheckIcon className="size-3.5" />
                      )}
                    </MenuItem>
                  ))}
                </MenuPopup>
              </Menu>
              {entry && (
                <label className="relative flex h-8 items-center rounded-lg border border-border pl-2.5 pr-8 text-sm text-foreground">
                  <select
                    aria-label="Model"
                    disabled={busy}
                    value={model ?? ""}
                    onChange={(e) => {
                      setSelectedModel(e.target.value);
                      setSelectedOptions(
                        optionSelectionSource?.instanceId === entry.instanceId &&
                          optionSelectionSource.model === e.target.value
                          ? optionSelectionSource.options
                          : undefined,
                      );
                    }}
                    className="max-w-56 appearance-none bg-transparent outline-none"
                  >
                    {models.map((m) => (
                      <option key={m.slug} value={m.slug}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon className="pointer-events-none absolute right-2.5 size-3.5 text-muted-foreground" />
                </label>
              )}
              {reasoningDescriptor?.type === "select" && typeof reasoningValue === "string" && (
                <label className="relative flex h-8 items-center gap-2 rounded-lg border border-border px-2.5 pr-8 text-sm">
                  <BrainIcon className="size-3.5 text-muted-foreground" />
                  <select
                    aria-label="Reasoning effort"
                    disabled={busy}
                    value={reasoningValue}
                    onChange={(event) =>
                      setSelectedOptions((current) =>
                        withOption(current, reasoningDescriptor.id, event.target.value),
                      )
                    }
                    className="max-w-40 appearance-none bg-transparent outline-none"
                  >
                    {reasoningDescriptor.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon className="pointer-events-none absolute right-2.5 size-3.5 text-muted-foreground" />
                </label>
              )}
            </div>
            {error && (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-border bg-background/40 px-7 py-4">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                busy ||
                pendingImageCount > 0 ||
                !project ||
                !status ||
                (entry !== null && model === null) ||
                (!title.trim() &&
                  !content.trim() &&
                  !images.length &&
                  existingAttachments.length === 0)
              }
              className="rounded-xl"
            >
              {busy
                ? editingTask
                  ? "Saving…"
                  : "Creating…"
                : editingTask
                  ? "Save changes"
                  : "Create task"}
            </Button>
          </div>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
