import { NextRequest } from "next/server";

const mockEnv: Record<string, unknown> = { DB: {} };

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(() => ({ env: mockEnv })),
}));

vi.mock("@/lib/middleware/auth", () => ({
  withAuth: vi.fn((handler: any) => async (req: any, ctx?: any) => {
    const params = ctx?.params instanceof Promise ? await ctx.params : ctx?.params;
    return handler(req, { env: mockEnv, userId: "u1", email: "u@t.com", params });
  }),
}));

import { GET } from "./route";

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("GET /api/runtimes/provider-models", () => {
  it("returns the fixed cursor whitelist for 'default'", async () => {
    const req = new NextRequest("http://localhost/api/runtimes/provider-models?provider=default");
    const res = await GET(req, {});
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.provider).toBe("default");
    expect(Array.isArray(body.models)).toBe(true);
    expect(body.models.length).toBeGreaterThan(100);
    expect(body.models).toContain("auto");
  });

  it("returns the same cursor whitelist when no provider is given", async () => {
    const req = new NextRequest("http://localhost/api/runtimes/provider-models");
    const res = await GET(req, {});
    const body = await res.json();

    expect(body.provider).toBe("default");
    expect(body.models).toContain("auto");
  });

  it("returns a curated static list for cloudflare-workers-ai", async () => {
    const req = new NextRequest("http://localhost/api/runtimes/provider-models?provider=cloudflare-workers-ai");
    const res = await GET(req, {});
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.provider).toBe("cloudflare-workers-ai");
    expect(body.models.length).toBeGreaterThan(0);
    expect(body.models.every((m: string) => m.startsWith("@cf/"))).toBe(true);
  });

  it("fetches OpenRouter's public catalog, prefixes ids, and sorts free models first", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "openai/gpt-4o", pricing: { prompt: "0.000005", completion: "0.000015" } },
          { id: "google/gemma-4-31b-it:free", pricing: { prompt: "0", completion: "0" } },
          { id: "anthropic/claude-3-haiku", pricing: { prompt: "0.00000025", completion: "0.00000125" } },
        ],
      }),
    }) as unknown as typeof fetch;

    const req = new NextRequest("http://localhost/api/runtimes/provider-models?provider=openrouter");
    const res = await GET(req, {});
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.provider).toBe("openrouter");
    expect(body.models[0]).toBe("openrouter/google/gemma-4-31b-it:free");
    expect(body.models).toContain("openrouter/anthropic/claude-3-haiku");
    expect(body.models).toContain("openrouter/openai/gpt-4o");
    expect(body.models.every((m: string) => m.startsWith("openrouter/"))).toBe(true);
  });

  it("returns an empty list (not an error) when the OpenRouter fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;

    const req = new NextRequest("http://localhost/api/runtimes/provider-models?provider=openrouter");
    const res = await GET(req, {});
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.models).toEqual([]);
  });
});
