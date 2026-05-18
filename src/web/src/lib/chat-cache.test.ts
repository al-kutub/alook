import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import type { Message } from "@alook/shared";
import {
  openCacheDB,
  getCachedMessages,
  mergeCachedMessages,
  appendCachedMessage,
  removeCachedMessage,
  getCacheMeta,
  invalidateCache,
  evictLRU,
  clearAllCache,
} from "./chat-cache";

const WORKSPACE_ID = "ws_test";

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: `msg_${Math.random().toString(36).slice(2)}`,
    conversation_id: "conv_1",
    role: "user",
    content: "hello",
    task_id: null,
    attachment_ids: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(async () => {
  await clearAllCache();
  openCacheDB(WORKSPACE_ID);
});

describe("chat-cache", () => {
  describe("openCacheDB", () => {
    it("creates DB with correct schema", async () => {
      const p = openCacheDB(WORKSPACE_ID);
      expect(p).not.toBeNull();
      const db = await p!;
      expect(db.objectStoreNames.contains("messages")).toBe(true);
      expect(db.objectStoreNames.contains("cache_meta")).toBe(true);
    });
  });

  describe("mergeCachedMessages", () => {
    it("writes messages and updates meta", async () => {
      const msgs = [
        makeMessage({ id: "m1", conversation_id: "conv_1", created_at: "2024-01-01T00:00:00Z" }),
        makeMessage({ id: "m2", conversation_id: "conv_1", created_at: "2024-01-01T00:01:00Z" }),
      ];

      await mergeCachedMessages("conv_1", msgs, false, WORKSPACE_ID);

      const cached = await getCachedMessages("conv_1", WORKSPACE_ID);
      expect(cached).toHaveLength(2);
      expect(cached![0].id).toBe("m1");
      expect(cached![1].id).toBe("m2");

      const meta = await getCacheMeta("conv_1", WORKSPACE_ID);
      expect(meta).not.toBeNull();
      expect(meta!.messageCount).toBeGreaterThanOrEqual(2);
      expect(meta!.hasMore).toBe(false);
    });

    it("merges without overwriting older messages", async () => {
      const older = [
        makeMessage({ id: "m1", conversation_id: "conv_1", created_at: "2024-01-01T00:00:00Z" }),
        makeMessage({ id: "m2", conversation_id: "conv_1", created_at: "2024-01-01T00:01:00Z" }),
      ];
      await mergeCachedMessages("conv_1", older, true, WORKSPACE_ID);

      const newer = [
        makeMessage({ id: "m3", conversation_id: "conv_1", created_at: "2024-01-01T00:02:00Z" }),
      ];
      await mergeCachedMessages("conv_1", newer, false, WORKSPACE_ID);

      const cached = await getCachedMessages("conv_1", WORKSPACE_ID);
      expect(cached).toHaveLength(3);
      expect(cached!.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    });

    it("filters out buffered messages", async () => {
      const msgs = [
        makeMessage({ id: "m1", conversation_id: "conv_1", status: "active" }),
        makeMessage({ id: "m2", conversation_id: "conv_1", status: "buffered" }),
      ];

      await mergeCachedMessages("conv_1", msgs, false, WORKSPACE_ID);

      const cached = await getCachedMessages("conv_1", WORKSPACE_ID);
      expect(cached).toHaveLength(1);
      expect(cached![0].id).toBe("m1");
    });

    it("filters out temp- messages", async () => {
      const msgs = [
        makeMessage({ id: "m1", conversation_id: "conv_1" }),
        makeMessage({ id: "temp-123", conversation_id: "conv_1" }),
      ];

      await mergeCachedMessages("conv_1", msgs, false, WORKSPACE_ID);

      const cached = await getCachedMessages("conv_1", WORKSPACE_ID);
      expect(cached).toHaveLength(1);
      expect(cached![0].id).toBe("m1");
    });
  });

  describe("getCachedMessages", () => {
    it("returns sorted messages for a conversation", async () => {
      const msgs = [
        makeMessage({ id: "m2", conversation_id: "conv_1", created_at: "2024-01-01T00:01:00Z" }),
        makeMessage({ id: "m1", conversation_id: "conv_1", created_at: "2024-01-01T00:00:00Z" }),
      ];
      await mergeCachedMessages("conv_1", msgs, false, WORKSPACE_ID);

      const cached = await getCachedMessages("conv_1", WORKSPACE_ID);
      expect(cached![0].id).toBe("m1");
      expect(cached![1].id).toBe("m2");
    });

    it("returns null for unknown conversation", async () => {
      const cached = await getCachedMessages("nonexistent", WORKSPACE_ID);
      expect(cached).toBeNull();
    });

    it("excludes buffered messages on read", async () => {
      const db = await openCacheDB(WORKSPACE_ID)!;
      await db.put("messages", makeMessage({ id: "m1", conversation_id: "conv_1", status: "buffered" }));
      await db.put("messages", makeMessage({ id: "m2", conversation_id: "conv_1", status: "active" }));
      await db.put("cache_meta", {
        conversation_id: "conv_1",
        lastFetchedAt: Date.now(),
        lastAccessedAt: Date.now(),
        messageCount: 2,
        newestMessageId: "m2",
        hasMore: false,
      });

      const cached = await getCachedMessages("conv_1", WORKSPACE_ID);
      expect(cached).toHaveLength(1);
      expect(cached![0].id).toBe("m2");
    });
  });

  describe("appendCachedMessage", () => {
    it("adds single message without overwriting existing", async () => {
      const initial = [makeMessage({ id: "m1", conversation_id: "conv_1" })];
      await mergeCachedMessages("conv_1", initial, false, WORKSPACE_ID);

      await appendCachedMessage("conv_1", makeMessage({ id: "m2", conversation_id: "conv_1" }), WORKSPACE_ID);

      const cached = await getCachedMessages("conv_1", WORKSPACE_ID);
      expect(cached).toHaveLength(2);
    });

    it("skips buffered messages", async () => {
      const initial = [makeMessage({ id: "m1", conversation_id: "conv_1" })];
      await mergeCachedMessages("conv_1", initial, false, WORKSPACE_ID);

      await appendCachedMessage("conv_1", makeMessage({ id: "m2", conversation_id: "conv_1", status: "buffered" }), WORKSPACE_ID);

      const cached = await getCachedMessages("conv_1", WORKSPACE_ID);
      expect(cached).toHaveLength(1);
    });

    it("skips temp- messages", async () => {
      const initial = [makeMessage({ id: "m1", conversation_id: "conv_1" })];
      await mergeCachedMessages("conv_1", initial, false, WORKSPACE_ID);

      await appendCachedMessage("conv_1", makeMessage({ id: "temp-abc", conversation_id: "conv_1" }), WORKSPACE_ID);

      const cached = await getCachedMessages("conv_1", WORKSPACE_ID);
      expect(cached).toHaveLength(1);
    });
  });

  describe("removeCachedMessage", () => {
    it("removes a single message by ID", async () => {
      const msgs = [
        makeMessage({ id: "m1", conversation_id: "conv_1" }),
        makeMessage({ id: "m2", conversation_id: "conv_1" }),
      ];
      await mergeCachedMessages("conv_1", msgs, false, WORKSPACE_ID);

      await removeCachedMessage("conv_1", "m1", WORKSPACE_ID);

      const cached = await getCachedMessages("conv_1", WORKSPACE_ID);
      expect(cached).toHaveLength(1);
      expect(cached![0].id).toBe("m2");
    });
  });

  describe("invalidateCache", () => {
    it("removes all data for a conversation", async () => {
      const msgs = [
        makeMessage({ id: "m1", conversation_id: "conv_1" }),
        makeMessage({ id: "m2", conversation_id: "conv_1" }),
      ];
      await mergeCachedMessages("conv_1", msgs, false, WORKSPACE_ID);

      await invalidateCache("conv_1", WORKSPACE_ID);

      const cached = await getCachedMessages("conv_1", WORKSPACE_ID);
      expect(cached).toBeNull();
      const meta = await getCacheMeta("conv_1", WORKSPACE_ID);
      expect(meta).toBeNull();
    });
  });

  describe("evictLRU", () => {
    it("keeps only the N most recently accessed conversations", async () => {
      const db = await openCacheDB(WORKSPACE_ID)!;

      // Write messages and meta directly to control lastAccessedAt precisely
      for (let i = 0; i < 5; i++) {
        await db.put("messages", makeMessage({ id: `m_${i}`, conversation_id: `conv_${i}`, created_at: `2024-01-0${i + 1}T00:00:00Z` }));
        await db.put("cache_meta", {
          conversation_id: `conv_${i}`,
          lastFetchedAt: Date.now(),
          lastAccessedAt: i * 1000,
          messageCount: 1,
          newestMessageId: `m_${i}`,
          hasMore: false,
        });
      }

      await evictLRU(3);

      // Only the 3 most recently accessed should remain (conv_2, conv_3, conv_4)
      const meta0 = await getCacheMeta("conv_0", WORKSPACE_ID);
      const meta1 = await getCacheMeta("conv_1", WORKSPACE_ID);
      const meta2 = await getCacheMeta("conv_2", WORKSPACE_ID);
      const meta3 = await getCacheMeta("conv_3", WORKSPACE_ID);
      const meta4 = await getCacheMeta("conv_4", WORKSPACE_ID);

      expect(meta0).toBeNull();
      expect(meta1).toBeNull();
      expect(meta2).not.toBeNull();
      expect(meta3).not.toBeNull();
      expect(meta4).not.toBeNull();
    });
  });

  describe("clearAllCache", () => {
    it("removes everything", async () => {
      await mergeCachedMessages(
        "conv_1",
        [makeMessage({ id: "m1", conversation_id: "conv_1" })],
        false,
        WORKSPACE_ID
      );
      await mergeCachedMessages(
        "conv_2",
        [makeMessage({ id: "m2", conversation_id: "conv_2" })],
        false,
        WORKSPACE_ID
      );

      await clearAllCache();

      const cached1 = await getCachedMessages("conv_1", WORKSPACE_ID);
      const cached2 = await getCachedMessages("conv_2", WORKSPACE_ID);
      expect(cached1).toBeNull();
      expect(cached2).toBeNull();
    });
  });
});
