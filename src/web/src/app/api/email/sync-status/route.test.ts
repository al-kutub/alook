import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockUpdateEmailAccount = vi.fn();

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(() => ({ env: { DB: {} } })),
}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn(() => ({})) }));

vi.mock("@alook/shared", async () => {
  const actual = await vi.importActual("@alook/shared");
  return {
    ...actual,
    queries: {
      emailAccount: {
        updateEmailAccount: (...args: unknown[]) => mockUpdateEmailAccount(...args),
      },
    },
  };
});

vi.mock("@/lib/middleware/helpers", async () => {
  const { NextResponse } = require("next/server");
  const actual = await vi.importActual("@/lib/middleware/helpers");
  return {
    ...actual,
    writeJSON: (data: unknown, status = 200) => NextResponse.json(data, { status }),
    writeError: (msg: string, status: number) => NextResponse.json({ error: msg }, { status }),
  };
});

import { POST } from "./route";

function makeReq(body: unknown) {
  return new NextRequest("http://internal/api/email/sync-status", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/email/sync-status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("wraps updateEmailAccount, stripping accountId/workspaceId out of the data payload", async () => {
    mockUpdateEmailAccount.mockResolvedValue({ id: "aea_1", status: "active" });

    const res = await POST(makeReq({
      accountId: "aea_1",
      workspaceId: "ws_1",
      status: "active",
      lastSyncedAt: "2026-07-14T00:00:00Z",
      lastSyncedUid: "102",
      errorMessage: "",
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.account).toEqual({ id: "aea_1", status: "active" });

    expect(mockUpdateEmailAccount).toHaveBeenCalledWith(expect.anything(), "aea_1", "ws_1", {
      status: "active",
      lastSyncedAt: "2026-07-14T00:00:00Z",
      lastSyncedUid: "102",
      errorMessage: "",
    });
  });

  it("400s when accountId/workspaceId are missing", async () => {
    const res = await POST(makeReq({ status: "error" }));
    expect(res.status).toBe(400);
    expect(mockUpdateEmailAccount).not.toHaveBeenCalled();
  });
});
