import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetTask = vi.fn();
const mockGetAgent = vi.fn();
const mockSetExecutionPolicy = vi.fn();
const mockTaskToResponse = vi.fn((t: any) => ({
  id: t.id,
  agent_id: t.agentId,
  workspace_id: t.workspaceId,
  status: t.status,
  prompt: t.prompt,
}));

vi.mock("@/lib/middleware/helpers", async () => {
  return await vi.importActual<typeof import("@/lib/middleware/helpers")>(
    "@/lib/middleware/helpers"
  );
});
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(() => ({ env: { DB: {} } })),
}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn(() => ({})) }));

vi.mock("@alook/shared", async () => {
  const real = await vi.importActual<typeof import("@alook/shared")>("@alook/shared");
  return {
    ...real,
    createDb: vi.fn(() => ({})),
    queries: {
      task: {
        getTask: (...args: any[]) => mockGetTask(...args),
      },
      agent: {
        getAgent: (...args: any[]) => mockGetAgent(...args),
      },
    },
  };
});
vi.mock("@/lib/middleware/auth", () => ({
  withAuth: vi.fn((handler: any) => async (req: any, ctx?: any) => {
    const params = ctx?.params instanceof Promise ? await ctx.params : ctx?.params;
    return handler(req, { env: {}, userId: "u1", email: "u@t.com", params });
  }),
}));
vi.mock("@/lib/middleware/workspace", () => ({
  withWorkspaceMember: vi.fn(async () => ({ workspaceId: "w1" })),
}));
vi.mock("@/lib/api/responses", () => ({
  taskToResponse: (...args: any[]) => mockTaskToResponse(...args),
}));
vi.mock("@/lib/services/task", () => {
  const MockTaskService = function (this: any) {
    this.setExecutionPolicy = (...a: any[]) => mockSetExecutionPolicy(...a);
  } as any;
  return { TaskService: MockTaskService };
});

import { GET, PATCH } from "./route";

describe("GET /api/tasks/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns task", async () => {
    const task = {
      id: "t1",
      agentId: "a1",
      workspaceId: "w1",
      status: "completed",
      prompt: "hello",
    };
    mockGetTask.mockResolvedValue(task);
    mockGetAgent.mockResolvedValue({ id: "a1" });

    const res = await GET(
      new NextRequest("http://localhost/api/tasks/t1"),
      { params: Promise.resolve({ id: "t1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      id: "t1",
      agent_id: "a1",
      workspace_id: "w1",
      status: "completed",
      prompt: "hello",
    });
    expect(mockGetTask).toHaveBeenCalledWith({}, "t1", "w1");
  });

  it("returns 404 when not found (scoped by workspace)", async () => {
    mockGetTask.mockResolvedValue(null);

    const res = await GET(
      new NextRequest("http://localhost/api/tasks/t1"),
      { params: Promise.resolve({ id: "t1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("not found");
  });
});

const patchReq = (body: Record<string, unknown>) =>
  new NextRequest("http://localhost/api/tasks/t1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("PATCH /api/tasks/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets execution_policy and returns the updated task", async () => {
    const task = { id: "t1", agentId: "a1", workspaceId: "w1", status: "queued", prompt: "hello" };
    mockGetTask.mockResolvedValue(task);
    mockGetAgent.mockResolvedValue({ id: "a1" });
    mockSetExecutionPolicy.mockResolvedValue({ ...task, executionPolicy: { mode: "normal", stages: [] } });

    const res = await PATCH(
      patchReq({ execution_policy: { mode: "normal", stages: [{ id: "s1", type: "review", participants: [{ type: "agent", agentId: "a2" }] }] } }),
      { params: Promise.resolve({ id: "t1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockSetExecutionPolicy).toHaveBeenCalledWith(
      "t1",
      "w1",
      { mode: "normal", stages: [{ id: "s1", type: "review", participants: [{ type: "agent", agentId: "a2" }] }] },
    );
  });

  it("clears execution_policy when null is passed", async () => {
    const task = { id: "t1", agentId: "a1", workspaceId: "w1", status: "queued", prompt: "hello" };
    mockGetTask.mockResolvedValue(task);
    mockGetAgent.mockResolvedValue({ id: "a1" });
    mockSetExecutionPolicy.mockResolvedValue({ ...task, executionPolicy: null });

    const res = await PATCH(
      patchReq({ execution_policy: null }),
      { params: Promise.resolve({ id: "t1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockSetExecutionPolicy).toHaveBeenCalledWith("t1", "w1", null);
  });

  it("returns 404 when task not found", async () => {
    mockGetTask.mockResolvedValue(null);

    const res = await PATCH(
      patchReq({ execution_policy: null }),
      { params: Promise.resolve({ id: "t1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("not found");
  });

  it("returns 400 when the service rejects the update", async () => {
    const task = { id: "t1", agentId: "a1", workspaceId: "w1", status: "completed", prompt: "hello" };
    mockGetTask.mockResolvedValue(task);
    mockGetAgent.mockResolvedValue({ id: "a1" });
    mockSetExecutionPolicy.mockRejectedValue(new Error("cannot set execution policy: task is in 'completed' status"));

    const res = await PATCH(
      patchReq({ execution_policy: null }),
      { params: Promise.resolve({ id: "t1" }) }
    );

    expect(res.status).toBe(400);
  });
});
