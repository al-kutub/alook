// Minimal Telegram Bot API client — outbound sendMessage only. No queue/retry:
// a delivery failure here must never break the underlying task/message flow,
// callers are expected to fire-and-forget with .catch(() => {}).

const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks.length > 0 ? chunks : [""];
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  for (const chunk of chunkText(text, TELEGRAM_MAX_MESSAGE_LENGTH)) {
    if (!chunk) continue;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: chunk }),
    });
  }
}
