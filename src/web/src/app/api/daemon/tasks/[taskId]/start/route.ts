import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getDb } from "@/lib/db"
import { withAuth } from "@/lib/middleware/auth";
import { writeJSON, writeError } from "@/lib/middleware/helpers";
import { taskToResponse } from "@/lib/api/responses";
import { TaskService } from "@/lib/services/task";

export const POST = withAuth(async (_req, ctx) => {
  if (!ctx.workspaceId) {
    return writeError("Forbidden: machine token required", 403);
  }

  const { env } = getCloudflareContext()
  const db = getDb((env as Env).DB)

  const taskId = ctx.params?.taskId;
  if (!taskId) {
    return writeError("task_id is required", 400);
  }

  const taskService = new TaskService(db);
  try {
    const task = await taskService.startTask(taskId, ctx.workspaceId);
    return writeJSON(taskToResponse(task));
  } catch (err: unknown) {
    return writeError(err instanceof Error ? err.message : "Unknown error", 400);
  }
});
