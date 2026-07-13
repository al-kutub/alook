import { queries } from "@alook/shared";
import { getDb } from "@/lib/db";
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember } from "@/lib/middleware/workspace";
import { writeJSON } from "@/lib/middleware/helpers";

// Flat org-chart list — every agent with id/name/reportsTo/status. The
// caller builds a tree from this if it needs one; kept flat server-side
// so a data-integrity issue (shouldn't happen given updateAgent's cycle
// guard) can't produce an infinite/broken tree response.
export const GET = withAuth(async (req, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const db = getDb(ctx.env.DB);
  const chart = await queries.agent.getOrgChart(db, ws.workspaceId);
  return writeJSON(chart.map((n) => ({
    id: n.id,
    name: n.name,
    reports_to: n.reportsTo,
    status: n.status,
  })));
});
