import type { Task, Attachment } from "./types.js";

export function buildPrompt(task: Task, attachments?: Attachment[]): string {
  const obj: Record<string, unknown> = { type: task.type, instruction: task.prompt };
  if (attachments && attachments.length > 0) {
    obj.attachments = attachments.map((a) => ({
      path: a.path,
      content_type: a.content_type,
      filename: a.filename,
    }));
  }
  return JSON.stringify(obj);
}
