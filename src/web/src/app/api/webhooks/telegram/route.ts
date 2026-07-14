import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { queries, TASK_TYPES } from "@alook/shared";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { TaskService } from "@/lib/services/task";
import { log } from "@/lib/logger";

interface TelegramUpdate {
  message?: {
    chat?: { id?: number };
    from?: { id?: number };
    text?: string;
  };
}

// Public webhook — no session/machine-token auth applies here (Telegram is
// calling us, not a signed-in alook user). Authenticated instead via the
// secret_token Telegram echoes back on every call once registered via
// setWebhook?secret_token=... — see the deploy plan for the one-time
// registration step. Always returns 200 once the secret checks out, even if
// we did nothing with the update (unrecognized sender, non-text message),
// since a non-200 makes Telegram retry the same update indefinitely.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { env } = await getCloudflareContext({ async: true });
  const cloudflareEnv = env as Env;

  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!cloudflareEnv.TELEGRAM_WEBHOOK_SECRET || secret !== cloudflareEnv.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const chatId = update.message?.chat?.id;
  const fromId = update.message?.from?.id;
  const text = update.message?.text;

  if (!chatId || !fromId || !text) {
    return NextResponse.json({ ok: true });
  }
  if (String(fromId) !== cloudflareEnv.TELEGRAM_ALLOWED_USER_ID) {
    return NextResponse.json({ ok: true });
  }

  const workspaceId = cloudflareEnv.TELEGRAM_TARGET_WORKSPACE_ID;
  const agentId = cloudflareEnv.TELEGRAM_TARGET_AGENT_ID;
  if (!workspaceId || !agentId) {
    log.error("telegram webhook: TELEGRAM_TARGET_WORKSPACE_ID/AGENT_ID not configured");
    return NextResponse.json({ ok: true });
  }

  const db = getDb(cloudflareEnv.DB);
  const chatIdStr = String(chatId);

  let link = await queries.telegramLink.getByChatId(db, chatIdStr);
  if (!link) {
    const agent = await queries.agent.getAgent(db, agentId, workspaceId);
    if (!agent || !agent.ownerId) {
      log.error("telegram webhook: target agent not found or has no owner", { agentId });
      return NextResponse.json({ ok: true });
    }
    const conversation = await queries.conversation.createConversation(db, {
      workspaceId,
      agentId,
      userId: agent.ownerId,
      title: "Telegram",
    });
    link = await queries.telegramLink.createLink(db, {
      chatId: chatIdStr,
      workspaceId,
      agentId,
      conversationId: conversation.id,
    });
  }

  const message = await queries.message.createMessage(db, {
    conversationId: link.conversationId,
    role: "user",
    content: text,
  });

  const taskService = new TaskService(db);
  try {
    const task = await taskService.enqueueTask(
      agentId,
      link.conversationId,
      workspaceId,
      text,
      TASK_TYPES.USER_DM_MESSAGE,
      {
        contextKey: link.conversationId,
        context: { message_id: message.id },
        traceId: "tr_" + nanoid(),
        parentTaskId: null,
      }
    );
    queries.message.updateMessageTaskId(db, message.id, task.id).catch(() => {});
  } catch (err) {
    log.error("telegram webhook: enqueueTask failed", { err });
  }

  return NextResponse.json({ ok: true });
}
