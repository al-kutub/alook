import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const mockTrackEvent = vi.fn()

vi.mock("@/lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}))

let effectCallbacks: Array<() => void> = []
vi.mock("react", () => ({
  useEffect: (fn: () => void) => { effectCallbacks.push(fn) },
}))

import { SignupTracker } from "./signup-tracker"

describe("SignupTracker", () => {
  const originalDocument = globalThis.document

  beforeEach(() => {
    vi.clearAllMocks()
    effectCallbacks = []
    // @ts-expect-error - minimal stub
    globalThis.document = { cookie: "" }
  })

  afterEach(() => {
    globalThis.document = originalDocument
  })

  function runTracker() {
    SignupTracker()
    effectCallbacks.forEach((fn) => fn())
  }

  it("fires sign_up event when is_new_signup cookie exists", () => {
    // @ts-expect-error - stub
    globalThis.document = { cookie: "is_new_signup=github" }
    runTracker()
    expect(mockTrackEvent).toHaveBeenCalledWith("sign_up", { method: "github" })
  })

  it("fires sign_up with email_otp method", () => {
    // @ts-expect-error - stub
    globalThis.document = { cookie: "is_new_signup=email_otp" }
    runTracker()
    expect(mockTrackEvent).toHaveBeenCalledWith("sign_up", { method: "email_otp" })
  })

  it("does not fire when cookie is absent", () => {
    // @ts-expect-error - stub
    globalThis.document = { cookie: "" }
    runTracker()
    expect(mockTrackEvent).not.toHaveBeenCalled()
  })

  it("deletes the cookie after firing", () => {
    let cookieValue = "is_new_signup=google"
    Object.defineProperty(globalThis, "document", {
      value: {
        get cookie() { return cookieValue },
        set cookie(val: string) { cookieValue = val },
      },
      writable: true,
      configurable: true,
    })
    runTracker()
    expect(mockTrackEvent).toHaveBeenCalledWith("sign_up", { method: "google" })
    expect(cookieValue).toContain("max-age=0")
  })

  it("handles cookie with other cookies present", () => {
    // @ts-expect-error - stub
    globalThis.document = { cookie: "session=abc123; is_new_signup=email_otp; theme=dark" }
    runTracker()
    expect(mockTrackEvent).toHaveBeenCalledWith("sign_up", { method: "email_otp" })
  })
})
