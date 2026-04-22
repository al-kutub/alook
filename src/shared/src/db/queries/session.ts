import { eq, and, gt } from "drizzle-orm";
import { session } from "../schema";
import type { Database } from "../index";

export async function getValidSession(db: Database, token: string) {
  const rows = await db
    .select({ userId: session.userId })
    .from(session)
    .where(
      and(
        eq(session.token, token),
        gt(session.expiresAt, new Date().toISOString())
      )
    );
  if (rows.length === 0) return null;
  return rows[0].userId;
}
