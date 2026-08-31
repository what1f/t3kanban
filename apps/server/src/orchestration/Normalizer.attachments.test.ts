// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import {
  type ClientOrchestrationCommand,
  CommandId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerConfig from "../config.ts";
import * as WorkspacePaths from "../workspace/WorkspacePaths.ts";
import { cleanupFailedUploadedAttachments, normalizeDispatchCommand } from "./Normalizer.ts";

const testLayer = Layer.mergeAll(
  WorkspacePaths.layer,
  ServerConfig.layerTest(process.cwd(), { prefix: "t3-normalizer-attachments-" }),
).pipe(Layer.provideMerge(NodeServices.layer));

const attachmentUuid = "00000000-0000-4000-8000-0000000000aa";

function turnStartCommand(input: {
  readonly threadId?: string;
  readonly attachments: ReadonlyArray<
    | { readonly id: string; readonly sizeBytes: number }
    | { readonly dataUrl: string; readonly sizeBytes: number }
  >;
}): ClientOrchestrationCommand {
  return {
    type: "thread.turn.start",
    commandId: CommandId.make("command-1"),
    threadId: ThreadId.make(input.threadId ?? "thread-1"),
    message: {
      messageId: MessageId.make("message-1"),
      role: "user",
      text: "look at this",
      attachments: input.attachments.map((attachment) => ({
        type: "image" as const,
        name: "screenshot.png",
        mimeType: "image/png",
        ...attachment,
      })),
    },
    runtimeMode: "full-access",
    interactionMode: "default",
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

function threadCreateCommand(attachmentId: string, sizeBytes: number): ClientOrchestrationCommand {
  return {
    type: "thread.create",
    commandId: CommandId.make("command-create"),
    threadId: ThreadId.make("thread-unassigned"),
    projectId: ProjectId.make("project-1"),
    title: "Unassigned task",
    task: {
      content: "review the image",
      attachments: [
        {
          type: "image",
          id: attachmentId,
          name: "screenshot.png",
          mimeType: "image/png",
          sizeBytes,
        },
      ],
      statusId: "todo",
      orderKey: "a",
      assigned: false,
    },
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

function threadMetaUpdateCommand(
  attachments: ReadonlyArray<{ readonly id: string; readonly sizeBytes: number }>,
): ClientOrchestrationCommand {
  return {
    type: "thread.meta.update",
    commandId: CommandId.make("command-update"),
    threadId: ThreadId.make("thread-edit"),
    task: {
      content: "review the images",
      attachments: attachments.map((attachment) => ({
        type: "image" as const,
        name: "screenshot.png",
        mimeType: "image/png",
        ...attachment,
      })),
      statusId: "todo",
      orderKey: "a",
      assigned: false,
    },
  };
}

describe("normalizeDispatchCommand attachments", () => {
  it.effect("claims newly uploaded task attachments while preserving existing references", () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const bytes = Buffer.from("pixels");
      const pendingId = `pending-${attachmentUuid}`;
      const pendingPath = NodePath.join(config.attachmentsDir, `${pendingId}.png`);
      NodeFS.writeFileSync(pendingPath, bytes);
      const existingId = "thread-edit-00000000-0000-4000-8000-0000000000bb";
      const missingLegacyId = "pending-00000000-0000-4000-8000-0000000000cc";
      const command = threadMetaUpdateCommand([
        { id: pendingId, sizeBytes: bytes.byteLength },
        { id: existingId, sizeBytes: bytes.byteLength },
        { id: missingLegacyId, sizeBytes: bytes.byteLength },
      ]);

      const normalized = yield* normalizeDispatchCommand(command);
      if (normalized.type !== "thread.meta.update" || !normalized.task) {
        throw new Error("Expected a task metadata update command.");
      }

      const claimed = normalized.task.attachments[0]!;
      expect(claimed.id.startsWith("thread-edit-")).toBe(true);
      expect(claimed.id).not.toBe(existingId);
      expect(normalized.task.attachments[1]?.id).toBe(existingId);
      expect(normalized.task.attachments[2]?.id).toBe(missingLegacyId);

      yield* cleanupFailedUploadedAttachments(command, normalized);
      expect(NodeFS.existsSync(pendingPath)).toBe(true);
      expect(NodeFS.existsSync(NodePath.join(config.attachmentsDir, `${claimed.id}.png`))).toBe(
        false,
      );
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("claims task attachments when creating an unassigned task", () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const bytes = Buffer.from("pixels");
      const pendingId = `pending-${attachmentUuid}`;
      const pendingPath = NodePath.join(config.attachmentsDir, `${pendingId}.png`);
      NodeFS.writeFileSync(pendingPath, bytes);
      const command = threadCreateCommand(pendingId, bytes.byteLength);

      const normalized = yield* normalizeDispatchCommand(command);
      if (normalized.type !== "thread.create" || !normalized.task) {
        throw new Error("Expected a task thread.create command.");
      }

      const attachment = normalized.task.attachments[0]!;
      expect(attachment.id.startsWith("thread-unassigned-")).toBe(true);
      expect(NodeFS.existsSync(pendingPath)).toBe(true);
      expect(NodeFS.existsSync(NodePath.join(config.attachmentsDir, `${attachment.id}.png`))).toBe(
        true,
      );

      yield* cleanupFailedUploadedAttachments(command, normalized);
      expect(NodeFS.existsSync(pendingPath)).toBe(true);
      expect(NodeFS.existsSync(NodePath.join(config.attachmentsDir, `${attachment.id}.png`))).toBe(
        false,
      );
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("reuses the message attachment claim in bootstrap task metadata", () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const bytes = Buffer.from("pixels");
      const pendingId = `pending-${attachmentUuid}`;
      NodeFS.writeFileSync(NodePath.join(config.attachmentsDir, `${pendingId}.png`), bytes);
      const base = turnStartCommand({
        attachments: [{ id: pendingId, sizeBytes: bytes.byteLength }],
      });
      if (base.type !== "thread.turn.start") throw new Error("Expected a turn start command.");
      const taskAttachment = base.message.attachments[0];
      if (!taskAttachment || !("id" in taskAttachment)) {
        throw new Error("Expected an uploaded attachment.");
      }
      const command: ClientOrchestrationCommand = {
        ...base,
        bootstrap: {
          createThread: {
            projectId: ProjectId.make("project-1"),
            title: "Assigned task",
            task: {
              content: "review the image",
              attachments: [taskAttachment],
              statusId: "todo",
              orderKey: "a",
              assigned: true,
            },
            modelSelection: {
              instanceId: ProviderInstanceId.make("codex"),
              model: "gpt-5",
            },
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: null,
            worktreePath: null,
            createdAt: "2026-08-01T00:00:00.000Z",
          },
        },
      };

      const normalized = yield* normalizeDispatchCommand(command);
      if (normalized.type !== "thread.turn.start" || !normalized.bootstrap?.createThread?.task) {
        throw new Error("Expected task metadata in the normalized bootstrap.");
      }

      expect(normalized.bootstrap.createThread.task.attachments[0]?.id).toBe(
        normalized.message.attachments[0]?.id,
      );
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("preserves inline image attachments from existing mobile clients", () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const normalized = yield* normalizeDispatchCommand(
        turnStartCommand({
          attachments: [{ dataUrl: "data:image/png;base64,cGl4ZWxz", sizeBytes: 6 }],
        }),
      );
      if (normalized.type !== "thread.turn.start") {
        throw new Error("Expected a thread.turn.start command.");
      }

      const attachment = normalized.message.attachments[0]!;
      expect(attachment.id.startsWith("thread-1-")).toBe(true);
      expect(
        NodeFS.readFileSync(NodePath.join(config.attachmentsDir, `${attachment.id}.png`)),
      ).toEqual(Buffer.from("pixels"));
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("claims uploaded attachments while retaining a retryable pending copy", () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const bytes = Buffer.from("pixels");
      const pendingPath = NodePath.join(config.attachmentsDir, `pending-${attachmentUuid}.png`);
      NodeFS.writeFileSync(pendingPath, bytes);

      const normalized = yield* normalizeDispatchCommand(
        turnStartCommand({
          attachments: [{ id: `pending-${attachmentUuid}`, sizeBytes: bytes.byteLength }],
        }),
      );
      if (normalized.type !== "thread.turn.start") {
        throw new Error("Expected a thread.turn.start command.");
      }

      const attachmentId = normalized.message.attachments[0]!.id;
      expect(attachmentId.startsWith("thread-1-")).toBe(true);
      expect(attachmentId).not.toBe(`thread-1-${attachmentUuid}`);
      expect(NodeFS.existsSync(pendingPath)).toBe(true);
      expect(NodeFS.existsSync(NodePath.join(config.attachmentsDir, `${attachmentId}.png`))).toBe(
        true,
      );
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("normalizes inline and uploaded attachments in the same turn", () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      NodeFS.writeFileSync(
        NodePath.join(config.attachmentsDir, `pending-${attachmentUuid}.png`),
        Buffer.from("pixels"),
      );

      const normalized = yield* normalizeDispatchCommand(
        turnStartCommand({
          attachments: [
            { dataUrl: "data:image/png;base64,cGl4ZWxz", sizeBytes: 6 },
            { id: `pending-${attachmentUuid}`, sizeBytes: 6 },
          ],
        }),
      );
      if (normalized.type !== "thread.turn.start") {
        throw new Error("Expected a thread.turn.start command.");
      }

      expect(normalized.message.attachments).toHaveLength(2);
      expect(normalized.message.attachments[1]?.id.startsWith("thread-1-")).toBe(true);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("retries a failed bootstrap with a fresh thread id", () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const bytes = Buffer.from("pixels");
      NodeFS.writeFileSync(
        NodePath.join(config.attachmentsDir, `pending-${attachmentUuid}.png`),
        bytes,
      );

      const first = yield* normalizeDispatchCommand(
        turnStartCommand({
          attachments: [{ id: `pending-${attachmentUuid}`, sizeBytes: bytes.byteLength }],
        }),
      );
      if (first.type !== "thread.turn.start") {
        throw new Error("Expected a thread.turn.start command.");
      }
      NodeFS.rmSync(
        NodePath.join(config.attachmentsDir, `${first.message.attachments[0]!.id}.png`),
      );

      const retried = yield* normalizeDispatchCommand(
        turnStartCommand({
          threadId: "thread-retry",
          attachments: [{ id: `pending-${attachmentUuid}`, sizeBytes: bytes.byteLength }],
        }),
      );
      if (retried.type !== "thread.turn.start") {
        throw new Error("Expected a thread.turn.start command.");
      }
      expect(retried.message.attachments[0]?.id.startsWith("thread-retry-")).toBe(true);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("removes failed attachment claims without deleting their pending uploads", () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const pendingPath = NodePath.join(config.attachmentsDir, `pending-${attachmentUuid}.png`);
      NodeFS.writeFileSync(pendingPath, Buffer.from("pixels"));
      const command = turnStartCommand({
        attachments: [
          { dataUrl: "data:image/png;base64,cGl4ZWxz", sizeBytes: 6 },
          { id: `pending-${attachmentUuid}`, sizeBytes: 6 },
        ],
      });
      const normalized = yield* normalizeDispatchCommand(command);
      if (normalized.type !== "thread.turn.start") {
        throw new Error("Expected a thread.turn.start command.");
      }

      const inlinePath = NodePath.join(
        config.attachmentsDir,
        `${normalized.message.attachments[0]!.id}.png`,
      );
      const claimedPath = NodePath.join(
        config.attachmentsDir,
        `${normalized.message.attachments[1]!.id}.png`,
      );
      yield* cleanupFailedUploadedAttachments(command, normalized);

      expect(NodeFS.existsSync(pendingPath)).toBe(true);
      expect(NodeFS.existsSync(claimedPath)).toBe(false);
      expect(NodeFS.existsSync(inlinePath)).toBe(true);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("removes a failed claimed copy after its pending original was removed", () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const pendingPath = NodePath.join(config.attachmentsDir, `pending-${attachmentUuid}.png`);
      NodeFS.writeFileSync(pendingPath, Buffer.from("pixels"));
      const command = turnStartCommand({
        attachments: [{ id: `pending-${attachmentUuid}`, sizeBytes: 6 }],
      });
      const normalized = yield* normalizeDispatchCommand(command);
      if (normalized.type !== "thread.turn.start") {
        throw new Error("Expected a thread.turn.start command.");
      }

      const claimedPath = NodePath.join(
        config.attachmentsDir,
        `${normalized.message.attachments[0]!.id}.png`,
      );
      NodeFS.rmSync(pendingPath);

      yield* cleanupFailedUploadedAttachments(command, normalized);

      expect(NodeFS.existsSync(claimedPath)).toBe(false);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("keeps concurrent claims independent when one dispatch fails", () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const pendingPath = NodePath.join(config.attachmentsDir, `pending-${attachmentUuid}.png`);
      NodeFS.writeFileSync(pendingPath, Buffer.from("pixels"));
      const command = turnStartCommand({
        attachments: [{ id: `pending-${attachmentUuid}`, sizeBytes: 6 }],
      });

      const [failed, succeeded] = yield* Effect.all(
        [normalizeDispatchCommand(command), normalizeDispatchCommand(command)],
        { concurrency: 2 },
      );
      if (failed.type !== "thread.turn.start" || succeeded.type !== "thread.turn.start") {
        throw new Error("Expected thread.turn.start commands.");
      }

      const failedPath = NodePath.join(
        config.attachmentsDir,
        `${failed.message.attachments[0]!.id}.png`,
      );
      const succeededPath = NodePath.join(
        config.attachmentsDir,
        `${succeeded.message.attachments[0]!.id}.png`,
      );
      expect(failedPath).not.toBe(succeededPath);

      yield* cleanupFailedUploadedAttachments(command, failed);

      expect(NodeFS.existsSync(pendingPath)).toBe(true);
      expect(NodeFS.existsSync(failedPath)).toBe(false);
      expect(NodeFS.existsSync(succeededPath)).toBe(true);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("removes earlier claimed copies when a later attachment cannot be normalized", () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const pendingId = `pending-${attachmentUuid}`;
      const pendingPath = NodePath.join(config.attachmentsDir, `${pendingId}.png`);
      NodeFS.writeFileSync(pendingPath, Buffer.from("pixels"));

      const failure = yield* normalizeDispatchCommand(
        turnStartCommand({
          attachments: [
            { id: pendingId, sizeBytes: 6 },
            {
              id: "pending-00000000-0000-4000-8000-0000000000ff",
              sizeBytes: 6,
            },
          ],
        }),
      ).pipe(Effect.flip);

      expect(failure.message).toContain("not found");
      expect(NodeFS.readdirSync(config.attachmentsDir)).toEqual([`${pendingId}.png`]);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("rejects uploaded attachments with the wrong size or thread", () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      NodeFS.writeFileSync(
        NodePath.join(config.attachmentsDir, `pending-${attachmentUuid}.png`),
        Buffer.from("pixels"),
      );

      const wrongSize = yield* normalizeDispatchCommand(
        turnStartCommand({
          attachments: [{ id: `pending-${attachmentUuid}`, sizeBytes: 999 }],
        }),
      ).pipe(Effect.flip);
      expect(wrongSize.message).toContain("size");

      const wrongThread = yield* normalizeDispatchCommand(
        turnStartCommand({
          attachments: [{ id: `another-thread-${attachmentUuid}`, sizeBytes: 6 }],
        }),
      ).pipe(Effect.flip);
      expect(wrongThread.message).toContain("pending upload");

      const mismatchedTypeCommand = turnStartCommand({
        attachments: [{ id: `pending-${attachmentUuid}`, sizeBytes: 6 }],
      });
      if (mismatchedTypeCommand.type !== "thread.turn.start") {
        throw new Error("Expected a thread.turn.start command.");
      }
      const mismatchedType = yield* normalizeDispatchCommand({
        ...mismatchedTypeCommand,
        message: {
          ...mismatchedTypeCommand.message,
          attachments: mismatchedTypeCommand.message.attachments.map((attachment) => ({
            ...attachment,
            mimeType: "image/jpeg",
          })),
        },
      }).pipe(Effect.flip);
      expect(mismatchedType.message).toContain("image type");
    }).pipe(Effect.provide(testLayer)),
  );
});
