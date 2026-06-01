"use client";

import { useEffect, type RefObject } from "react";

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
    const vv = window.visualViewport;
    if (!vv) return;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const handleResize = () => {
      if (!isFocused) return;
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        targetRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
      }, 300);
    };
    vv.addEventListener("resize", handleResize);
    return () => {
      vv.removeEventListener("resize", handleResize);
      clearTimeout(timeoutId);
    };
  }, [targetRef, isFocused]);
}
