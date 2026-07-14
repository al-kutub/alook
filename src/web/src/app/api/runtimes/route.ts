import { NextRequest } from "next/server"
import { queries } from "@alook/shared"
import { getDb, withD1Retry } from "@/lib/db"
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember, withWorkspaceOwner } from "@/lib/middleware/workspace";
import { writeJSON, writeError } from "@/lib/middleware/helpers";
import { runtimeToResponse } from "@/lib/api/responses";

export const GET = withAuth(async (req, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const db = getDb(ctx.env.DB)

  const runtimes = await withD1Retry(() => queries.runtime.listAgentRuntimes(db, ws.workspaceId, ctx.userId));

  return writeJSON(runtimes.map(runtimeToResponse));
});

// Prunes stale runtime records left behind by prior daemon identities (e.g.
// pre-ALOOK_DAEMON_ID-pin redeploys, each of which minted a new random
// daemon_id and orphaned the old one as a permanently-offline row). Any
// agent still pointing at a pruned runtime gets runtimeId cleared, not left
// dangling — see deleteRuntimesByDaemonId()'s doc comment.
export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  const owner = await withWorkspaceOwner(req, ctx);
  if (owner instanceof Response) return owner;

  const daemonId = req.nextUrl.searchParams.get("daemon_id");
  if (!daemonId) return writeError("daemon_id query param is required", 400);

  const db = getDb(ctx.env.DB);
  await queries.runtime.deleteRuntimesByDaemonId(db, daemonId, owner.workspaceId);

  return new Response(null, { status: 204 });
});
