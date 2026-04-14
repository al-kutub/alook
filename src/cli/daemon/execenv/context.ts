import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import type { Task } from "../types.js";

const INSTRUCTION_FILES = {
  claude: "CLAUDE.md",
  opencode: "AGENTS.md",
  codex: "AGENTS.md",
} as const;

export function buildInstructionContent(task: Task): string {
  let content = `# Alook Agent Instructions

## System
SYSPROMPT TODO FOR ALOOK`;

  if (task.agent?.instructions) {
    content += `

## Agent Instructions
${task.agent.instructions}`;
  }

  content += `

## Context Timeline

Your conversation history is stored in \`.context_timeline/YYYY-MM-DD.jsonl\` (today's date).
Each line is a JSON object with these fields:

- \`task_id\` — unique task identifier
- \`session_id\` — agent session identifier (null until completion)
- \`pid\` — daemon process ID (present while running, null when done)
- \`status\` — "running", "completed", or "failed"
- \`datetime\` — when the task started (local timezone)
- \`type\` — always "user_dm_message"
- \`prompt\` — what the user asked
- \`steps\` — assistant text outputs during execution
- \`response\` — final response (null if running or failed)
- \`errmsg\` — error message (null unless status is "failed")

When you start a new task, read the last ~20 lines of today's file to understand
what has been asked and done recently. You may also check yesterday's file if
today's is empty or very short.`;

  return content;
}

export function writeInstructionFile(
  workDir: string,
  task: Task,
  provider: string,
): void {
  const fileName = INSTRUCTION_FILES[provider as keyof typeof INSTRUCTION_FILES];
  if (!fileName) return;

  const content = buildInstructionContent(task);
  writeFileSync(join(workDir, fileName), content, "utf-8");
}

export function cleanStaleProviderFiles(
  workDir: string,
  provider: string,
): void {
  if (!(provider in INSTRUCTION_FILES)) return;

  try {
    if (provider === "claude") {
      unlinkSync(join(workDir, "AGENTS.md"));
    } else {
      unlinkSync(join(workDir, "CLAUDE.md"));
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
  }
}
