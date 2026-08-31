import type { TaskStatus } from "@t3tools/contracts";
import { CheckIcon, CircleDotIcon, CircleIcon } from "lucide-react";
import { cn } from "../../lib/utils";

const STATUS_COLORS: Record<string, string> = {
  todo: "text-zinc-500 dark:text-zinc-400",
  "in-progress": "text-blue-500 dark:text-blue-400",
  "in-review": "text-amber-500 dark:text-amber-400",
  blocked: "text-red-500 dark:text-red-400",
  done: "text-emerald-500 dark:text-emerald-400",
};

export function TaskStatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const color = STATUS_COLORS[status.id] ?? STATUS_COLORS.todo;
  if (status.completed) {
    return (
      <span
        aria-hidden
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded-full bg-current",
          color,
          className,
        )}
      >
        <CheckIcon className="size-3 text-background" strokeWidth={3} />
      </span>
    );
  }
  const Icon = status.position === 0 ? CircleIcon : CircleDotIcon;
  return <Icon aria-hidden className={cn("size-4 shrink-0", color, className)} />;
}
