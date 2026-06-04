import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { trackEvent } from "./analytics"

describe("trackEvent", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { dataLayer: undefined })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("initializes dataLayer if it does not exist", () => {
    trackEvent("test_event")
    expect(window.dataLayer).toEqual([{ event: "test_event" }])
  })

  it("appends to existing dataLayer", () => {
    window.dataLayer = [{ event: "existing" }]
    trackEvent("new_event")
    expect(window.dataLayer).toHaveLength(2)
    expect(window.dataLayer[1]).toEqual({ event: "new_event" })
  })

  it("includes params in the pushed object", () => {
    trackEvent("sign_up", { method: "github" })
    expect(window.dataLayer).toEqual([{ event: "sign_up", method: "github" }])
  })

  it("works without params", () => {
    trackEvent("page_view")
    expect(window.dataLayer).toEqual([{ event: "page_view" }])
  })

  it("does not throw when window is undefined", () => {
    vi.stubGlobal("window", undefined)
    expect(() => trackEvent("test")).not.toThrow()
  })
})
