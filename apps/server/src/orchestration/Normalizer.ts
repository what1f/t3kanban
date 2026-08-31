import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  type ClientOrchestrationCommand,
  type ChatImageAttachment,
  type IsoDateTime,
  type OrchestrationCommand,
  OrchestrationDispatchCommandError,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  type ThreadTaskDetails,
  type UploadChatImageAttachment,
} from "@t3tools/contracts";

import {
  createAttachmentId,
  planAttachmentClaim,
  PENDING_ATTACHMENT_THREAD_SEGMENT,
  parseThreadSegmentFromAttachmentId,
  resolveAttachmentPath,
  resolveAttachmentPathById,
  toSafeThreadAttachmentSegment,
} from "../attachmentStore.ts";
import { ServerConfig } from "../config.ts";
import { parseBase64DataUrl } from "../imageMime.ts";
import * as WorkspacePaths from "../workspace/WorkspacePaths.ts";

export const canonicalizeClientCommandTimestamps = (
  command: ClientOrchestrationCommand,
  receivedAt: IsoDateTime,
): ClientOrchestrationCommand => {
  const canonicalCommand =
    "createdAt" in command
      ? {
          ...command,
          createdAt: receivedAt,
        }
      : command;

  if (canonicalCommand.type !== "thread.turn.start" || !canonicalCommand.bootstrap?.createThread) {
    return canonicalCommand;
  }

  return {
    ...canonicalCommand,
    bootstrap: {
      ...canonicalCommand.bootstrap,
      createThread: {
        ...canonicalCommand.bootstrap.createThread,
        createdAt: receivedAt,
      },
    },
  };
};

const removeClaimedAttachmentPaths = Effect.fn("Normalizer.removeClaimedAttachmentPaths")(
  function* (attachmentPaths: ReadonlyArray<string>) {
    if (attachmentPaths.length === 0) {
      return;
    }
    const fileSystem = yield* FileSystem.FileSystem;
    yield* Effect.forEach(
      attachmentPaths,
      (attachmentPath) =>
        fileSystem.remove(attachmentPath, { force: true }).pipe(
          Effect.tapError((cause) =>
            Effect.logWarning("Failed to remove an unclaimed attachment copy.", {
              attachmentPath,
              cause,
            }),
          ),
          Effect.orElseSucceed(() => undefined),
        ),
      { concurrency: 1 },
    );
  },
);

export const normalizeDispatchCommand = (command: ClientOrchestrationCommand) =>
  Effect.gen(function* () {
    const receivedAt = DateTime.formatIso(yield* DateTime.now);
    const canonicalCommand = canonicalizeClientCommandTimestamps(command, receivedAt);
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const serverConfig = yield* ServerConfig;
    const workspacePaths = yield* WorkspacePaths.WorkspacePaths;

    const normalizeProjectWorkspaceRoot = (workspaceRoot: string) =>
      workspacePaths.normalizeWorkspaceRoot(workspaceRoot).pipe(
        Effect.mapError(
          (cause) =>
            new OrchestrationDispatchCommandError({
              message: cause.message,
            }),
        ),
      );

    const normalizeProjectWorkspaceRootForCreate = (
      workspaceRoot: string,
      createIfMissing: boolean | undefined,
    ) =>
      workspacePaths
        .normalizeWorkspaceRoot(workspaceRoot, {
          createIfMissing: createIfMissing === true,
        })
        .pipe(
          Effect.mapError(
            (cause) =>
              new OrchestrationDispatchCommandError({
                message: cause.message,
              }),
          ),
        );

    if (canonicalCommand.type === "project.create") {
      return {
        ...canonicalCommand,
        workspaceRoot: yield* normalizeProjectWorkspaceRootForCreate(
          canonicalCommand.workspaceRoot,
          canonicalCommand.createWorkspaceRootIfMissing,
        ),
        createWorkspaceRootIfMissing: canonicalCommand.createWorkspaceRootIfMissing === true,
      } satisfies OrchestrationCommand;
    }

    if (
      canonicalCommand.type === "project.meta.update" &&
      canonicalCommand.workspaceRoot !== undefined
    ) {
      return {
        ...canonicalCommand,
        workspaceRoot: yield* normalizeProjectWorkspaceRoot(canonicalCommand.workspaceRoot),
      } satisfies OrchestrationCommand;
    }

    const claimedAttachmentPaths: string[] = [];
    const normalizedUploadedAttachments = new Map<string, ChatImageAttachment>();
    const normalizeAttachments = (
      threadId: string,
      attachments: ReadonlyArray<ChatImageAttachment | UploadChatImageAttachment>,
      options?: { readonly preserveExistingTaskReferences?: boolean },
    ) =>
      Effect.forEach(
        attachments,
        (attachment) =>
          Effect.gen(function* () {
            if (!("dataUrl" in attachment)) {
              const cached = normalizedUploadedAttachments.get(attachment.id);
              if (cached) return cached;

              const requestedSegment = parseThreadSegmentFromAttachmentId(attachment.id);
              const threadSegment = toSafeThreadAttachmentSegment(threadId);
              if (
                options?.preserveExistingTaskReferences &&
                (requestedSegment !== PENDING_ATTACHMENT_THREAD_SEGMENT ||
                  resolveAttachmentPathById({
                    attachmentsDir: serverConfig.attachmentsDir,
                    attachmentId: attachment.id,
                  }) === null)
              ) {
                return {
                  ...attachment,
                  mimeType: attachment.mimeType.toLowerCase(),
                } satisfies ChatImageAttachment;
              }
              if (requestedSegment === threadSegment) {
                const normalizedAttachment = {
                  ...attachment,
                  mimeType: attachment.mimeType.toLowerCase(),
                } satisfies ChatImageAttachment;
                const attachmentPath = resolveAttachmentPath({
                  attachmentsDir: serverConfig.attachmentsDir,
                  attachment: normalizedAttachment,
                });
                if (!attachmentPath) {
                  return yield* new OrchestrationDispatchCommandError({
                    message: `Attachment '${attachment.name}' cannot be used: image type does not match the stored file.`,
                  });
                }
                const info = yield* fileSystem.stat(attachmentPath).pipe(
                  Effect.mapError(
                    (cause) =>
                      new OrchestrationDispatchCommandError({
                        message: `Attachment '${attachment.name}' cannot be used: attachment not found.`,
                        cause,
                      }),
                  ),
                );
                if (Number(info.size) !== attachment.sizeBytes) {
                  return yield* new OrchestrationDispatchCommandError({
                    message: `Attachment '${attachment.name}' cannot be used: stored size does not match.`,
                  });
                }
                normalizedUploadedAttachments.set(attachment.id, normalizedAttachment);
                return normalizedAttachment;
              }

              const claim = planAttachmentClaim({
                attachmentsDir: serverConfig.attachmentsDir,
                threadId,
                attachmentId: attachment.id,
              });
              if (!claim.ok) {
                return yield* new OrchestrationDispatchCommandError({
                  message: `Attachment '${attachment.name}' cannot be sent: ${claim.reason}.`,
                });
              }

              const info = yield* fileSystem.stat(claim.currentPath).pipe(
                Effect.mapError(
                  (cause) =>
                    new OrchestrationDispatchCommandError({
                      message: `Attachment '${attachment.name}' cannot be sent: attachment not found.`,
                      cause,
                    }),
                ),
              );
              if (Number(info.size) !== attachment.sizeBytes) {
                return yield* new OrchestrationDispatchCommandError({
                  message: `Attachment '${attachment.name}' cannot be sent: stored size does not match.`,
                });
              }

              const normalizedAttachment = {
                ...attachment,
                id: claim.finalId,
                mimeType: attachment.mimeType.toLowerCase(),
              };
              const expectedPath = resolveAttachmentPath({
                attachmentsDir: serverConfig.attachmentsDir,
                attachment: normalizedAttachment,
              });
              if (expectedPath !== claim.finalPath) {
                return yield* new OrchestrationDispatchCommandError({
                  message: `Attachment '${attachment.name}' cannot be sent: image type does not match the upload.`,
                });
              }

              // Keep the pending copy until the command succeeds. A failed
              // create or bootstrap can then retry with a fresh thread id.
              yield* fileSystem.copyFile(claim.currentPath, claim.finalPath).pipe(
                Effect.mapError(
                  (cause) =>
                    new OrchestrationDispatchCommandError({
                      message: `Failed to claim attachment '${attachment.name}' for this thread.`,
                      cause,
                    }),
                ),
              );
              claimedAttachmentPaths.push(claim.finalPath);
              normalizedUploadedAttachments.set(attachment.id, normalizedAttachment);

              return normalizedAttachment;
            }

            const parsed = parseBase64DataUrl(attachment.dataUrl);
            if (!parsed || !parsed.mimeType.startsWith("image/")) {
              return yield* new OrchestrationDispatchCommandError({
                message: `Invalid image attachment payload for '${attachment.name}'.`,
              });
            }

            const bytes = Buffer.from(parsed.base64, "base64");
            if (bytes.byteLength === 0 || bytes.byteLength > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) {
              return yield* new OrchestrationDispatchCommandError({
                message: `Image attachment '${attachment.name}' is empty or too large.`,
              });
            }

            const attachmentId = createAttachmentId(threadId);
            if (!attachmentId) {
              return yield* new OrchestrationDispatchCommandError({
                message: "Failed to create a safe attachment id.",
              });
            }

            const persistedAttachment = {
              type: "image" as const,
              id: attachmentId,
              name: attachment.name,
              mimeType: parsed.mimeType.toLowerCase(),
              sizeBytes: bytes.byteLength,
            };

            const attachmentPath = resolveAttachmentPath({
              attachmentsDir: serverConfig.attachmentsDir,
              attachment: persistedAttachment,
            });
            if (!attachmentPath) {
              return yield* new OrchestrationDispatchCommandError({
                message: `Failed to resolve persisted path for '${attachment.name}'.`,
              });
            }

            yield* fileSystem.makeDirectory(path.dirname(attachmentPath), { recursive: true }).pipe(
              Effect.mapError(
                () =>
                  new OrchestrationDispatchCommandError({
                    message: `Failed to create attachment directory for '${attachment.name}'.`,
                  }),
              ),
            );
            yield* fileSystem.writeFile(attachmentPath, bytes).pipe(
              Effect.mapError(
                () =>
                  new OrchestrationDispatchCommandError({
                    message: `Failed to persist attachment '${attachment.name}'.`,
                  }),
              ),
            );

            return persistedAttachment;
          }),
        { concurrency: 1 },
      );

    const normalizeTask = (
      threadId: string,
      task: Omit<ThreadTaskDetails, "attachments"> & {
        readonly attachments: ReadonlyArray<ChatImageAttachment | UploadChatImageAttachment>;
      },
    ) =>
      normalizeAttachments(threadId, task.attachments).pipe(
        Effect.map((attachments) => ({ ...task, attachments })),
      );

    const normalizedCommand = yield* Effect.gen(function* () {
      if (canonicalCommand.type === "thread.create" && canonicalCommand.task) {
        return {
          ...canonicalCommand,
          task: yield* normalizeTask(canonicalCommand.threadId, canonicalCommand.task),
        } satisfies OrchestrationCommand;
      }

      if (canonicalCommand.type === "thread.meta.update" && canonicalCommand.task) {
        return {
          ...canonicalCommand,
          task: yield* normalizeAttachments(
            canonicalCommand.threadId,
            canonicalCommand.task.attachments,
            { preserveExistingTaskReferences: true },
          ).pipe(Effect.map((attachments) => ({ ...canonicalCommand.task!, attachments }))),
        } satisfies OrchestrationCommand;
      }

      if (canonicalCommand.type !== "thread.turn.start") {
        return canonicalCommand as OrchestrationCommand;
      }

      const attachments = yield* normalizeAttachments(
        canonicalCommand.threadId,
        canonicalCommand.message.attachments,
      );
      const createThread = canonicalCommand.bootstrap?.createThread;
      const normalizedCreateThread =
        createThread?.task === undefined
          ? createThread
          : {
              ...createThread,
              task: yield* normalizeTask(canonicalCommand.threadId, createThread.task),
            };

      return {
        ...canonicalCommand,
        message: {
          ...canonicalCommand.message,
          attachments,
        },
        ...(canonicalCommand.bootstrap
          ? {
              bootstrap: {
                ...canonicalCommand.bootstrap,
                ...(normalizedCreateThread ? { createThread: normalizedCreateThread } : {}),
              },
            }
          : {}),
      } satisfies OrchestrationCommand;
    }).pipe(Effect.tapError(() => removeClaimedAttachmentPaths(claimedAttachmentPaths)));

    return normalizedCommand;
  });

export const cleanupFailedUploadedAttachments = Effect.fn(
  "Normalizer.cleanupFailedUploadedAttachments",
)(function* (command: ClientOrchestrationCommand, normalizedCommand: OrchestrationCommand) {
  const serverConfig = yield* ServerConfig;
  const claimedPaths: string[] = [];
  const collectClaimedPaths = (
    originals: ReadonlyArray<ChatImageAttachment | UploadChatImageAttachment>,
    normalized: ReadonlyArray<ChatImageAttachment>,
  ) => {
    for (const [index, attachment] of normalized.entries()) {
      const original = originals[index];
      if (
        !original ||
        "dataUrl" in original ||
        parseThreadSegmentFromAttachmentId(original.id) !== PENDING_ATTACHMENT_THREAD_SEGMENT
      ) {
        continue;
      }

      const claimedPath = resolveAttachmentPath({
        attachmentsDir: serverConfig.attachmentsDir,
        attachment,
      });
      if (claimedPath) claimedPaths.push(claimedPath);
    }
  };

  if (command.type === "thread.turn.start" && normalizedCommand.type === "thread.turn.start") {
    collectClaimedPaths(command.message.attachments, normalizedCommand.message.attachments);
  } else if (command.type === "thread.create" && normalizedCommand.type === "thread.create") {
    if (command.task && normalizedCommand.task) {
      collectClaimedPaths(command.task.attachments, normalizedCommand.task.attachments);
    }
  } else if (
    command.type === "thread.meta.update" &&
    normalizedCommand.type === "thread.meta.update"
  ) {
    if (command.task && normalizedCommand.task) {
      collectClaimedPaths(command.task.attachments, normalizedCommand.task.attachments);
    }
  } else {
    return;
  }

  yield* removeClaimedAttachmentPaths([...new Set(claimedPaths)]);
});
