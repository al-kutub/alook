import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createKeyboardScrollController,
  attachKeyboardScroll,
} from "../use-keyboard-scroll";

describe("createKeyboardScrollController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls scrollIntoView after 300ms delay when focused", () => {
    const scrollIntoView = vi.fn();
    const target = { scrollIntoView } as unknown as HTMLElement;
    const { handler } = createKeyboardScrollController(() => target, true);

    handler();
    expect(scrollIntoView).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "end",
      behavior: "smooth",
    });
  });

  it("does NOT call scrollIntoView when not focused", () => {
    const scrollIntoView = vi.fn();
    const target = { scrollIntoView } as unknown as HTMLElement;
    const { handler } = createKeyboardScrollController(() => target, false);

    handler();
    vi.advanceTimersByTime(300);

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("debounces rapid resize events — only fires once after last event", () => {
    const scrollIntoView = vi.fn();
    const target = { scrollIntoView } as unknown as HTMLElement;
    const { handler } = createKeyboardScrollController(() => target, true);

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
    const target = { scrollIntoView } as unknown as HTMLElement;
    const { handler, cleanup } = createKeyboardScrollController(
      () => target,
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
    const target = { scrollIntoView } as unknown as HTMLElement;
    const { handler } = createKeyboardScrollController(() => target, true);

    handler();
    vi.advanceTimersByTime(300);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    handler();
    vi.advanceTimersByTime(300);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it("no-ops gracefully when target is null", () => {
    const { handler } = createKeyboardScrollController(() => null, true);
    handler();
    vi.advanceTimersByTime(300);
  });
});

describe("attachKeyboardScroll", () => {
  let listeners: Map<string, EventListener>;
  let mockVisualViewport: {
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    listeners = new Map();
    mockVisualViewport = {
      addEventListener: vi.fn((event: string, handler: EventListener) => {
        listeners.set(event, handler);
      }),
      removeEventListener: vi.fn((event: string) => {
        listeners.delete(event);
      }),
    };
    Object.defineProperty(globalThis, "window", {
      value: { visualViewport: mockVisualViewport },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(globalThis, "window", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  it("registers a resize listener and returns a detach function", () => {
    const scrollIntoView = vi.fn();
    const target = { scrollIntoView } as unknown as HTMLElement;
    const detach = attachKeyboardScroll(() => target, true);

    expect(detach).toBeTypeOf("function");
    expect(mockVisualViewport.addEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    );
  });

  it("detach removes listener and clears timeout", () => {
    const scrollIntoView = vi.fn();
    const target = { scrollIntoView } as unknown as HTMLElement;
    const detach = attachKeyboardScroll(() => target, true)!;

    const handler = listeners.get("resize")!;
    handler(new Event("resize"));
    detach();

    expect(mockVisualViewport.removeEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    );
    vi.advanceTimersByTime(300);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls into view on resize when focused", () => {
    const scrollIntoView = vi.fn();
    const target = { scrollIntoView } as unknown as HTMLElement;
    attachKeyboardScroll(() => target, true);

    const handler = listeners.get("resize")!;
    handler(new Event("resize"));
    vi.advanceTimersByTime(300);

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "end",
      behavior: "smooth",
    });
  });

  it("does not scroll when not focused", () => {
    const scrollIntoView = vi.fn();
    const target = { scrollIntoView } as unknown as HTMLElement;
    attachKeyboardScroll(() => target, false);

    const handler = listeners.get("resize")!;
    handler(new Event("resize"));
    vi.advanceTimersByTime(300);

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("returns null when visualViewport is unavailable", () => {
    Object.defineProperty(globalThis, "window", {
      value: { visualViewport: undefined },
      writable: true,
      configurable: true,
    });
    const detach = attachKeyboardScroll(() => null, true);
    expect(detach).toBeNull();
  });
});
