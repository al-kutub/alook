import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for the keyboard scroll behavior logic used by useKeyboardScroll.
 * Tests the core debounce + focus-gate + scrollIntoView logic without DOM.
 */

type ResizeHandler = () => void;

function createKeyboardScrollHandler(
  scrollIntoView: () => void,
  isFocused: boolean,
): { handler: ResizeHandler; cleanup: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const handler = () => {
    if (!isFocused) return;
    clearTimeout(timeoutId);
    timeoutId = setTimeout(scrollIntoView, 300);
  };
  const cleanup = () => clearTimeout(timeoutId);
  return { handler, cleanup };
}

describe("keyboard scroll behavior", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls scrollIntoView after 300ms delay when focused", () => {
    const scrollIntoView = vi.fn();
    const { handler } = createKeyboardScrollHandler(scrollIntoView, true);

    handler();
    expect(scrollIntoView).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("does NOT call scrollIntoView when not focused", () => {
    const scrollIntoView = vi.fn();
    const { handler } = createKeyboardScrollHandler(scrollIntoView, false);

    handler();
    vi.advanceTimersByTime(300);

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("debounces rapid resize events — only fires once after last event", () => {
    const scrollIntoView = vi.fn();
    const { handler } = createKeyboardScrollHandler(scrollIntoView, true);

    handler();
    vi.advanceTimersByTime(100);
    handler();
    vi.advanceTimersByTime(100);
    handler();
    vi.advanceTimersByTime(300);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("cleanup clears pending timeout — scroll never fires", () => {
    const scrollIntoView = vi.fn();
    const { handler, cleanup } = createKeyboardScrollHandler(
      scrollIntoView,
      true,
    );

    handler();
    vi.advanceTimersByTime(100);
    cleanup();
    vi.advanceTimersByTime(300);

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("allows multiple firings across separate debounce windows", () => {
    const scrollIntoView = vi.fn();
    const { handler } = createKeyboardScrollHandler(scrollIntoView, true);

    handler();
    vi.advanceTimersByTime(300);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    handler();
    vi.advanceTimersByTime(300);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });
});
