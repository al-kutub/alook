import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const mockGetMember = vi.fn()
const mockGetCategory = vi.fn()
const mockUpdateCategory = vi.fn()
const mockLogAction = vi.fn()
const mockFanOut = vi.fn()

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(() => ({ env: { DB: {} } })),
}))

vi.mock("@/lib/db", () => ({ getDb: vi.fn(() => ({})) }))

vi.mock("@alook/shared", async () => {
  const actual = await vi.importActual<typeof import("@alook/shared")>("@alook/shared")
  return {
    ...actual,
    queries: {
      communityMember: { getMember: (...a: unknown[]) => mockGetMember(...a) },
      communityCategory: {
        getCategory: (...a: unknown[]) => mockGetCategory(...a),
        updateCategory: (...a: unknown[]) => mockUpdateCategory(...a),
      },
      communityAuditLog: {
        logAction: (...a: unknown[]) => mockLogAction(...a),
      },
    },
  }
})

vi.mock("@/lib/community/fanout", () => ({
  fanOutToServerMembers: (...a: unknown[]) => mockFanOut(...a),
}))

vi.mock("@/lib/middleware/auth", () => ({
  withAuth: vi.fn((handler: any) => async (req: any, ctx?: any) => {
    const params = ctx?.params instanceof Promise ? await ctx.params : ctx?.params
    return handler(req, { env: { DB: {} }, userId: "u1", email: "u@t.com", params })
  }),
}))

vi.mock("@/lib/middleware/helpers", () => {
  const { NextResponse } = require("next/server")
  return {
    writeJSON: (data: unknown, status = 200) => NextResponse.json(data, { status }),
    writeError: (message: string, status: number) =>
      NextResponse.json({ error: message }, { status }),
  }
})

import { PATCH } from "./route"

const ctx = { params: { id: "s1", catId: "cat1" } } as any

function patchReq(body: unknown) {
  return new NextRequest("http://localhost/api/community/servers/s1/categories/cat1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

describe("PATCH /api/community/servers/[id]/categories/[catId]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetMember.mockResolvedValue({ id: "mem_1", userId: "u1", role: "owner" })
    mockGetCategory.mockResolvedValue({ id: "cat1", serverId: "s1", creatorId: "u1" })
    mockFanOut.mockResolvedValue(undefined)
    mockLogAction.mockResolvedValue(undefined)
  })

  it("renames a category", async () => {
    mockUpdateCategory.mockResolvedValue({ id: "cat1", name: "General" })

    const res = await PATCH(patchReq({ name: "General" }), ctx)
    expect(res.status).toBe(200)
    expect(mockUpdateCategory).toHaveBeenCalledWith(expect.anything(), "cat1", { name: "General" })
  })

  it("returns 409 when renaming onto a name already used by another category in the server", async () => {
    mockUpdateCategory.mockRejectedValue(
      Object.assign(new Error("UNIQUE constraint failed: community_category.server_id, community_category.name"), {
        code: "SQLITE_CONSTRAINT_UNIQUE",
      }),
    )

    const res = await PATCH(patchReq({ name: "General" }), ctx)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "a category with this name already exists" })
  })

  it("rethrows non-uniqueness errors from updateCategory", async () => {
    mockUpdateCategory.mockRejectedValue(new Error("boom"))
    await expect(PATCH(patchReq({ name: "General" }), ctx)).rejects.toThrow("boom")
  })
})
