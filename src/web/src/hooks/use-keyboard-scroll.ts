"use client";

import { useEffect, type RefObject } from "react";

export interface KeyboardScrollController {
  handler: () => void;
  cleanup: () => void;
}

/**
 * Creates a resize handler that debounces scrollIntoView calls.
 * Exported for testability — the hook wraps this with lifecycle management.
 */
export function createKeyboardScrollController(
  getTarget: () => HTMLElement | null,
  isFocused: boolean,
): KeyboardScrollController {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const handler = () => {
    if (!isFocused) return;
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      getTarget()?.scrollIntoView({ block: "end", behavior: "smooth" });
    }, 300);
  };
  const cleanup = () => clearTimeout(timeoutId);
  return { handler, cleanup };
}

/**
 * Subscribes to visualViewport resize events and returns a cleanup function.
 * Returns null if visualViewport is unavailable (SSR or unsupported browser).
 * Exported for testability without React rendering.
 */
export function attachKeyboardScroll(
  getTarget: () => HTMLElement | null,
  isFocused: boolean,
): (() => void) | null {
  const vv =
    typeof window !== "undefined" ? window.visualViewport : undefined;
  if (!vv) return null;
  const { handler, cleanup } = createKeyboardScrollController(
    getTarget,
    isFocused,
  );
  vv.addEventListener("resize", handler);
  return () => {
    vv.removeEventListener("resize", handler);
    cleanup();
  };
}

/**
 * On iOS Safari, the virtual keyboard can push the focused input off-screen
 * because the layout viewport doesn't always resize in sync with the visual
 * viewport. This hook listens to `window.visualViewport` resize events and
 * scrolls the target element into view after a short delay.
 *
 * No-op when `visualViewport` is unavailable or the editor isn't focused.
 */
export function useKeyboardScroll(
  targetRef: RefObject<HTMLElement | null>,
  isFocused: boolean,
) {
  useEffect(() => {
    const detach = attachKeyboardScroll(() => targetRef.current, isFocused);
    return detach ?? undefined;
  }, [targetRef, isFocused]);
}
