"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { X, Calendar, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getCalendarEvent } from "@/lib/api";
import type { CalendarEvent } from "@alook/shared";

interface CalendarEventDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendarEventId: string | null;
  workspaceId: string;
}

const MIN_WIDTH = 320;
const MAX_WIDTH_RATIO = 0.8;
const DEFAULT_WIDTH = 500;

export function CalendarEventDetailSheet({ open, onOpenChange, calendarEventId, workspaceId }: CalendarEventDetailSheetProps) {
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragging = useRef(false);
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => { onOpenChangeRef.current = onOpenChange; });

  useEffect(() => {
    if (!open || !calendarEventId) return;
    setLoading(true);
    setEvent(null);

    getCalendarEvent(calendarEventId, workspaceId)
      .then(setEvent)
      .catch(() => {
        toast.error("Calendar event not found");
        onOpenChangeRef.current(false);
      })
      .finally(() => setLoading(false));
  }, [open, calendarEventId, workspaceId]);

  const handleOpenChange = (v: boolean) => {
    onOpenChange(v);
    if (!v) {
      setTimeout(() => setEvent(null), 300);
    }
  };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const maxW = window.innerWidth * MAX_WIDTH_RATIO;
    setWidth(Math.min(maxW, Math.max(MIN_WIDTH, window.innerWidth - e.clientX)));
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        style={{ width: `min(${width}px, 100vw)`, maxWidth: "none" }}
        className="data-[side=right]:sm:inset-y-2 data-[side=right]:sm:right-2 data-[side=right]:sm:h-auto data-[side=right]:sm:rounded-xl data-[side=right]:sm:border"
      >
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="hidden sm:block absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-primary/20 active:bg-primary/30 transition-colors rounded-l-xl"
        />
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
            <SheetTitle className="truncate flex-1">
              {loading ? "Loading..." : event?.title || "Calendar Event"}
            </SheetTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        <SheetBody className="flex-1 overflow-y-auto thin-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : event ? (
            <div className="flex flex-col gap-4">
              <div className="text-sm space-y-2 border-b pb-3">
                <div className="flex gap-2">
                  <span className="text-muted-foreground shrink-0">Scheduled:</span>
                  <span>{new Date(event.scheduled_at).toLocaleString()}</span>
                </div>
                {event.repeat_interval && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground shrink-0">Repeats:</span>
                    <span>Every {event.repeat_interval}</span>
                  </div>
                )}
                {event.repeat_stop_at && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground shrink-0">Until:</span>
                    <span>{new Date(event.repeat_stop_at).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              {event.description && (
                <div className="text-sm">
                  <p className="text-muted-foreground mb-1">Description</p>
                  <pre className="whitespace-pre-wrap font-sans">{event.description}</pre>
                </div>
              )}
            </div>
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
