"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { listAgentThreads, type ThreadListItem } from "@/lib/api";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { WsMessage } from "@alook/shared";
import { useAgentContext } from "@/contexts/agent-context";

interface TimelineRailProps {
  agentId: string;
  workspaceId: string;
  activeThreadMessageId: string | null;
  onThreadClick: (parentMessageId: string, threadConvId: string) => void;
}

export function TimelineRail({
  agentId,
  workspaceId,
  activeThreadMessageId,
  onThreadClick,
}: TimelineRailProps) {
  const { subscribeWs } = useAgentContext();
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const storageKey = `alook:timeline-rail:${workspaceId}:${agentId}`;
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(storageKey) === "collapsed";
  });

  useEffect(() => {
    if (collapsed) localStorage.setItem(storageKey, "collapsed");
    else localStorage.removeItem(storageKey);
  }, [collapsed, storageKey]);

  const fetchThreads = useCallback(() => {
    listAgentThreads(agentId, workspaceId, { limit: 30 })
      .then((data) => setThreads(data.threads))
      .catch(() => {});
  }, [agentId, workspaceId]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  useEffect(() => {
    return subscribeWs((msg: WsMessage) => {
      if (msg.type === "thread.created" || msg.type === "thread.reply") {
        fetchThreads();
      }
    });
  }, [subscribeWs, fetchThreads]);

  const showTickSet = useMemo(() => {
    const set = new Set<number>();
    let prev = "";
    for (let i = 0; i < threads.length; i++) {
      const dateKey = new Date(threads[i].last_reply_at ?? threads[i].created_at).toDateString();
      if (i > 0 && dateKey !== prev) set.add(i);
      prev = dateKey;
    }
    return set;
  }, [threads]);

  if (threads.length === 0) return null;

  return (
    <div className="w-11 shrink-0 flex flex-col items-center py-4">
      {/* Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          "size-7 rounded-lg flex items-center justify-center cursor-pointer border-none bg-transparent mb-3 shrink-0 transition-all",
          collapsed ? "text-muted-foreground" : "text-foreground opacity-80",
          "hover:opacity-100 hover:bg-accent"
        )}
      >
        <MessageSquare className="size-4" />
      </button>

      {collapsed ? null : (
        <div className="flex flex-col items-center overflow-y-auto flex-1 thin-scrollbar">
          {threads.map((t, i) => {
            const showTick = showTickSet.has(i);
            const isActive = t.parent_message_id === activeThreadMessageId;

            return (
              <React.Fragment key={t.id}>
                {showTick && (
                  <div className="w-4 h-px bg-muted-foreground/20 my-2 rounded-full shrink-0" />
                )}
                <Tooltip>
                  <TooltipTrigger
                    onClick={() => onThreadClick(t.parent_message_id, t.id)}
                    className="size-7 flex items-center justify-center cursor-pointer my-0.5 shrink-0"
                  >
                    <div
                      className={cn(
                        "size-2.5 rounded-full transition-all",
                        isActive
                          ? "bg-foreground shadow-[0_0_0_3px_oklch(0.93_0.006_80/18%)]"
                          : "bg-muted-foreground opacity-25 hover:opacity-50 hover:scale-[1.15]"
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-50">
                    <p className="text-xs font-medium line-clamp-2">{t.thread_title || "Thread"}</p>
                  </TooltipContent>
                </Tooltip>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
