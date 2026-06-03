import { describe, it, expect } from "vitest";
import { shouldRenderAssistantBody } from "./message-list";

// AC4 regression guard: a send-dm reply that is ALSO the message carrying the
// live error stream must still render its own text bubble (error is additive),
// while a runtime-error message stays surfaced by the stream alone when live.
describe("shouldRenderAssistantBody", () => {
  it("renders a normal text reply that carries the error stream (the AC4 fix)", () => {
    // designated last send-dm message + an error stream attached
    expect(
      shouldRenderAssistantBody({ hasTaskStream: true, isRuntimeError: false }),
    ).toBe(true);
  });

  it("renders a normal text reply with no stream (unchanged clean case)", () => {
    expect(
      shouldRenderAssistantBody({ hasTaskStream: false, isRuntimeError: false }),
    ).toBe(true);
  });

  it("suppresses a runtime-error message's own block while the stream owns it", () => {
    // The stream surfaces the error; rendering the block too would double it.
    expect(
      shouldRenderAssistantBody({ hasTaskStream: true, isRuntimeError: true }),
    ).toBe(false);
  });

  it("renders a runtime-error message's block when no stream owns it", () => {
    expect(
      shouldRenderAssistantBody({ hasTaskStream: false, isRuntimeError: true }),
    ).toBe(true);
  });
});
