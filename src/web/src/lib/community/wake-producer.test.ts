import { describe, it, expect, vi, beforeEach } from "vitest"

const mockCtxWaitUntil = vi.fn((p: Promise<unknown>) => p)
const mockGetCloudflareContext = vi.fn(() => ({
  env: { DB: {}, WAKE_QUEUE: { sendBatch: mockSendBatch } },
  ctx: { waitUntil: mockCtxWaitUntil },
}))
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: (...a: unknown[]) => mockGetCloudflareContext(...(a as [])),
}))

const mockSendBatch = vi.fn(async () => { })
const mockFindWakeCandidates = vi.fn()
const mockToAgentMessage = vi.fn()
const mockWarn = vi.fn()

vi.mock("@alook/shared", async () => {
  const actual = await vi.importActual<typeof import("@alook/shared")>("@alook/shared")
  return {
    ...actual,
    createDb: vi.fn(() => ({})),
    createLogger: () => ({ info: vi.fn(), warn: (...a: unknown[]) => mockWarn(...a), error: vi.fn(), debug: vi.fn() }),
    queries: {
      communityBot: {
        findWakeCandidates: (...a: unknown[]) => mockFindWakeCandidates(...a),
      },
      communityAgentInbox: {
        toAgentMessage: (...a: unknown[]) => mockToAgentMessage(...a),
      },
    },
  }
})

import { enqueueBotWakes } from "./wake-producer"

const messageRow = {
  id: "msg_1",
  seq: 7,
  authorId: "human_1",
  content: "hello",
  createdAt: "2026-01-01T00:00:00.000Z",
  channelId: "c1",
  dmConversationId: null,
}

describe("enqueueBotWakes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendBatch.mockResolvedValue(undefined)
    mockToAgentMessage.mockResolvedValue({
      seq: "#7",
      channel: "/studio/general",
      sender: "@human",
      content: { text: "hello" },
      time: messageRow.createdAt,
    })
  })

  it("no-ops when recipients is empty — never queries or enqueues", async () => {
    await enqueueBotWakes({ recipients: [], channelId: "c1", messageRow })

    expect(mockFindWakeCandidates).not.toHaveBeenCalled()
    expect(mockSendBatch).not.toHaveBeenCalled()
  })

  it("no-ops when no candidates are behind — zero sendBatch calls, not an empty one", async () => {
    mockFindWakeCandidates.mockResolvedValue([])

    await enqueueBotWakes({ recipients: ["bot1"], channelId: "c1", messageRow })

    expect(mockSendBatch).not.toHaveBeenCalled()
  })

  it("builds a HostCommand per candidate and sends a single batch", async () => {
    mockFindWakeCandidates.mockResolvedValue([
      { botUserId: "bot1", name: "zoe", machineId: "m1", runtime: "claude" },
      { botUserId: "bot2", name: "kai", machineId: "m2", runtime: "codex" },
    ])

    await enqueueBotWakes({ recipients: ["bot1", "bot2"], channelId: "c1", messageRow })

    expect(mockFindWakeCandidates).toHaveBeenCalledWith(
      {},
      { recipients: ["bot1", "bot2"], channelId: "c1", dmConversationId: undefined, newSeq: 7 },
    )
    expect(mockSendBatch).toHaveBeenCalledTimes(1)
    const [messages] = mockSendBatch.mock.calls[0]!
    expect(messages).toHaveLength(2)
    expect(messages[0].body.botUserId).toBe("bot1")
    expect(messages[0].body.machineId).toBe("m1")
    expect(messages[0].body.command.type).toBe("agent:start")
    expect(messages[0].body.command.agentId).toBe("bot1")
    expect(messages[0].body.command.config.runtime).toBe("claude")
    expect(messages[0].body.command.wakeMessage).toEqual({
      seq: "#7",
      channel: "/studio/general",
      sender: "@human",
      content: { text: "hello" },
      time: messageRow.createdAt,
    })
    expect(messages[1].body.botUserId).toBe("bot2")
  })

  it("hydrates wakeMessage once (viewer = first candidate), not once per candidate", async () => {
    mockFindWakeCandidates.mockResolvedValue([
      { botUserId: "bot1", name: "zoe", machineId: "m1", runtime: "claude" },
      { botUserId: "bot2", name: "kai", machineId: "m2", runtime: "codex" },
      { botUserId: "bot3", name: "ivy", machineId: "m3", runtime: "gemini" },
    ])

    await enqueueBotWakes({ recipients: ["bot1", "bot2", "bot3"], channelId: "c1", messageRow })

    expect(mockToAgentMessage).toHaveBeenCalledTimes(1)
    expect(mockToAgentMessage).toHaveBeenCalledWith({}, { ...messageRow, content: "hello" }, "bot1")
  })

  it("chunks into 100-message sendBatch slices for large fanouts", async () => {
    const candidates = Array.from({ length: 250 }, (_, i) => ({
      botUserId: `bot${i}`,
      name: `bot${i}`,
      machineId: `m${i}`,
      runtime: "claude",
    }))
    mockFindWakeCandidates.mockResolvedValue(candidates)

    await enqueueBotWakes({
      recipients: candidates.map((c) => c.botUserId),
      channelId: "c1",
      messageRow,
    })

    expect(mockSendBatch).toHaveBeenCalledTimes(3)
    expect(mockSendBatch.mock.calls[0]![0]).toHaveLength(100)
    expect(mockSendBatch.mock.calls[1]![0]).toHaveLength(100)
    expect(mockSendBatch.mock.calls[2]![0]).toHaveLength(50)
  })

  it("partial chunk failure: sibling chunks still enqueue, failure is logged, call does not throw", async () => {
    const candidates = Array.from({ length: 250 }, (_, i) => ({
      botUserId: `bot${i}`,
      name: `bot${i}`,
      machineId: `m${i}`,
      runtime: "claude",
    }))
    mockFindWakeCandidates.mockResolvedValue(candidates)
    mockSendBatch
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("queue unavailable"))
      .mockResolvedValueOnce(undefined)

    await expect(
      enqueueBotWakes({ recipients: candidates.map((c) => c.botUserId), channelId: "c1", messageRow }),
    ).resolves.toBeUndefined()

    expect(mockSendBatch).toHaveBeenCalledTimes(3)
    expect(mockWarn).toHaveBeenCalledWith(
      "wake_batch_chunk_failed",
      expect.objectContaining({
        botIds: candidates.slice(100, 200).map((c) => c.botUserId),
        err: expect.stringContaining("queue unavailable"),
      }),
    )
  })

  it("registers ctx.waitUntil synchronously and does not require the caller to await", async () => {
    mockFindWakeCandidates.mockResolvedValue([
      { botUserId: "bot1", name: "zoe", machineId: "m1", runtime: "claude" },
    ])

    const promise = enqueueBotWakes({ recipients: ["bot1"], channelId: "c1", messageRow })
    expect(mockCtxWaitUntil).toHaveBeenCalledTimes(1)
    await promise
  })

  it("falls back to running standalone (no throw) when not in a CF request context", async () => {
    mockGetCloudflareContext.mockImplementationOnce(() => ({
      env: { DB: {}, WAKE_QUEUE: { sendBatch: mockSendBatch } },
      ctx: { waitUntil: () => { throw new Error("no request context") } },
    }))
    mockFindWakeCandidates.mockResolvedValue([])

    await expect(enqueueBotWakes({ recipients: ["bot1"], channelId: "c1", messageRow })).resolves.toBeUndefined()
  })
})
