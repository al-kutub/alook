import { NextRequest } from "next/server";
import { queries, MachineOnlineRequestSchema } from "@alook/shared";
import { getDb } from "@/lib/db";
import { withEnv } from "@/lib/middleware/env";
import { writeJSON, parseBody } from "@/lib/middleware/helpers";

// Internal service-to-service route — see heartbeat/route.ts's doc comment.
export const POST = withEnv(async (req: NextRequest, ctx) => {
  const [body, err] = await parseBody(req, MachineOnlineRequestSchema);
  if (err) return err;

  const db = getDb(ctx.env.DB);
  const machine = await queries.communityMachine.markMachineOnlineIfOffline(db, {
    userId: body.userId,
    machineId: body.machineId,
    credentialHash: body.credentialHash,
  });

  return writeJSON({ machine });
});
