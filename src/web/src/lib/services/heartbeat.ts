import type { Database } from "@alook/shared";
import { queries, TASK_TYPES } from "@alook/shared";
import { log } from "@/lib/logger";
import { TaskService } from "./task";

/**
 * If an agent has a "running" task that's had message activity within this
 * window, it's actively mid-turn — don't fire a heartbeat on top of it this
 * cycle. This is the closest analogue we have (no run-id/checkout primitive)
 * to Paperclip's "never contend with another run for the same task" rule.
 */
const RECENTLY_ACTIVE_THRESHOLD_MS = 5 * 60 * 1000;

type OutstandingTask = Awaited<ReturnType<typeof queries.task.getOutstandingTasksForHeartbeat>>[number];

function msAgo(iso: string): number {
  return Date.now() - new Date(iso).getTime();
}

function formatAge(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

function buildHeartbeatPrompt(outstanding: OutstandingTask[]): string {
  if (outstanding.length === 0) {
    return (
      "Heartbeat check-in. You have no outstanding tasks right now. Proactively check whether " +
      "the company/product has unfinished follow-through — e.g. a shipped feature nobody verified, " +
      "a PR nobody merged, a message nobody replied to — and take concrete action on anything you " +
      "find. If there's genuinely nothing that needs attention, no need to reply."
    );
  }

  const lines = outstanding.map((t) => {
    const age = formatAge(msAgo(t.lastActivityAt));
    return `- [${t.status}, quiet for ${age}] ${t.prompt.slice(0, 200)}`;
  });

  return [
    "Heartbeat check-in. Your outstanding work:",
    ...lines,
    "",
    "For each item above: take concrete next action right now if you can, or clearly report what's " +
      "blocking it. Don't just restate the plan — actually move something forward, or leave a clear " +
      "status note so the next check-in can pick up cleanly.",
  ].join("\n");
}

/**
 * Finds every agent in the workspace whose heartbeat is due and wakes it
 * with a prompt built from its actual outstanding work. Called from
 * sweepStaleState, sharing its 30s throttle — the real firing cadence is
 * controlled per-agent by heartbeatIntervalSeconds, not by how often this
 * runs.
 */
export async function dispatchDueHeartbeats(db: Database, workspaceId: string) {
  const dueAgents = await queries.agent.getAgentsDueForHeartbeat(db, workspaceId);
  if (dueAgents.length === 0) return;

  const taskService = new TaskService(db);

  for (const agent of dueAgents) {
    if (!agent.runtimeId || !agent.ownerId) {
      // Nothing sensible to dispatch to (no runtime) or nowhere to post the
      // update (no owner/DM target) — mark fired so we don't re-check every
      // 30s forever.
      await queries.agent.updateAgentHeartbeatFired(db, agent.id, workspaceId, new Date().toISOString());
      continue;
    }

    try {
      const outstanding = await queries.task.getOutstandingTasksForHeartbeat(db, agent.id, workspaceId);

      const busyWithRecentActivity = outstanding.some(
        (t) => t.status === "running" && msAgo(t.lastActivityAt) < RECENTLY_ACTIVE_THRESHOLD_MS
      );
      if (busyWithRecentActivity) {
        // Agent is actively working — don't interrupt/compete with itself.
        // Leave lastHeartbeatAt untouched so it's retried next sweep cycle.
        continue;
      }

      const prompt = buildHeartbeatPrompt(outstanding);
      const conversation = await queries.conversation.getOrCreateAgentConversation(
        db,
        workspaceId,
        agent.ownerId,
        agent.id
      );
      await taskService.enqueueTask(agent.id, conversation.id, workspaceId, prompt, TASK_TYPES.HEARTBEAT);
      await queries.agent.updateAgentHeartbeatFired(db, agent.id, workspaceId, new Date().toISOString());
    } catch (err) {
      log.warn("dispatchDueHeartbeats: failed to dispatch heartbeat", { agentId: agent.id, workspaceId, err });
    }
  }
}
