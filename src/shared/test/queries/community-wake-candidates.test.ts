import { describe, it, expect, vi } from "vitest";
import { findWakeCandidates } from "../../src/db/queries/community/bot";

// Terminal-where mock — the module chains
// select().from().innerJoin().leftJoin().where(), and `.where()` is the
// terminal call that resolves to rows. `findWakeCandidates` issues UP TO
// three separate `db.select(...)` calls in sequence: (1) the main
// candidate query, (2) the channel-level notification-setting lookup, (3)
// the mention lookup — (2)/(3) only fire when `channelId` is set and there
// are candidates left after the `lastReadSeq` filter. `sequences` supplies
// one result array per call, in order; a call beyond the supplied
// sequences (e.g. tests that don't expect (2)/(3) to fire) resolves to [].
// We don't re-verify the WHERE predicate itself here (that's SQL, exercised
// in e2e/integration); this covers the post-fetch filters and row shape,
// which is the part `enqueueBotWakes` actually depends on.
function createSelectMock(...sequences: unknown[][]) {
  let call = 0;
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => Promise.resolve(sequences[call++] ?? []));
  return chain;
}

describe("findWakeCandidates", () => {
  it("returns [] and never queries when recipients is empty", async () => {
    const db = createSelectMock([{ botUserId: "never", name: "x", machineId: "m", runtime: "claude", lastReadSeq: 0 }]);
    const result = await findWakeCandidates(db as never, {
      recipients: [],
      channelId: "c1",
      newSeq: 5,
      messageId: "msg_1",
    });
    expect(result).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("excludes candidates already caught up (lastReadSeq >= newSeq)", async () => {
    const db = createSelectMock([
      { botUserId: "bot1", name: "zoe", machineId: "m1", runtime: "claude", lastReadSeq: 3 },
      { botUserId: "bot2", name: "kai", machineId: "m2", runtime: "codex", lastReadSeq: 10 },
    ]);
    const result = await findWakeCandidates(db as never, {
      recipients: ["bot1", "bot2"],
      channelId: "c1",
      newSeq: 7,
      messageId: "msg_1",
    });
    expect(result).toEqual([{ botUserId: "bot1", name: "zoe", machineId: "m1", runtime: "claude" }]);
  });

  it("treats a NULL lastReadSeq (never read) as behind — included", async () => {
    const db = createSelectMock([
      { botUserId: "bot1", name: "zoe", machineId: "m1", runtime: "claude", lastReadSeq: null },
    ]);
    const result = await findWakeCandidates(db as never, {
      recipients: ["bot1"],
      channelId: "c1",
      newSeq: 1,
      messageId: "msg_1",
    });
    expect(result).toEqual([{ botUserId: "bot1", name: "zoe", machineId: "m1", runtime: "claude" }]);
  });

  it("supports dmConversationId scope", async () => {
    const db = createSelectMock([
      { botUserId: "bot1", name: "zoe", machineId: "m1", runtime: "claude", lastReadSeq: 0 },
    ]);
    const result = await findWakeCandidates(db as never, {
      recipients: ["bot1"],
      dmConversationId: "dm1",
      newSeq: 1,
      messageId: "msg_1",
    });
    expect(result).toEqual([{ botUserId: "bot1", name: "zoe", machineId: "m1", runtime: "claude" }]);
  });

  describe("mentions-level filter (channel scope only)", () => {
    it("bot with no notification-setting row for the channel → always a candidate (regression)", async () => {
      const db = createSelectMock(
        [{ botUserId: "bot1", name: "zoe", machineId: "m1", runtime: "claude", lastReadSeq: 0 }],
        [], // no notification-setting rows
        [], // no mention rows
      );
      const result = await findWakeCandidates(db as never, {
        recipients: ["bot1"],
        channelId: "c1",
        newSeq: 1,
        messageId: "msg_1",
      });
      expect(result).toEqual([{ botUserId: "bot1", name: "zoe", machineId: "m1", runtime: "claude" }]);
    });

    it("bot with channel-level 'all' explicitly set → always a candidate, mentioned or not", async () => {
      const db = createSelectMock(
        [{ botUserId: "bot1", name: "zoe", machineId: "m1", runtime: "claude", lastReadSeq: 0 }],
        [{ userId: "bot1", level: "all" }],
        [],
      );
      const result = await findWakeCandidates(db as never, {
        recipients: ["bot1"],
        channelId: "c1",
        newSeq: 1,
        messageId: "msg_1",
      });
      expect(result).toEqual([{ botUserId: "bot1", name: "zoe", machineId: "m1", runtime: "claude" }]);
    });

    it("bot with channel-level 'mentions' set, message does NOT mention the bot → excluded", async () => {
      const db = createSelectMock(
        [{ botUserId: "bot1", name: "zoe", machineId: "m1", runtime: "claude", lastReadSeq: 0 }],
        [{ userId: "bot1", level: "mentions" }],
        [], // no mention rows for this message
      );
      const result = await findWakeCandidates(db as never, {
        recipients: ["bot1"],
        channelId: "c1",
        newSeq: 1,
        messageId: "msg_1",
      });
      expect(result).toEqual([]);
    });

    it("bot with channel-level 'mentions' set, message DOES mention the bot (kind:'mention') → included", async () => {
      const db = createSelectMock(
        [{ botUserId: "bot1", name: "zoe", machineId: "m1", runtime: "claude", lastReadSeq: 0 }],
        [{ userId: "bot1", level: "mentions" }],
        [{ userId: "bot1" }],
      );
      const result = await findWakeCandidates(db as never, {
        recipients: ["bot1"],
        channelId: "c1",
        newSeq: 1,
        messageId: "msg_1",
      });
      expect(result).toEqual([{ botUserId: "bot1", name: "zoe", machineId: "m1", runtime: "claude" }]);
    });

    it("bot with channel-level 'mentions' set, message has a kind:'reply' row for the bot (not counted) → excluded", async () => {
      // The mention query itself filters on kind:"mention" — a reply-only row
      // never surfaces here, so the mock's mention-row sequence is empty.
      const db = createSelectMock(
        [{ botUserId: "bot1", name: "zoe", machineId: "m1", runtime: "claude", lastReadSeq: 0 }],
        [{ userId: "bot1", level: "mentions" }],
        [],
      );
      const result = await findWakeCandidates(db as never, {
        recipients: ["bot1"],
        channelId: "c1",
        newSeq: 1,
        messageId: "msg_1",
      });
      expect(result).toEqual([]);
    });

    it("DM-scope messages (channelId unset) → notification-level filtering is skipped entirely", async () => {
      const db = createSelectMock([
        { botUserId: "bot1", name: "zoe", machineId: "m1", runtime: "claude", lastReadSeq: 0 },
      ]);
      const result = await findWakeCandidates(db as never, {
        recipients: ["bot1"],
        dmConversationId: "dm1",
        newSeq: 1,
        messageId: "msg_1",
      });
      expect(result).toEqual([{ botUserId: "bot1", name: "zoe", machineId: "m1", runtime: "claude" }]);
      // Only the one main query ran — no notification-level/mention follow-ups.
      expect((db.select as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
    });

    it("a setting on a DIFFERENT channelId does not affect candidates for the channel actually being messaged", async () => {
      const db = createSelectMock(
        [{ botUserId: "bot1", name: "zoe", machineId: "m1", runtime: "claude", lastReadSeq: 0 }],
        // The notification-setting query is scoped to opts.channelId in its
        // WHERE clause — a mock at this layer can't re-verify that predicate,
        // so we simulate the DB correctly returning no rows for a different
        // channelId's setting.
        [],
        [],
      );
      const result = await findWakeCandidates(db as never, {
        recipients: ["bot1"],
        channelId: "c1",
        newSeq: 1,
        messageId: "msg_1",
      });
      expect(result).toEqual([{ botUserId: "bot1", name: "zoe", machineId: "m1", runtime: "claude" }]);
    });

    it("a server-level (not channel-level) 'mentions' row has no effect — bot still wakes for every message", async () => {
      // The notification-setting query only selects channel-scoped rows
      // (WHERE channelId = opts.channelId) — a server-level row never
      // surfaces here, so the mock's level-row sequence is empty.
      const db = createSelectMock(
        [{ botUserId: "bot1", name: "zoe", machineId: "m1", runtime: "claude", lastReadSeq: 0 }],
        [],
        [],
      );
      const result = await findWakeCandidates(db as never, {
        recipients: ["bot1"],
        channelId: "c1",
        newSeq: 1,
        messageId: "msg_1",
      });
      expect(result).toEqual([{ botUserId: "bot1", name: "zoe", machineId: "m1", runtime: "claude" }]);
    });
  });
});
