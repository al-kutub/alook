import { NextRequest } from "next/server";
import { queries, MachineHeartbeatRequestSchema } from "@alook/shared";
import { getDb } from "@/lib/db";
import { withEnv } from "@/lib/middleware/env";
import { writeJSON, parseBody } from "@/lib/middleware/helpers";

// Internal service-to-service route — called by ws-do over the WEB_SERVICE
// binding instead of ws-do opening its own D1 connection, so all D1 writes
// for this app funnel through the one `web` process. Mirrors the existing
// /api/email/notify pattern (withEnv, no session/token — trusted via the
// Cloudflare service binding, not the public internet).
export const POST = withEnv(async (req: NextRequest, ctx) => {
  const [body, err] = await parseBody(req, MachineHeartbeatRequestSchema);
  if (err) return err;

  const db = getDb(ctx.env.DB);
  const result = await queries.communityMachine.touchMachineHeartbeat(db, body.userId, body.machineId);

  return writeJSON({ result });
});
