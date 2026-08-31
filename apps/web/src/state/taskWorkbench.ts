import { useAtomValue } from "@effect/atom-react";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS, type EnvironmentId, type TaskWorkbenchSnapshot } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { environmentCatalog } from "../connection/catalog";
import { connectionAtomRuntime } from "../connection/runtime";
import { formatEnvironmentQueryError } from "./query";

export const taskWorkbench = {
  subscribe: createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
    label: "task-workbench",
    tag: WS_METHODS.taskWorkbenchSubscribe,
  }),
  mutate: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "task-workbench:mutate",
    tag: WS_METHODS.taskWorkbenchMutate,
  }),
};

const workbenchesAtom = Atom.make((get) => {
  const snapshots = new Map<EnvironmentId, TaskWorkbenchSnapshot>();
  const errors: string[] = [];
  for (const environmentId of get(environmentCatalog.catalogValueAtom).entries.keys()) {
    const result = get(taskWorkbench.subscribe({ environmentId, input: {} }));
    const value = Option.getOrNull(AsyncResult.value(result));
    if (value) snapshots.set(environmentId, value);
    if (result._tag === "Failure") errors.push(formatEnvironmentQueryError(result.cause));
  }
  return { snapshots, errors };
});

export function useTaskWorkbenches() {
  return useAtomValue(workbenchesAtom);
}
