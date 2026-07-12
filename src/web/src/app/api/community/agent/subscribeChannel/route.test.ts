import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({ env: { DB: {} } })),
}))
vi.mock("@/lib/db", () => ({ getDb: vi.fn(() => ({})) }))

const mockFindActiveAgentRunnerKeyByBearer = vi.fn()
const mockGetUserInternal = vi.fn()
const mockGetBotBinding = vi.fn()
const mockResolveServerByNameForMember = vi.fn()
const mockResolveChannelByNameForMember = vi.fn()
const mockGetChannelForMember = vi.fn()
const mockSetChannelLevel = vi.fn()
const mockRemoveChannelOverride = vi.fn()
const mockGetDMBetween = vi.fn()
const mockGetUserByNameAndDiscriminator = vi.fn()
const mockGetMessageByChannelAndSeq = vi.fn()
const mockGetThreadChannelByParentMessage = vi.fn()

vi.mock("@alook/shared", async () => {
  const actual = await vi.importActual<typeof import("@alook/shared")>("@alook/shared")
  return {
    ...actual,
    queries: {
      ...actual.queries,
      communityMachine: { findActiveAgentRunnerKeyByBearer: (...a: unknown[]) => mockFindActiveAgentRunnerKeyByBearer(...a) },
      user: {
        ...actual.queries.user,
        getUserInternal: (...a: unknown[]) => mockGetUserInternal(...a),
        getUserByNameAndDiscriminator: (...a: unknown[]) => mockGetUserByNameAndDiscriminator(...a),
      },
      communityBot: { getBotBinding: (...a: unknown[]) => mockGetBotBinding(...a) },
      communityServer: { resolveServerByNameForMember: (...a: unknown[]) => mockResolveServerByNameForMember(...a) },
      communityChannel: {
        resolveChannelByNameForMember: (...a: unknown[]) => mockResolveChannelByNameForMember(...a),
        getChannelForMember: (...a: unknown[]) => mockGetChannelForMember(...a),
        getThreadChannelByParentMessage: (...a: unknown[]) => mockGetThreadChannelByParentMessage(...a),
      },
      communityMessage: { getMessageByChannelAndSeq: (...a: unknown[]) => mockGetMessageByChannelAndSeq(...a) },
      communityDm: { getDMBetween: (...a: unknown[]) => mockGetDMBetween(...a) },
      communityNotificationSetting: {
        setChannelLevel: (...a: unknown[]) => mockSetChannelLevel(...a),
        removeChannelOverride: (...a: unknown[]) => mockRemoveChannelOverride(...a),
      },
    },
  }
})

import { POST } from "./route"

function req(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/community/agent/subscribeChannel", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
}

describe("POST /api/community/agent/subscribeChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindActiveAgentRunnerKeyByBearer.mockResolvedValue({ userId: "owner_1", machineId: "m_1", agentId: "bot_1" })
    mockGetUserInternal.mockResolvedValue({ isBot: true, deletedAt: null })
    mockGetBotBinding.mockResolvedValue({ machineId: "m_1", runtime: "claude" })
    mockResolveServerByNameForMember.mockResolvedValue([{ id: "srv_1", name: "studio" }])
    mockResolveChannelByNameForMember.mockResolvedValue([{ id: "ch_1" }])
    mockGetChannelForMember.mockResolvedValue({ id: "ch_1", serverId: "srv_1" })
  })

  it("401 without Authorization", async () => {
    const res = await POST(req({ channel: "/studio/general", level: "mentions" }))
    expect(res.status).toBe(401)
  })

  it("400 on a payload that fails schema validation (bad level)", async () => {
    const res = await POST(req({ channel: "/studio/general", level: "nothing" }, { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(400)
    expect(mockSetChannelLevel).not.toHaveBeenCalled()
  })

  it("level:'mentions' → sets a channel-level notification setting for the bot's own userId", async () => {
    const res = await POST(req({ channel: "/studio/general", level: "mentions" }, { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(200)
    expect(mockSetChannelLevel).toHaveBeenCalledWith(expect.anything(), {
      userId: "bot_1",
      channelId: "ch_1",
      level: "mentions",
    })
    expect(mockRemoveChannelOverride).not.toHaveBeenCalled()
    expect(await res.json()).toEqual({ channel: "/studio/general", level: "mentions" })
  })

  it("level:'all' → removes any channel override instead of writing an explicit row", async () => {
    const res = await POST(req({ channel: "/studio/general", level: "all" }, { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(200)
    expect(mockRemoveChannelOverride).toHaveBeenCalledWith(expect.anything(), {
      userId: "bot_1",
      channelId: "ch_1",
    })
    expect(mockSetChannelLevel).not.toHaveBeenCalled()
    expect(await res.json()).toEqual({ channel: "/studio/general", level: "all" })
  })

  it("re-subscribing updates the existing row — same call shape both times (upsert is setChannelLevel's job)", async () => {
    await POST(req({ channel: "/studio/general", level: "mentions" }, { Authorization: "Bearer crk_abc" }))
    await POST(req({ channel: "/studio/general", level: "mentions" }, { Authorization: "Bearer crk_abc" }))
    expect(mockSetChannelLevel).toHaveBeenCalledTimes(2)
  })

  it("rejects a /.dm/... ref with a clear 400 error", async () => {
    mockGetUserByNameAndDiscriminator.mockResolvedValue({ id: "peer_1" })
    mockGetDMBetween.mockResolvedValue({ id: "dm_1" })
    const res = await POST(req({ channel: "/.dm/gustavo#4821", level: "mentions" }, { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("does not support DMs")
    expect(mockSetChannelLevel).not.toHaveBeenCalled()
  })

  it("rejects a /.dm/... ref with 400 (not 404) even when no DM conversation exists yet with that peer", async () => {
    // Regression: the DM check must run before `resolveTargetForMember`'s
    // own DM branch, which would otherwise 404 ("dm not found") here —
    // since `createDmIfMissing` is false, a never-DM'd peer has no DM row.
    mockGetDMBetween.mockResolvedValue(null)
    const res = await POST(req({ channel: "/.dm/gustavo#4821", level: "mentions" }, { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("does not support DMs")
    expect(mockGetUserByNameAndDiscriminator).not.toHaveBeenCalled()
    expect(mockSetChannelLevel).not.toHaveBeenCalled()
  })

  it("rejects when the bot isn't a member of the channel's server (requireChannelMember gate)", async () => {
    mockGetChannelForMember.mockResolvedValue(null)
    const res = await POST(req({ channel: "/studio/general", level: "mentions" }, { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(403)
    expect(mockSetChannelLevel).not.toHaveBeenCalled()
  })

  it("works against a thread's own ref (/server/channel/#N) — sets the thread's own channelId", async () => {
    mockGetMessageByChannelAndSeq.mockResolvedValue({ id: "msg_root" })
    mockGetThreadChannelByParentMessage.mockResolvedValue({ id: "thread_1" })
    mockGetChannelForMember.mockResolvedValue({ id: "thread_1", serverId: "srv_1" })

    const res = await POST(req({ channel: "/studio/general/#12", level: "mentions" }, { Authorization: "Bearer crk_abc" }))
    expect(res.status).toBe(200)
    expect(mockGetThreadChannelByParentMessage).toHaveBeenCalledWith(expect.anything(), "ch_1", "msg_root")
    expect(mockGetChannelForMember).toHaveBeenCalledWith(expect.anything(), "thread_1", "bot_1")
    expect(mockSetChannelLevel).toHaveBeenCalledWith(expect.anything(), {
      userId: "bot_1",
      channelId: "thread_1",
      level: "mentions",
    })
  })
})
