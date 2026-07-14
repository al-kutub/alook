import { NextRequest } from "next/server";
import { queries, MachineSyncRequestSchema } from "@alook/shared";
import { getDb } from "@/lib/db";
import { withEnv } from "@/lib/middleware/env";
import { writeJSON, parseBody } from "@/lib/middleware/helpers";

// Internal service-to-service route — see ../heartbeat/route.ts's doc
// comment. Wraps upsertMachineByMachineId (the ready-frame handler).
export const POST = withEnv(async (req: NextRequest, ctx) => {
  const [body, err] = await parseBody(req, MachineSyncRequestSchema);
  if (err) return err;

  const db = getDb(ctx.env.DB);
  const result = await queries.communityMachine.upsertMachineByMachineId(
    db,
    body.userId,
    body.machineId,
    body.meta,
    { markOnline: body.markOnline }
  );

  return writeJSON({ result });
});
