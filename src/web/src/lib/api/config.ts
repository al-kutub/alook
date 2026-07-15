import { apiFetch } from "./client";

export const fetchModelOptions = () =>
  apiFetch<Record<string, string[]>>("/api/config/model-options");

/** Real, currently-usable model ids for a given ProviderKind ("default" | "openrouter" | "cloudflare-workers-ai"). */
export const fetchProviderModels = (provider: string) =>
  apiFetch<{ provider: string; models: string[] }>(
    `/api/runtimes/provider-models?provider=${encodeURIComponent(provider)}`
  ).then((r) => r.models);

export const getMinCliVersion = () =>
  apiFetch<{ min_cli_version: string | null }>("/api/config/min-version");

export const fetchLatestCliVersion = () =>
  apiFetch<{ version: string; package: string }>("/api/cli/latest-version");
