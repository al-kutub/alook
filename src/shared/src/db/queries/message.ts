import { eq, asc, desc, and, lt, or } from "drizzle-orm";
import { message } from "../schema";
import type { Database } from "../index";

export async function createMessage(
  db: Database,
  data: {
    conversationId: string;
    role: string;
    content: string;
    taskId?: string | null;
    attachmentIds?: string | null;
  }
) {
  const rows = await db
    .insert(message)
    .values({
      conversationId: data.conversationId,
      role: data.role,
      content: data.content,
      taskId: data.taskId ?? null,
      attachmentIds: data.attachmentIds ?? null,
    })
    .returning();
  return rows[0]!;
}

const DEFAULT_MESSAGE_LIMIT = 20;

export async function listMessages(
  db: Database,
  conversationId: string,
  opts?: { limit?: number; before?: string; beforeId?: string }
) {
  const limit = opts?.limit ?? DEFAULT_MESSAGE_LIMIT;
  const before = opts?.before;
  const beforeId = opts?.beforeId;

  if (before) {
    // Compound cursor: (createdAt < before) OR (createdAt == before AND id < beforeId)
    // This avoids skipping messages with identical timestamps
    const cursorCondition = beforeId
      ? or(
          lt(message.createdAt, before),
          and(eq(message.createdAt, before), lt(message.id, beforeId))
        )
      : lt(message.createdAt, before);

    return db
      .select()
      .from(message)
      .where(
        and(
          eq(message.conversationId, conversationId),
          cursorCondition
        )
      )
      .orderBy(desc(message.createdAt), desc(message.id))
      .limit(limit)
      .then((rows) => rows.reverse());
  }

  // No cursor: fetch the latest N messages in ASC order
  // We query DESC to get the most recent, then reverse for chronological order
  return db
    .select()
    .from(message)
    .where(eq(message.conversationId, conversationId))
    .orderBy(desc(message.createdAt))
    .limit(limit)
    .then((rows) => rows.reverse());
}

export async function getMessage(db: Database, id: string) {
  const rows = await db.select().from(message).where(eq(message.id, id));
  return rows[0] ?? null;
}
