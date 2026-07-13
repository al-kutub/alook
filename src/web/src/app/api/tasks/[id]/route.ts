import { queries, SetExecutionPolicyRequestSchema } from "@alook/shared"
import { getDb } from "@/lib/db"
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember } from "@/lib/middleware/workspace";
import { writeJSON, writeError, parseBody } from "@/lib/middleware/helpers";
import { taskToResponse } from "@/lib/api/responses";
import { TaskService } from "@/lib/services/task";

export const GET = withAuth(async (req, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const db = getDb(ctx.env.DB)

  const id = ctx.params?.id;
  if (!id) {
    return writeError("task id is required", 400);
  }

  const task = await queries.task.getTask(db, id, ws.workspaceId);
  if (!task) {
    return writeError("not found", 404);
  }

  const agent = await queries.agent.getAgent(db, task.agentId, ws.workspaceId, ctx.userId);
  if (!agent) {
    return writeError("not found", 404);
  }

  return writeJSON(taskToResponse(task));
});

// Set (or clear, with `execution_policy: null`) the review/approval policy
// on a task. Only valid before the task enters review — stages with no
// eligible participant are dropped, and the policy is nulled entirely if
// none remain (see TaskService.sanitizeExecutionPolicy).
export const PATCH = withAuth(async (req, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const db = getDb(ctx.env.DB)

  const id = ctx.params?.id;
  if (!id) {
    return writeError("task id is required", 400);
  }

  const task = await queries.task.getTask(db, id, ws.workspaceId);
  if (!task) {
    return writeError("not found", 404);
  }

  const agent = await queries.agent.getAgent(db, task.agentId, ws.workspaceId, ctx.userId);
  if (!agent) {
    return writeError("not found", 404);
  }

  const [body, err] = await parseBody(req, SetExecutionPolicyRequestSchema);
  if (err) return err;

  const taskService = new TaskService(db);
  try {
    const updated = await taskService.setExecutionPolicy(id, ws.workspaceId, body.execution_policy);
    return writeJSON(taskToResponse(updated));
  } catch (e: unknown) {
    return writeError(e instanceof Error ? e.message : "Unknown error", 400);
  }
});
