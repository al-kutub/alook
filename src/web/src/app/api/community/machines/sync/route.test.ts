import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockUpsertMachineByMachineId = vi.fn();

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
        upsertMachineByMachineId: (...args: unknown[]) => mockUpsertMachineByMachineId(...args),
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
  return new NextRequest("http://internal/api/community/machines/sync", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/community/machines/sync", () => {
  beforeEach(() => vi.clearAllMocks());

  it("wraps upsertMachineByMachineId with positional (db, userId, machineId, meta, opts) args", async () => {
    mockUpsertMachineByMachineId.mockResolvedValue({
      machine: { id: "cm_1", hostname: "host" },
      priorLastSeenAt: null,
      priorAvailableRuntimes: [],
      priorStatus: "offline",
    });

    const res = await POST(makeReq({
      userId: "u1",
      machineId: "cm_1",
      meta: { hostname: "host", platform: "darwin", availableRuntimes: [{ id: "claude" }] },
      markOnline: true,
    }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.result.machine).toEqual({ id: "cm_1", hostname: "host" });
    expect(json.result.priorStatus).toBe("offline");

    const [, userId, machineId, meta, opts] = mockUpsertMachineByMachineId.mock.calls[0]!;
    expect(userId).toBe("u1");
    expect(machineId).toBe("cm_1");
    expect(meta).toMatchObject({ hostname: "host", platform: "darwin" });
    expect(opts).toEqual({ markOnline: true });
  });

  it("returns result: null when the row was deleted mid-race", async () => {
    mockUpsertMachineByMachineId.mockResolvedValue(null);

    const res = await POST(makeReq({ userId: "u1", machineId: "cm_1", meta: {} }));
    const json = await res.json();
    expect(json.result).toBeNull();
  });
});
