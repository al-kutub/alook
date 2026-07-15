import { cached, cacheKeys } from "@/lib/cache";

/**
 * Real, currently-usable model lists for the three agent providers this app
 * routes through (see PI_BUILTIN_PROVIDER_ENV_KEYS in
 * src/cli/daemon/daemon.ts and the ProviderKind picker in
 * agent-form-fields.tsx). Backs `GET /api/runtimes/provider-models`.
 */

/**
 * cursor-agent's fixed model whitelist — captured live via
 * `cursor-agent --list-models` (2026-07-15, package
 * 2026.07.09-a3815c0). This is NOT sourced from an API; cursor-agent has no
 * public model-list endpoint, so a request with any id outside this exact
 * set is rejected locally by the binary before it ever reaches a backend.
 * Re-capture with the same command if cursor-agent is upgraded and models
 * start getting rejected that used to work.
 */
export const CURSOR_MODELS: string[] = [
  "auto",
  "gpt-5.3-codex-low",
  "gpt-5.3-codex-low-fast",
  "gpt-5.3-codex",
  "gpt-5.3-codex-fast",
  "gpt-5.3-codex-high",
  "gpt-5.3-codex-high-fast",
  "gpt-5.3-codex-xhigh",
  "gpt-5.3-codex-xhigh-fast",
  "gpt-5.2",
  "gpt-5.2-codex-low",
  "gpt-5.2-codex-low-fast",
  "gpt-5.2-codex",
  "gpt-5.2-codex-fast",
  "gpt-5.2-codex-high",
  "gpt-5.2-codex-high-fast",
  "gpt-5.2-codex-xhigh",
  "gpt-5.2-codex-xhigh-fast",
  "gpt-5.1-codex-max-low",
  "gpt-5.1-codex-max-low-fast",
  "gpt-5.1-codex-max-medium",
  "gpt-5.1-codex-max-medium-fast",
  "gpt-5.1-codex-max-high",
  "gpt-5.1-codex-max-high-fast",
  "gpt-5.1-codex-max-xhigh",
  "gpt-5.1-codex-max-xhigh-fast",
  "cursor-grok-4.5-high",
  "cursor-grok-4.5-high-fast",
  "composer-2.5",
  "claude-opus-4-8-thinking-high",
  "claude-opus-4-8-thinking-high-fast",
  "gpt-5.6-sol-high",
  "gpt-5.6-sol-high-fast",
  "gpt-5.6-sol-xhigh",
  "gpt-5.6-sol-xhigh-fast",
  "gpt-5.5-high",
  "gpt-5.5-high-fast",
  "claude-fable-5-thinking-high",
  "claude-fable-5-thinking-xhigh",
  "claude-opus-4-7-thinking-high",
  "claude-opus-4-7-thinking-high-fast",
  "gpt-5.4-high",
  "gpt-5.4-high-fast",
  "cursor-grok-4.5-low",
  "cursor-grok-4.5-low-fast",
  "cursor-grok-4.5-medium",
  "cursor-grok-4.5-medium-fast",
  "composer-2.5-fast",
  "claude-opus-4-8-low",
  "claude-opus-4-8-low-fast",
  "claude-opus-4-8-medium",
  "claude-opus-4-8-medium-fast",
  "claude-opus-4-8-high",
  "claude-opus-4-8-high-fast",
  "claude-opus-4-8-xhigh",
  "claude-opus-4-8-xhigh-fast",
  "claude-opus-4-8-max",
  "claude-opus-4-8-max-fast",
  "claude-opus-4-8-thinking-low",
  "claude-opus-4-8-thinking-low-fast",
  "claude-opus-4-8-thinking-medium",
  "claude-opus-4-8-thinking-medium-fast",
  "claude-opus-4-8-thinking-xhigh",
  "claude-opus-4-8-thinking-xhigh-fast",
  "claude-opus-4-8-thinking-max",
  "claude-opus-4-8-thinking-max-fast",
  "gpt-5.6-sol-none",
  "gpt-5.6-sol-none-fast",
  "gpt-5.6-sol-low",
  "gpt-5.6-sol-low-fast",
  "gpt-5.6-sol-medium",
  "gpt-5.6-sol-medium-fast",
  "gpt-5.6-sol-max",
  "gpt-5.6-sol-max-fast",
  "gpt-5.5-none",
  "gpt-5.5-none-fast",
  "gpt-5.5-low",
  "gpt-5.5-low-fast",
  "gpt-5.5-medium",
  "gpt-5.5-medium-fast",
  "gpt-5.5-extra-high",
  "gpt-5.5-extra-high-fast",
  "claude-fable-5-low",
  "claude-fable-5-medium",
  "claude-fable-5-high",
  "claude-fable-5-xhigh",
  "claude-fable-5-max",
  "claude-fable-5-thinking-low",
  "claude-fable-5-thinking-medium",
  "claude-fable-5-thinking-max",
  "claude-sonnet-5-low",
  "claude-sonnet-5-medium",
  "claude-sonnet-5-high",
  "claude-sonnet-5-xhigh",
  "claude-sonnet-5-max",
  "claude-sonnet-5-thinking-low",
  "claude-sonnet-5-thinking-medium",
  "claude-sonnet-5-thinking-high",
  "claude-sonnet-5-thinking-xhigh",
  "claude-sonnet-5-thinking-max",
  "gpt-5.6-terra-none",
  "gpt-5.6-terra-none-fast",
  "gpt-5.6-terra-low",
  "gpt-5.6-terra-low-fast",
  "gpt-5.6-terra-medium",
  "gpt-5.6-terra-medium-fast",
  "gpt-5.6-terra-high",
  "gpt-5.6-terra-high-fast",
  "gpt-5.6-terra-xhigh",
  "gpt-5.6-terra-xhigh-fast",
  "gpt-5.6-terra-max",
  "gpt-5.6-terra-max-fast",
  "claude-4.6-sonnet-medium",
  "claude-4.6-sonnet-medium-thinking",
  "claude-opus-4-7-low",
  "claude-opus-4-7-low-fast",
  "claude-opus-4-7-medium",
  "claude-opus-4-7-medium-fast",
  "claude-opus-4-7-high",
  "claude-opus-4-7-high-fast",
  "claude-opus-4-7-xhigh",
  "claude-opus-4-7-xhigh-fast",
  "claude-opus-4-7-max",
  "claude-opus-4-7-max-fast",
  "claude-opus-4-7-thinking-low",
  "claude-opus-4-7-thinking-low-fast",
  "claude-opus-4-7-thinking-medium",
  "claude-opus-4-7-thinking-medium-fast",
  "claude-opus-4-7-thinking-xhigh",
  "claude-opus-4-7-thinking-xhigh-fast",
  "claude-opus-4-7-thinking-max",
  "claude-opus-4-7-thinking-max-fast",
  "gpt-5.4-low",
  "gpt-5.4-medium",
  "gpt-5.4-medium-fast",
  "gpt-5.4-xhigh",
  "gpt-5.4-xhigh-fast",
  "claude-4.6-opus-high",
  "claude-4.6-opus-max",
  "claude-4.6-opus-high-thinking",
  "claude-4.6-opus-max-thinking",
  "claude-4.5-opus-high",
  "claude-4.5-opus-high-thinking",
  "gpt-5.2-low",
  "gpt-5.2-low-fast",
  "gpt-5.2-fast",
  "gpt-5.2-high",
  "gpt-5.2-high-fast",
  "gpt-5.2-xhigh",
  "gpt-5.2-xhigh-fast",
  "gpt-5.6-luna-none",
  "gpt-5.6-luna-none-fast",
  "gpt-5.6-luna-low",
  "gpt-5.6-luna-low-fast",
  "gpt-5.6-luna-medium",
  "gpt-5.6-luna-medium-fast",
  "gpt-5.6-luna-high",
  "gpt-5.6-luna-high-fast",
  "gpt-5.6-luna-xhigh",
  "gpt-5.6-luna-xhigh-fast",
  "gpt-5.6-luna-max",
  "gpt-5.6-luna-max-fast",
  "gemini-3.1-pro",
  "gpt-5.4-mini-none",
  "gpt-5.4-mini-low",
  "gpt-5.4-mini-medium",
  "gpt-5.4-mini-high",
  "gpt-5.4-mini-xhigh",
  "gpt-5.4-nano-none",
  "gpt-5.4-nano-low",
  "gpt-5.4-nano-medium",
  "gpt-5.4-nano-high",
  "gpt-5.4-nano-xhigh",
  "claude-4.5-sonnet",
  "claude-4.5-sonnet-thinking",
  "gpt-5.1-low",
  "gpt-5.1",
  "gpt-5.1-high",
  "gemini-3-flash",
  "gemini-3.5-flash",
  "gpt-5.1-codex-mini-low",
  "gpt-5.1-codex-mini",
  "gpt-5.1-codex-mini-high",
  "claude-4-sonnet",
  "claude-4-sonnet-thinking",
  "gpt-5-mini",
  "kimi-k2.7-code",
  "glm-5.2-high",
  "glm-5.2-max",
];

/**
 * Curated Cloudflare Workers AI text-generation model ids (`@cf/...`).
 * Cloudflare exposes a live catalog at
 * `GET /accounts/{account_id}/ai/models/search`, but that call needs
 * CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_KEY, neither of which is configured
 * on this Railway service yet (see PI_BUILTIN_PROVIDER_ENV_KEYS in
 * daemon.ts). Shipping a static list now so the picker isn't empty; swap
 * this for a live `cached()` fetch once the account is provisioned.
 */
export const CLOUDFLARE_WORKERS_AI_MODELS: string[] = [
  "@cf/zai-org/glm-5.2",
  "@cf/meta/llama-4.2-70b-instruct",
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/qwen/qwen3-coder-32b-instruct",
  "@cf/qwen/qwq-32b",
  "@cf/mistralai/mistral-small-3.2-24b-instruct",
  "@cf/deepseek-ai/deepseek-r2",
  "@cf/google/gemma-3-27b-it",
  "@cf/openai/gpt-oss-120b",
  "@cf/openai/gpt-oss-20b",
];

interface OpenRouterModel {
  id: string;
  name?: string;
  pricing?: { prompt?: string; completion?: string };
}

const OPENROUTER_CACHE_TTL_SECONDS = 6 * 60 * 60; // 6h — matches "write rarely, read a lot" KV usage per lib/cache.ts
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OPENROUTER_MODEL_LIMIT = 200; // cap the datalist to something a browser (and a human) can actually use

function isFreeOpenRouterModel(m: OpenRouterModel): boolean {
  if (m.id.endsWith(":free")) return true;
  const prompt = m.pricing?.prompt;
  const completion = m.pricing?.completion;
  return prompt === "0" && completion === "0";
}

/**
 * Fetches OpenRouter's public, unauthenticated model catalog, caches it in
 * KV (see lib/cache.ts — read-heavy/write-rarely is exactly what that
 * module is for), and returns ids pre-prefixed with `openrouter/` — the
 * literal string the daemon's pi-builtin routing requires (a bare
 * `google/gemma-...` silently misroutes to opencode's native Google
 * provider instead of OpenRouter; see resolvePiBuiltinRouting in
 * src/cli/daemon/daemon.ts). Free models are sorted first.
 */
export async function getOpenRouterModels(): Promise<string[]> {
  return cached(cacheKeys.providerModels("openrouter"), OPENROUTER_CACHE_TTL_SECONDS, async () => {
    const res = await fetch(OPENROUTER_MODELS_URL, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`OpenRouter models fetch failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { data?: OpenRouterModel[] };
    const models = body.data ?? [];

    const free = models.filter(isFreeOpenRouterModel);
    const paid = models.filter((m) => !isFreeOpenRouterModel(m));
    const sortById = (a: OpenRouterModel, b: OpenRouterModel) => a.id.localeCompare(b.id);
    free.sort(sortById);
    paid.sort(sortById);

    return [...free, ...paid].slice(0, OPENROUTER_MODEL_LIMIT).map((m) => `openrouter/${m.id}`);
  });
}

/**
 * Returns ids pre-prefixed with `cloudflare-workers-ai/` — same reason as
 * `openrouter/` above: a bare `@cf/...` id is resolved by opencode against
 * its default provider search instead of the specific Cloudflare provider,
 * and gets rejected with "Model not found" (confirmed live).
 */
export function getCloudflareWorkersAiModels(): string[] {
  return CLOUDFLARE_WORKERS_AI_MODELS.map((id) => `cloudflare-workers-ai/${id}`);
}

export function getCursorModels(): string[] {
  return CURSOR_MODELS;
}
