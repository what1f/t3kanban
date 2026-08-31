import { createFileRoute } from "@tanstack/react-router";
import { TaskInboxPage } from "../components/tasks/TaskInboxPage";
export const Route = createFileRoute("/_chat/inbox")({ component: TaskInboxPage });
