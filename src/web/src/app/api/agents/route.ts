import { NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createDb, queries, isValidHandle, isOnline } from "@alook/shared"
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember } from "@/lib/middleware/workspace";
import { writeJSON, writeError } from "@/lib/middleware/helpers";
import { agentToResponse } from "@/lib/api/responses";
import { TaskService } from "@/lib/services/task";
import { sweepStaleState } from "@/lib/services/sweep";

export const GET = withAuth(async (req, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const { env } = getCloudflareContext()
  const db = createDb((env as Env).DB)

  // Sweep stale state: catches stuck tasks even when all daemons are dead
  await sweepStaleState(db, ws.workspaceId);

  const agents = await queries.agent.listAgents(db, ws.workspaceId);
  return writeJSON(agents.map(agentToResponse));
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const { env } = getCloudflareContext()
  const db = createDb((env as Env).DB)

  let body: {
    name?: string;
    description?: string;
    instructions?: string;
    avatar_url?: string | null;
    runtime_id?: string;
    runtime_config?: unknown;
    max_concurrent_tasks?: number;
    email_handle?: string;
  };
  try {
    body = await req.json();
  } catch {
    return writeError("invalid request body", 400);
  }

  const name = (body.name || "").trim();
  if (!name) {
    return writeError("name is required", 400);
  }

  const runtimeId = body.runtime_id || "";
  if (!runtimeId) {
    return writeError("runtime_id is required", 400);
  }

  let maxConcurrentTasks = body.max_concurrent_tasks || 0;
  if (maxConcurrentTasks <= 0) maxConcurrentTasks = 6;

  const emailHandle = typeof body.email_handle === "string" ? body.email_handle.trim().toLowerCase() : "";
  if (emailHandle) {
    if (!isValidHandle(emailHandle)) {
      return writeError("email_handle must be 4+ alphanumeric/dash characters", 400);
    }
    const existing = await queries.agent.getAgentByHandle(db, emailHandle);
    if (existing) {
      return writeError("Handle already taken", 409);
    }
  }

  const runtime = await queries.runtime.getAgentRuntimeForWorkspace(
    db,
    runtimeId,
    ws.workspaceId
  );
  if (!runtime) {
    return writeError("runtime not found in workspace", 404);
  }

  let sanitizedRc: Record<string, unknown> | null = null;
  if (typeof body.runtime_config === "object" && body.runtime_config !== null && !Array.isArray(body.runtime_config)) {
    const rc = body.runtime_config as Record<string, unknown>;
    sanitizedRc = {};
    if (typeof rc.model === "string" && rc.model.length <= 100) {
      sanitizedRc.model = rc.model;
    }
  }

  let avatarUrl: string | null = null;
  if (typeof body.avatar_url === "string") {
    if (body.avatar_url.length > 2000) {
      return writeError("avatar_url too long", 400);
    }
    avatarUrl = body.avatar_url;
  }

  const newAgent = await queries.agent.createAgent(db, {
    workspaceId: ws.workspaceId,
    name,
    description: body.description || "",
    instructions: body.instructions || "",
    avatarUrl,
    runtimeId,
    runtimeMode: runtime.runtimeMode,
    runtimeConfig: sanitizedRc,
    visibility: "private",
    maxConcurrentTasks,
    ownerId: ctx.userId,
    emailHandle: emailHandle || null,
  });

  if (emailHandle && ctx.email) {
    await queries.whitelist.addWhitelist(db, newAgent.id, ws.workspaceId, ctx.email.toLowerCase());
  }

  if (isOnline(runtime.machineLastSeenAt)) {
    const taskService = new TaskService(db);
    await taskService.reconcileAgentStatus(newAgent.id, ws.workspaceId);
    const updated = await queries.agent.getAgent(
      db,
      newAgent.id,
      ws.workspaceId
    );
    if (updated) return writeJSON(agentToResponse(updated), 201);
  }

  return writeJSON(agentToResponse(newAgent), 201);
});
