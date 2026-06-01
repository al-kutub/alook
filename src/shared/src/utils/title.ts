/**
 * Derive a conversation title from the first message body: collapse whitespace,
 * trim, and cap length at a word boundary when possible.
 *
 * Lifted from the user-send route so the agent-DM route can reuse the exact
 * same auto-title behaviour (both set a conversation's title on first message).
 */
export function truncateTitle(text: string, maxLen = 50): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLen) return trimmed;
  const cut = trimmed.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  const title = lastSpace > 20 ? cut.slice(0, lastSpace) : cut;
  return title + "...";
}
