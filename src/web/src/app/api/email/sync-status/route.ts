import { NextRequest } from "next/server";
import { queries, EmailSyncStatusRequestSchema } from "@alook/shared";
import { getDb } from "@/lib/db";
import { withEnv } from "@/lib/middleware/env";
import { writeJSON, parseBody } from "@/lib/middleware/helpers";

// Internal service-to-service route, same pattern as /api/email/notify —
// email-worker's imap-poller-do.ts calls this over its existing WEB_SERVICE
// binding instead of writing to D1 directly, so all D1 writes funnel
// through the one `web` process.
export const POST = withEnv(async (req: NextRequest, ctx) => {
  const [body, err] = await parseBody(req, EmailSyncStatusRequestSchema);
  if (err) return err;

  const db = getDb(ctx.env.DB);
  const { accountId, workspaceId, ...data } = body;
  const account = await queries.emailAccount.updateEmailAccount(db, accountId, workspaceId, data);

  return writeJSON({ account });
});
