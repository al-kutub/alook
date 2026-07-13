import { NextRequest } from "next/server";
import { ExecutionDecisionRequestSchema } from "@alook/shared";
import { getDb } from "@/lib/db";
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember } from "@/lib/middleware/workspace";
import { writeJSON, writeError, parseBody } from "@/lib/middleware/helpers";
import { taskToResponse } from "@/lib/api/responses";
import { TaskService } from "@/lib/services/task";

// Record a review/approval decision on the task's current execution-policy
// stage. Only the current participant (the assigned reviewer/approver) may
// act — anyone else gets 403. Both outcomes require a non-empty `body`.
//
// Two callers are supported: a machine token acting on behalf of an agent
// (must pass `actor_agent_id`, mirroring the daemon's task endpoints), or a
// signed-in user acting as themselves (their session identity is the actor).
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const db = getDb(ctx.env.DB);

  const taskId = ctx.params?.id;
  if (!taskId) {
    return writeError("task id is required", 400);
  }

  const [body, err] = await parseBody(req, ExecutionDecisionRequestSchema);
  if (err) return err;

  const isMachineActor = !!ctx.workspaceId;
  if (isMachineActor && !body.actor_agent_id) {
    return writeError("actor_agent_id is required for machine-token callers", 400);
  }
  const actor = isMachineActor
    ? { agentId: body.actor_agent_id ?? null, userId: null }
    : { agentId: null, userId: ctx.userId };

  const taskService = new TaskService(db);
  try {
    const task = await taskService.recordExecutionDecision(
      taskId,
      ws.workspaceId,
      actor,
      body.outcome,
      body.body,
    );
    return writeJSON(taskToResponse(task));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (message.startsWith("forbidden")) return writeError(message, 403);
    if (message.includes("not found")) return writeError(message, 404);
    return writeError(message, 400);
  }
});
