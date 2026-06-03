"use client";

import { cn } from "@/lib/utils";

/**
 * Social presence line above the composer. Two states only:
 *   this conversation has a live task (dispatched / queued / running)
 *     → "{Name} is typing…" + dots
 *   otherwise → nothing
 *
 * No "on something" / busy-elsewhere copy (dropped per Gus). Crossfades on
 * change and gates the typing-dot animation behind prefers-reduced-motion.
 */

type Presence = "typing" | "idle";

function derivePresence(taskStatus: string | null | undefined): Presence {
  if (
    taskStatus === "running" ||
    taskStatus === "queued" ||
    taskStatus === "dispatched"
  ) {
    return "typing";
  }
  return "idle";
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      <span className="size-1 rounded-full bg-muted-foreground/60 motion-safe:animate-[typing-dot_1.2s_ease-in-out_infinite]" />
      <span className="size-1 rounded-full bg-muted-foreground/60 motion-safe:animate-[typing-dot_1.2s_ease-in-out_0.2s_infinite]" />
      <span className="size-1 rounded-full bg-muted-foreground/60 motion-safe:animate-[typing-dot_1.2s_ease-in-out_0.4s_infinite]" />
    </span>
  );
}

export function PresenceLine({
  agentFirstName,
  taskStatus,
}: {
  agentFirstName: string;
  taskStatus: string | null | undefined;
}) {
  const presence = derivePresence(taskStatus);

  // Reserve a fixed-height row so the composer never shifts as presence changes.
  // mb gives the line breathing room above the composer (it sat too close).
  return (
    <div className="h-5 px-1 mb-2 flex items-center" aria-live="polite">
      <span
        key={presence}
        className={cn(
          "inline-flex items-center gap-1.5 text-sm text-muted-foreground",
          presence !== "idle" && "motion-safe:animate-[fade-up_200ms_ease-out_both]",
        )}
      >
        {presence === "typing" && (
          <>
            <span>{agentFirstName} is typing</span>
            <TypingDots />
          </>
        )}
      </span>
    </div>
  );
}
