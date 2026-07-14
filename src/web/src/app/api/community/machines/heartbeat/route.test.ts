import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockTouchMachineHeartbeat = vi.fn();

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
        touchMachineHeartbeat: (...args: unknown[]) => mockTouchMachineHeartbeat(...args),
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
  return new NextRequest("http://internal/api/community/machines/heartbeat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/community/machines/heartbeat", () => {
  beforeEach(() => vi.clearAllMocks());

  it("wraps touchMachineHeartbeat with positional (db, userId, machineId) args", async () => {
    mockTouchMachineHeartbeat.mockResolvedValue({ lastSeenAt: "now", priorLastSeenAt: "earlier" });

    const res = await POST(makeReq({ userId: "u1", machineId: "cm_1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result).toEqual({ lastSeenAt: "now", priorLastSeenAt: "earlier" });
    expect(mockTouchMachineHeartbeat).toHaveBeenCalledWith(expect.anything(), "u1", "cm_1");
  });

  it("returns result: null when the row doesn't exist", async () => {
    mockTouchMachineHeartbeat.mockResolvedValue(null);
    const res = await POST(makeReq({ userId: "u1", machineId: "cm_1" }));
    const json = await res.json();
    expect(json.result).toBeNull();
  });
});
