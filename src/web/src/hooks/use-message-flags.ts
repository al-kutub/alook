import { useCallback, useEffect, useRef, useState } from "react";
import {
  flagMessage as apiFlagMessage,
  unflagMessage as apiUnflagMessage,
} from "@/lib/api";
import { useFlagCount } from "@/contexts/flag-count-context";

/**
 * Owns the per-message "flagged" UI state for the chat view: the set of flagged
 * message ids, an optimistic toggle handler (with rollback), and the flag-count
 * context wiring. The conversation-load effect (which stays in the component)
 * seeds the set via the returned `setFlaggedIds`.
 *
 * Extracted verbatim from agent-chat-view.tsx — same state, same effect, same
 * optimistic/rollback logic. The `flaggedIdsRef`-sync effect runs on every
 * render (no dep array), exactly as before, so it must remain the FIRST effect
 * registered by the component (call this hook before any other effect-bearing
 * hook).
 */
export function useMessageFlags(workspaceId: string) {
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const flaggedIdsRef = useRef(flaggedIds);
  useEffect(() => {
    flaggedIdsRef.current = flaggedIds;
  });

  const {
    increment: flagIncrement,
    decrement: flagDecrement,
    refresh: flagRefresh,
  } = useFlagCount();

  const handleToggleFlag = useCallback(
    async (messageId: string) => {
      const wasFlagged = flaggedIdsRef.current.has(messageId);
      setFlaggedIds((prev) => {
        const next = new Set(prev);
        if (wasFlagged) next.delete(messageId);
        else next.add(messageId);
        return next;
      });
      if (wasFlagged) {
        flagDecrement();
        apiUnflagMessage(workspaceId, messageId)
          .then(() => {
            flagRefresh();
          })
          .catch(() => {
            setFlaggedIds((prev) => new Set(prev).add(messageId));
            flagIncrement();
          });
      } else {
        flagIncrement();
        apiFlagMessage(workspaceId, messageId)
          .then(() => {
            flagRefresh();
          })
          .catch(() => {
            setFlaggedIds((prev) => {
              const next = new Set(prev);
              next.delete(messageId);
              return next;
            });
            flagDecrement();
          });
      }
    },
    [workspaceId, flagIncrement, flagDecrement, flagRefresh],
  );

  return { flaggedIds, setFlaggedIds, handleToggleFlag };
}
