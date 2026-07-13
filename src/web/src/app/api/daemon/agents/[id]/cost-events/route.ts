import { NextRequest } from "next/server";
import { queries, CreateCostEventRequestSchema } from "@alook/shared";
import { getDb } from "@/lib/db";
import { withAuth } from "@/lib/middleware/auth";
import { writeJSON, writeError, parseBody } from "@/lib/middleware/helpers";

/**
 * Best-effort cost/usage ingestion. Any adapter/backend that can determine
 * real token/cost data for a run reports it here (see the reference design
 * this ports from Paperclip). Most of this codebase's backends don't surface
 * usage today — see CursorBackend — so provider/model/tokens/cost are all
 * optional; a bare `{}` body still records a row (honest "a task ran" signal
 * for that agent/month).
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (!ctx.workspaceId) {
    return writeError("Forbidden: machine token required", 403);
  }

  const id = ctx.params?.id;
  if (!id) {
    return writeError("agent id is required", 400);
  }

  const db = getDb(ctx.env.DB);

  const agent = await queries.agent.getAgent(db, id, ctx.workspaceId);
  if (!agent) {
    return writeError("agent not found", 404);
  }

  const [body, err] = await parseBody(req, CreateCostEventRequestSchema);
  if (err) return err;

  const event = await queries.costEvent.createCostEvent(db, {
    workspaceId: ctx.workspaceId,
    agentId: id,
    taskId: body.task_id ?? null,
    provider: body.provider ?? null,
    model: body.model ?? null,
    inputTokens: body.input_tokens ?? null,
    outputTokens: body.output_tokens ?? null,
    costCents: body.cost_cents ?? null,
  });

  return writeJSON(
    {
      id: event.id,
      agent_id: event.agentId,
      task_id: event.taskId,
      provider: event.provider,
      model: event.model,
      input_tokens: event.inputTokens,
      output_tokens: event.outputTokens,
      cost_cents: event.costCents,
      created_at: event.createdAt,
    },
    201
  );
});
