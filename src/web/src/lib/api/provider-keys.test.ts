import { describe, it, expect } from "vitest";
import { fillRuntimeConfigProviderApiKey } from "./provider-keys";

const FAKE_ENV = { OPENROUTER_API_KEY: "sk-or-test-fake-value" };

describe("fillRuntimeConfigProviderApiKey", () => {
  it("passes through null config unchanged", () => {
    expect(fillRuntimeConfigProviderApiKey(null, FAKE_ENV)).toEqual({ config: null });
  });

  it("passes through a config with no provider unchanged", () => {
    const rc = { model: "sonnet" };
    expect(fillRuntimeConfigProviderApiKey(rc, FAKE_ENV)).toEqual({ config: rc });
  });

  it("leaves a default provider untouched", () => {
    const rc = { provider: { kind: "default" } };
    expect(fillRuntimeConfigProviderApiKey(rc, FAKE_ENV)).toEqual({ config: rc });
  });

  it("leaves a custom provider's caller-supplied apiKey as-is", () => {
    const rc = { provider: { kind: "custom", apiUrl: "https://example.com", apiKey: "user-supplied" } };
    const result = fillRuntimeConfigProviderApiKey(rc, FAKE_ENV);
    expect((result.config?.provider as { apiKey: string }).apiKey).toBe("user-supplied");
  });

  it("fills in the real key for pi-builtin/openrouter from env when omitted", () => {
    const rc = { model: "google/gemma-4-31b-it:free", provider: { kind: "pi-builtin", providerId: "openrouter" } };
    const result = fillRuntimeConfigProviderApiKey(rc, FAKE_ENV);
    expect(result.error).toBeUndefined();
    expect((result.config?.provider as { apiKey: string }).apiKey).toBe(FAKE_ENV.OPENROUTER_API_KEY);
  });

  it("overwrites a client-supplied apiKey for pi-builtin/openrouter with the real env value (never trusts client input)", () => {
    const rc = { provider: { kind: "pi-builtin", providerId: "openrouter", apiKey: "***" } };
    const result = fillRuntimeConfigProviderApiKey(rc, FAKE_ENV);
    expect((result.config?.provider as { apiKey: string }).apiKey).toBe(FAKE_ENV.OPENROUTER_API_KEY);
  });

  it("returns an error when no server key is configured for pi-builtin/openrouter", () => {
    const rc = { provider: { kind: "pi-builtin", providerId: "openrouter" } };
    const result = fillRuntimeConfigProviderApiKey(rc, {});
    expect(result.error).toMatch(/openrouter/i);
  });

  it("returns an error for an unsupported pi-builtin providerId", () => {
    const rc = { provider: { kind: "pi-builtin", providerId: "some-unknown-provider" } };
    const result = fillRuntimeConfigProviderApiKey(rc, FAKE_ENV);
    expect(result.error).toMatch(/some-unknown-provider/);
  });
});
