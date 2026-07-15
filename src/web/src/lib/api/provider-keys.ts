// Server-side resolution of `runtime_config.provider.apiKey` for pi-builtin
// providers. The client NEVER supplies or receives the real secret — see
// RuntimeProviderConfigSchema in @alook/shared (apiKey optional on
// pi-builtin) and agentToResponse() in src/web/src/lib/api/responses.ts
// (redacts apiKey on every read). This module is the write-side
// counterpart: it fills the real key in from env right before persisting.
//
// Mirrors PI_BUILTIN_PROVIDER_ENV_KEYS in src/daemon/src/runtimeConfig.ts
// (the daemon-side consumer of the same providerId -> env var mapping at
// spawn time) — kept as a separate small map here rather than shared,
// since this one only needs to cover providers the SERVER can inject a key
// for (i.e. has its own env secret configured), while the daemon's map
// covers every pi-builtin provider a client could name.
const SERVER_INJECTABLE_PI_BUILTIN_ENV_KEYS: Record<string, string> = {
  openrouter: "OPENROUTER_API_KEY",
};

/**
 * Fill in `runtime_config.provider.apiKey` from server env when a client
 * omitted it on a pi-builtin provider. Always overwrites (not just
 * fill-when-absent) so a client that echoes back the redacted "***"
 * placeholder from a GET response never persists it as the real key.
 *
 * `custom` provider configs are left untouched — a fully custom endpoint
 * has no server-known secret to fall back to, so the caller-supplied
 * apiKey (required by the schema) is used as-is.
 *
 * Returns `error` when the provider requires a key the environment doesn't
 * have configured, so callers can fail the request loudly instead of
 * persisting an empty/broken key.
 */
export function fillRuntimeConfigProviderApiKey(
  rc: Record<string, unknown> | null,
  env: Record<string, unknown>,
): { config: Record<string, unknown> | null; error?: string } {
  if (!rc || typeof rc.provider !== "object" || rc.provider === null) {
    return { config: rc };
  }
  const provider = rc.provider as Record<string, unknown>;
  if (provider.kind !== "pi-builtin") {
    return { config: rc };
  }

  const providerId = typeof provider.providerId === "string" ? provider.providerId : "";
  const envKey = SERVER_INJECTABLE_PI_BUILTIN_ENV_KEYS[providerId];
  const realKey = envKey ? (env[envKey] as string | undefined) : undefined;

  if (!realKey) {
    return {
      config: rc,
      error: `No API key configured on the server for provider "${providerId}"`,
    };
  }

  return {
    config: { ...rc, provider: { ...provider, apiKey: realKey } },
  };
}
