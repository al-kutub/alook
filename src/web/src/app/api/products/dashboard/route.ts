import { NextRequest } from "next/server";
import { queries } from "@alook/shared";
import { getDb } from "@/lib/db";
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember } from "@/lib/middleware/workspace";
import { writeJSON, formatTimestampNullable } from "@/lib/middleware/helpers";
import { productToResponse } from "@/lib/api/responses";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const db = getDb(ctx.env.DB);
  const stats = await queries.product.getProductDashboardStats(db, ws.workspaceId);

  return writeJSON(
    stats.map((s) => ({
      ...productToResponse(s.product),
      issue_counts_by_status: s.issueCountsByStatus,
      active_agent_count: s.activeAgentCount,
      last_activity_at: formatTimestampNullable(s.lastActivityAt),
    }))
  );
});
