import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

let mockAuthCtx: Record<string, unknown> = { userId: "u1", email: "u@t.com" };

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(() => ({ env: { DB: {} } })),
}));

const mockGetWorkspace = vi.fn();

vi.mock("@/lib/db", () => ({ getDb: vi.fn(() => ({})) }));

vi.mock("@alook/shared", () => ({
  createDb: vi.fn(() => ({})),
  queries: {
    workspace: { getWorkspace: (...args: unknown[]) => mockGetWorkspace(...args) },
  },
}));

vi.mock("@/lib/middleware/auth", () => ({
  withAuth: vi.fn((handler: any) => async (req: any, ctx?: any) => {
    const params = ctx?.params instanceof Promise ? await ctx.params : ctx?.params;
    return handler(req, { ...mockAuthCtx, params });
  }),
}));

vi.mock("@/lib/middleware/helpers", () => {
  const { NextResponse } = require("next/server");
  return {
    writeJSON: (data: unknown, status = 200) => NextResponse.json(data, { status }),
    writeError: (message: string, status: number) => NextResponse.json({ error: message }, { status }),
  };
});

vi.mock("@/lib/api/responses", () => ({
  workspaceToResponse: vi.fn((w: any) => ({ id: w.id, name: w.name, slug: w.slug })),
}));

import { GET } from "./route";

describe("GET /api/workspaces/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthCtx = { userId: "u1", email: "u@t.com" };
  });

  it("returns workspace for a member", async () => {
    mockGetWorkspace.mockResolvedValue({ id: "w1", name: "Acme", slug: "acme" });

    const req = new NextRequest("http://localhost/api/workspaces/w1");
    const res = await GET(req, { params: Promise.resolve({ id: "w1" }) } as any);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "w1", name: "Acme", slug: "acme" });
    expect(mockGetWorkspace).toHaveBeenCalledWith({}, "w1", "u1");
  });

  it("returns 404 when workspace does not exist", async () => {
    mockGetWorkspace.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/workspaces/w999");
    const res = await GET(req, { params: Promise.resolve({ id: "w999" }) } as any);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "workspace not found" });
  });

  it("returns 404 when user is not a member of the workspace", async () => {
    mockGetWorkspace.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/workspaces/w-other");
    const res = await GET(req, { params: Promise.resolve({ id: "w-other" }) } as any);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "workspace not found" });
    expect(mockGetWorkspace).toHaveBeenCalledWith({}, "w-other", "u1");
  });

  it("passes userId to query so membership is enforced in SQL", async () => {
    mockAuthCtx = { userId: "u2", email: "other@t.com" };
    mockGetWorkspace.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/workspaces/w1");
    const res = await GET(req, { params: Promise.resolve({ id: "w1" }) } as any);

    expect(res.status).toBe(404);
    expect(mockGetWorkspace).toHaveBeenCalledWith({}, "w1", "u2");
  });
});
