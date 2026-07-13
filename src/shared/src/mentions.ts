/**
 * @-mention wake — see Paperclip's comments-and-communication guide: mention
 * another agent by name using @AgentName in a comment/message to wake them
 * with a heartbeat-style nudge. Rules ported: match is case-insensitive and
 * exact (no fuzzy matching); a mention must not be used FOR assignment (use
 * real task creation for that — this only wakes the agent to look); each
 * resolved mention costs a run, so callers should dedupe and cap fan-out.
 */

const MENTION_TOKEN_RE = /@([A-Za-z0-9_.-]+)/g;

/** Raw candidate mention tokens found in `content` (the text after each
 * `@`), NOT yet resolved against real agent names. Deduplicated,
 * case-preserved as typed. */
export function extractMentionTokens(content: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const match of content.matchAll(MENTION_TOKEN_RE)) {
    const token = match[1];
    if (!token) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push(token);
  }
  return tokens;
}

export interface MentionableAgent {
  id: string;
  name: string;
}

/** Resolves @-mention tokens in `content` against the workspace's real
 * agent names (case-insensitive exact match — no partial/fuzzy matching,
 * matching Paperclip's documented rule). `excludeAgentId` (typically the
 * comment/message author, if they're an agent) is dropped from the result
 * so an agent can't wake itself by self-mention. */
export function resolveMentionedAgents(
  content: string,
  agents: MentionableAgent[],
  excludeAgentId?: string | null
): MentionableAgent[] {
  const tokens = extractMentionTokens(content).map((t) => t.toLowerCase());
  if (tokens.length === 0) return [];
  const tokenSet = new Set(tokens);
  return agents.filter(
    (a) => a.id !== excludeAgentId && tokenSet.has(a.name.toLowerCase())
  );
}
