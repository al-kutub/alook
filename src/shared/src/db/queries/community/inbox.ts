import { and, eq, isNotNull, isNull } from "drizzle-orm";
import {
  communityChannel,
  communityReadState,
  communityServer,
  communityServerMember,
} from "../../community-schema";
import type { Database } from "../../index";

export interface UnreadChannelRow {
  channelId: string;
  channelName: string;
  serverId: string;
  serverName: string;
  lastMessageAt: string;
  lastReadAt: string | null;
}

/**
 * Two-branch unread predicate, shared by every reader that groups channels
 * by "unread since I last looked."
 *
 * - Archived / no lastMessageAt → not unread.
 * - Has read-state row → `lastMessageAt > lastReadAt` (normal path; strict
 *   `>` mirrors the "author's own send is not unread" invariant from
 *   `createMessage`, which writes lastMessageAt === lastReadAt in the same
 *   batch).
 * - No read-state row → `lastMessageAt > joinedAt`. Users who joined a
 *   server AFTER historical messages were posted must not have those old
 *   messages flagged as unread. Without this, every non-empty channel
 *   lights up on first join.
 *
 * Pure — exported for direct unit testing.
 */
export function isChannelUnread(row: {
  archived: boolean;
  lastMessageAt: string | null;
  lastReadAt: string | null;
  joinedAt: string;
}): boolean {
  if (row.archived) return false;
  if (!row.lastMessageAt) return false;
  if (row.lastReadAt) return row.lastMessageAt > row.lastReadAt;
  return row.lastMessageAt > row.joinedAt;
}

// ──────────────────────────────────────────────────────────────────────────────
// Unreads
// ──────────────────────────────────────────────────────────────────────────────

export async function listUnreadChannels(
  db: Database,
  userId: string
): Promise<UnreadChannelRow[]> {
  // All top-level channels in servers the user is a member of, plus read state.
  // Filtering happens in JS via `isChannelUnread` so we can keep one query.
  const rows = await db
    .select({
      channelId: communityChannel.id,
      channelName: communityChannel.name,
      serverId: communityChannel.serverId,
      serverName: communityServer.name,
      lastMessageAt: communityChannel.lastMessageAt,
      lastReadAt: communityReadState.lastReadAt,
      archived: communityChannel.archived,
      // Sidebar / inbox unread badges must ignore messages posted before
      // the viewer joined — otherwise every non-empty channel lights up
      // on first join. `joinedAt` is `notNull()` in the schema and the
      // INNER JOIN below scopes to real member rows, so it's always
      // present. See `isChannelUnread` above.
      joinedAt: communityServerMember.joinedAt,
    })
    .from(communityServerMember)
    .innerJoin(
      communityChannel,
      eq(communityChannel.serverId, communityServerMember.serverId)
    )
    .innerJoin(communityServer, eq(communityServer.id, communityChannel.serverId))
    .leftJoin(
      communityReadState,
      and(
        eq(communityReadState.channelId, communityChannel.id),
        eq(communityReadState.userId, userId)
      )
    )
    .where(
      and(
        eq(communityServerMember.userId, userId),
        isNull(communityChannel.parentChannelId),
        isNotNull(communityChannel.lastMessageAt)
      )
    );

  return rows
    .filter((r) =>
      isChannelUnread({
        archived: r.archived,
        lastMessageAt: r.lastMessageAt,
        lastReadAt: r.lastReadAt,
        joinedAt: r.joinedAt,
      })
    )
    .map((r) => ({
      channelId: r.channelId,
      channelName: r.channelName,
      serverId: r.serverId,
      serverName: r.serverName,
      lastMessageAt: r.lastMessageAt!,
      lastReadAt: r.lastReadAt,
    }));
}
