import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockMarkMachineOnlineIfOffline = vi.fn();

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(() => ({ env: { DB: {} } })),
}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn(() => ({})) }));

vi.mock("@alook/shared", async () => {
  const actual = await vi.importActual("@alook/shared");
  return {
    ...actual,
    queries: {
      communityMachine: {
        markMachineOnlineIfOffline: (...args: unknown[]) => mockMarkMachineOnlineIfOffline(...args),
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
  return new NextRequest("http://internal/api/community/machines/online", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/community/machines/online", () => {
  beforeEach(() => vi.clearAllMocks());

  it("wraps markMachineOnlineIfOffline and returns the backfilled row", async () => {
    mockMarkMachineOnlineIfOffline.mockResolvedValue({ id: "cm_1", status: "online" });

    const res = await POST(makeReq({ userId: "u1", machineId: "cm_1", credentialHash: "h" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.machine).toEqual({ id: "cm_1", status: "online" });
    expect(mockMarkMachineOnlineIfOffline).toHaveBeenCalledWith(expect.anything(), {
      userId: "u1", machineId: "cm_1", credentialHash: "h",
    });
  });

  it("returns machine: null on steady-state (already online)", async () => {
    mockMarkMachineOnlineIfOffline.mockResolvedValue(null);

    const res = await POST(makeReq({ userId: "u1", machineId: "cm_1", credentialHash: "h" }));
    const json = await res.json();
    expect(json.machine).toBeNull();
  });
});
