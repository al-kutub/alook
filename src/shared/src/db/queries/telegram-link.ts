import { eq } from "drizzle-orm";
import { telegramLink } from "../schema";
import type { Database } from "../index";

export async function getByChatId(db: Database, chatId: string) {
  const rows = await db.select().from(telegramLink).where(eq(telegramLink.chatId, chatId));
  return rows[0] ?? null;
}

export async function getByConversationId(db: Database, conversationId: string) {
  const rows = await db
    .select()
    .from(telegramLink)
    .where(eq(telegramLink.conversationId, conversationId));
  return rows[0] ?? null;
}

export async function createLink(
  db: Database,
  data: { chatId: string; workspaceId: string; agentId: string; conversationId: string }
) {
  const rows = await db
    .insert(telegramLink)
    .values({
      chatId: data.chatId,
      workspaceId: data.workspaceId,
      agentId: data.agentId,
      conversationId: data.conversationId,
    })
    .returning();
  return rows[0]!;
}
