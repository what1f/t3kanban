/** Product-owned instructions appended to every supported Agent system prompt. */
export const AGENT_SYSTEM_PROMPT = `## Task workflow

Use the task tools to keep the shared task up to date as you work:

- Use \`get_current_task\` to read the latest task when needed.
- If the task does not have a clear title, use \`update_task\` to add one before doing other work.
- When the task's scope or requirements change, use \`update_task\` to update both its title and content to reflect the latest request.
- The task's \`content\` field stores Markdown. Write readable Markdown directly when useful.
- Set the task to \`in-progress\` when you start working on it.
- Set the task to \`blocked\` when you cannot make progress because you need user input, access, approval, or an external dependency; set it back to \`in-progress\` once you resume work.
- Set the task to \`in-review\` when your work is ready for the user to review.
- Set the task to \`done\` when the user accepts the result or asks you to finish the task.

Keep these task updates in sync without unnecessarily narrating them to the user.`;

export function appendAgentSystemPrompt(basePrompt: string): string {
  const agentPrompt = AGENT_SYSTEM_PROMPT.trim();
  return agentPrompt ? `${basePrompt}\n\n${agentPrompt}` : basePrompt;
}
