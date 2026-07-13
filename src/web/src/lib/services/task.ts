import type { Database, ExecutionPolicy, ExecutionState, ExecutionParticipant } from "@alook/shared";
import { queries, TASK_TYPES, MAX_TASKS_PER_TRACE, BUDGET_PAUSED_REASON_EXCEEDED, isOverBudget, resolveMentionedAgents } from "@alook/shared";
import { log } from "@/lib/logger";
import { broadcastToUser, broadcastToDaemon } from "@/lib/broadcast";
import { messageToResponse } from "@/lib/api/responses";
import { invalidate, cacheKeys } from "@/lib/cache";
import { TaskPayloadBuilder } from "@/lib/services/task-payload-builder";

const taskQueries = queries.task;
const agentQueries = queries.agent;
const messageQueries = queries.message;
const conversationQueries = queries.conversation;
const issueQueries = queries.issue;
const inboxQueries = queries.inbox;
const executionDecisionQueries = queries.executionDecision;
const memberQueries = queries.member;
const costEventQueries = queries.costEvent;
const goalQueries = queries.goal;

export class TaskService {
  constructor(private db: Database) {}

  async enqueueTask(
    agentId: string,
    conversationId: string,
    workspaceId: string,
    prompt: string,
    type: string = TASK_TYPES.USER_DM_MESSAGE,
    opts?: { contextKey?: string | null; context?: Record<string, unknown>; traceId?: string | null; parentTaskId?: string | null; executionPolicy?: ExecutionPolicy | null; goalId?: string | null },
  ) {
    const agent = await agentQueries.getAgent(this.db, agentId, workspaceId);
    if (!agent) {
      throw new Error("agent not found");
    }
    if (!agent.runtimeId) {
      throw new Error("agent has no runtime");
    }

    // Company goals gate: a task can't be created against a goal until that
    // goal has an APPROVED strategy proposal — see queries/goal.ts and
    // heartbeat.ts (which nudges the CEO-like agent to propose one). Tasks
    // with no goal_id are entirely unaffected.
    if (opts?.goalId) {
      const goal = await goalQueries.getGoal(this.db, opts.goalId, workspaceId);
      if (!goal) {
        throw new Error("goal not found");
      }
      const approved = await goalQueries.hasApprovedStrategy(this.db, opts.goalId, workspaceId);
      if (!approved) {
        throw new Error(
          `cannot create task: goal "${goal.title}" (${goal.id}) has no approved strategy yet — propose one via POST /api/goals/${goal.id}/strategy and have it approved first`
        );
      }
    }

    // Budget gate: block new dispatch once an agent is at/over its monthly
    // budget. kill_task must always get through (it's how a runaway agent
    // gets stopped). In-flight tasks are unaffected — this only guards task
    // *creation*. See queries/cost-event.ts for the live SUM computation.
    if (type !== TASK_TYPES.KILL_TASK && agent.budgetMonthlyCents !== null && agent.budgetMonthlyCents !== undefined) {
      const spentMonthlyCents = await costEventQueries.getMonthlySpentCents(this.db, agentId, workspaceId);
      if (isOverBudget(agent.budgetMonthlyCents, spentMonthlyCents)) {
        if (agent.pausedReason !== BUDGET_PAUSED_REASON_EXCEEDED) {
          await agentQueries.updateAgent(this.db, agentId, workspaceId, { pausedReason: BUDGET_PAUSED_REASON_EXCEEDED }).catch(() => {});
        }
        throw new Error(
          `agent is over its monthly budget (spent ${spentMonthlyCents}c / budget ${agent.budgetMonthlyCents}c) — dispatch blocked until budget is raised or the month rolls over`
        );
      }
      // Back under budget (new month, or budget raised/cleared) — clear a
      // stale pause instead of waiting for an operator to notice.
      if (agent.pausedReason === BUDGET_PAUSED_REASON_EXCEEDED) {
        await agentQueries.updateAgent(this.db, agentId, workspaceId, { pausedReason: null }).catch(() => {});
      }
    }

    if (opts?.traceId && opts.parentTaskId) {
      const traceCount = await taskQueries.countTasksByTrace(this.db, opts.traceId);
      if (traceCount >= MAX_TASKS_PER_TRACE) {
        throw new Error(`Trace limit reached (${MAX_TASKS_PER_TRACE} tasks). This may indicate an infinite loop between agents.`);
      }
    }

    // Set atomically at creation (not a later PATCH) so there's no window
    // where the task could finish before the policy lands.
    const executionPolicy = opts?.executionPolicy
      ? await this.sanitizeExecutionPolicy(opts.executionPolicy, workspaceId, agentId)
      : null;

    const task = await taskQueries.createTask(this.db, {
      agentId,
      runtimeId: agent.runtimeId,
      workspaceId,
      conversationId,
      prompt,
      type,
      contextKey: opts?.contextKey ?? null,
      priority: 0,
      context: opts?.context,
      traceId: opts?.traceId ?? null,
      parentTaskId: opts?.parentTaskId ?? null,
      executionPolicy,
      goalId: opts?.goalId ?? null,
    });
    invalidate(cacheKeys.activeTaskCounts(workspaceId)).catch(() => {});
    // Push task to daemon via WS (best-effort). Awaited to ensure task state
    // settles (dispatched on success, reverted to queued on failure) before
    // the HTTP response returns, preventing races with subsequent poll calls.
    await this.pushTaskToDaemon(task, workspaceId).catch(() => {});
    return task;
  }

  /**
   * @-mention wake — scans `content` for @AgentName tokens, resolves them
   * against real agent names in the workspace (case-insensitive exact
   * match), and dispatches a lightweight MENTION task to each resolved
   * agent so they wake and look at the source (a comment/message), without
   * assigning them the underlying work — see mentions.ts's doc comment for
   * the full rule set this ports from Paperclip. Best-effort per agent: one
   * mention failing (e.g. that agent is over budget) doesn't block others
   * or the caller's main request. Returns the agents actually woken.
   */
  async dispatchMentions(
    content: string,
    workspaceId: string,
    opts: { excludeAgentId?: string | null; sourceLabel: string }
  ): Promise<{ id: string; name: string }[]> {
    const allAgents = await agentQueries.getAllAgentsForWorkspace(this.db, workspaceId);
    const mentioned = resolveMentionedAgents(content, allAgents, opts.excludeAgentId);
    if (mentioned.length === 0) return [];

    const woken: { id: string; name: string }[] = [];
    for (const agentRow of mentioned) {
      const agent = allAgents.find((a) => a.id === agentRow.id);
      if (!agent || !agent.runtimeId || !agent.ownerId) continue;
      try {
        const conversation = await conversationQueries.getOrCreateAgentConversation(
          this.db,
          workspaceId,
          agent.ownerId,
          agent.id
        );
        const prompt = `You were mentioned in ${opts.sourceLabel}:\n\n"${content.slice(0, 1000)}"\n\nTake a look and respond or act if relevant. You were only mentioned, not assigned — if this needs real follow-up work, create or claim a task for it rather than assuming you're already on it.`;
        await this.enqueueTask(agent.id, conversation.id, workspaceId, prompt, TASK_TYPES.MENTION);
        woken.push({ id: agent.id, name: agent.name });
      } catch (err) {
        log.warn("dispatchMentions: failed to wake mentioned agent", { agentId: agent.id, workspaceId, err });
      }
    }
    return woken;
  }

  async claimTask(agentId: string, workspaceId: string) {
    const agent = await agentQueries.getAgent(this.db, agentId, workspaceId);
    return this.claimTaskWithAgent(agentId, workspaceId, agent);
  }

  private async claimTaskWithAgent(agentId: string, workspaceId: string, agent: Awaited<ReturnType<typeof agentQueries.getAgent>>) {
    if (!agent) {
      return null;
    }

    // Secondary budget guard (primary is enqueueTask's reject-with-reason).
    // A task queued before the budget was hit should not get claimed once
    // over budget — leaves it queued rather than killing anything in flight.
    if (agent.budgetMonthlyCents !== null && agent.budgetMonthlyCents !== undefined) {
      const spentMonthlyCents = await costEventQueries.getMonthlySpentCents(this.db, agentId, workspaceId);
      if (isOverBudget(agent.budgetMonthlyCents, spentMonthlyCents)) {
        return null;
      }
    }

    const running = await taskQueries.countRunningTasks(this.db, agentId, workspaceId);
    if (running >= agent.maxConcurrentTasks) {
      const steerable = await taskQueries.findSteerableReplacement(this.db, agentId, workspaceId);
      if (!steerable) return null;
      const runningExcluding = await taskQueries.countRunningTasks(this.db, agentId, workspaceId, steerable.predecessorId);
      if (runningExcluding >= agent.maxConcurrentTasks) return null;
    }

    const task = await taskQueries.claimTask(this.db, agentId, workspaceId);
    if (!task) {
      return null;
    }

    await agentQueries.updateAgentStatus(this.db, agentId, workspaceId, "working");
    return task;
  }

  async claimTasksForRuntimes(runtimeIds: string[], maxTasks: number, workspaceId: string) {
    const killTasks = await taskQueries.claimKillTasks(this.db, runtimeIds, workspaceId, maxTasks);
    const remaining = maxTasks - killTasks.length;

    const tasks = remaining > 0
      ? await taskQueries.listPendingTasksByRuntimes(this.db, runtimeIds, workspaceId)
      : [];
    const runtimeIdSet = new Set(runtimeIds);
    const triedAgents = new Set<string>();
    const claimed: NonNullable<Awaited<ReturnType<typeof this.claimTask>>>[] = [...killTasks];

    const uniqueCandidates: { agentId: string; workspaceId: string }[] = [];
    for (const candidate of tasks) {
      if (uniqueCandidates.length >= remaining) break;
      const key = `${candidate.agentId}:${candidate.workspaceId}`;
      if (triedAgents.has(key)) continue;
      triedAgents.add(key);
      uniqueCandidates.push(candidate);
    }

    if (uniqueCandidates.length === 0) return claimed;

    const agentIds = [...new Set(uniqueCandidates.map((c) => c.agentId))];
    const agents = await agentQueries.getAgentsByIds(this.db, agentIds, workspaceId);
    const agentMap = new Map(agents.map((a) => [a.id, a]));

    const results = await Promise.all(
      uniqueCandidates.map((c) => this.claimTaskWithAgent(c.agentId, c.workspaceId, agentMap.get(c.agentId) ?? null))
    );

    for (const task of results) {
      if (task && runtimeIdSet.has(task.runtimeId)) {
        claimed.push(task);
      }
    }

    return claimed;
  }

  async startTask(taskId: string, workspaceId: string) {
    const task = await taskQueries.startTask(this.db, taskId, workspaceId);
    if (!task) {
      throw new Error("task not in dispatched status");
    }
    return task;
  }

  async completeTask(
    taskId: string,
    workspaceId: string,
    result: string,
    sessionId: string,
    usage?: { provider?: string; model?: string; inputTokens?: number; outputTokens?: number; costCents?: number }
  ) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(result);
    } catch {
      parsed = { raw: result };
    }

    // Execution-policy gate: if this task carries a review/approval policy
    // that hasn't been fully approved yet, park it in "in_review" instead of
    // completing. See routeThroughExecutionPolicy. (Skipped when this call
    // is itself the final-approval re-entry from recordExecutionDecision —
    // routeThroughExecutionPolicy returns null once executionState.status
    // is "completed".)
    const existing = await taskQueries.getTask(this.db, taskId, workspaceId);
    if (existing) {
      const routed = await this.routeThroughExecutionPolicy(existing, workspaceId, {
        result: parsed,
        sessionId: sessionId || null,
      });
      if (routed) {
        return { ...routed, commentStatus: null };
      }
    }

    // "running" is the normal source status; "in_review" only applies when
    // the last review/approval stage just approved (see recordExecutionDecision).
    const task = await taskQueries.completeTask(
      this.db,
      taskId,
      workspaceId,
      { result: parsed, sessionId: sessionId || null },
      ["running", "in_review"],
    );

    if (!task) {
      const existing = await taskQueries.getTask(this.db, taskId);
      const status = existing?.status ?? "unknown";
      log.warn(`completeTask failed: task is in '${status}' status`, { taskId });
      throw new Error(`cannot complete task in '${status}' status`);
    }

    // The agent owns its voice: the success reply bubble is now authored
    // explicitly via `alook sync send-dm` (the agent-DM endpoint), NOT extracted
    // from the task's final `output`. So completeTask no longer creates a
    // `role:"assistant"` message — it only settles the task lifecycle. `output`
    // is still persisted on the task row (in `result`) for debugging.
    // (failTask still surfaces an error bubble — a failed run must not go silent.)
    await this.reconcileAgentStatus(task.agentId, task.workspaceId);
    this.maybeUpsertUnread(task, workspaceId, null).catch(() => {});
    // Best-effort cost recording — must never fail the completion. Records a
    // row even when the backend reports no usage/cost at all (e.g. cursor's
    // stream-json today), which still gives an honest per-task count signal.
    costEventQueries
      .createCostEvent(this.db, {
        workspaceId: task.workspaceId,
        agentId: task.agentId,
        taskId: task.id,
        provider: usage?.provider ?? null,
        model: usage?.model ?? null,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        costCents: usage?.costCents ?? null,
      })
      .catch((e) => log.warn("completeTask: failed to record cost event", { taskId: task.id, err: e instanceof Error ? e.message : String(e) }));
    const commentStatus = await this.enforceCommentBackstop(task, workspaceId);
    return { ...task, commentStatus };
  }

  async failTask(taskId: string, workspaceId: string, error: string) {
    const task = await taskQueries.failTask(this.db, taskId, workspaceId, error);

    if (!task) {
      const existing = await taskQueries.getTask(this.db, taskId);
      const status = existing?.status ?? "unknown";
      log.warn(`failTask failed: task is in '${status}' status`, { taskId });
      throw new Error(`cannot fail task in '${status}' status`);
    }

    if (task.type === TASK_TYPES.KILL_TASK) {
      return task;
    }

    let errorMessageId: string | null = null;
    if (error) {
      // Attribute the error to the agent runtime (Claude Code / Codex /
      // OpenCode) so the chat UI can make clear it did NOT come from Alook.
      // Resolve the provider from the task's runtime; never let this block the
      // task lifecycle (issue #236).
      let provider: string | null = null;
      try {
        if (task.runtimeId) {
          const rt = await queries.runtime.getAgentRuntime(this.db, task.runtimeId);
          provider = rt?.provider ?? null;
        }
      } catch {
        // non-critical: fall back to a generic runtime label
      }

      const msg = await messageQueries.createMessage(this.db, {
        conversationId: task.conversationId,
        role: "assistant",
        content: error,
        taskId,
        metadata: JSON.stringify({ error_source: "runtime", provider }),
      });
      errorMessageId = msg?.id ?? null;

      try {
        const conversation = await conversationQueries.getConversation(this.db, task.conversationId, workspaceId);
        if (conversation) {
          broadcastToUser(conversation.userId, {
            type: "conversation.message",
            conversationId: task.conversationId,
            message: messageToResponse(msg),
          }).catch(() => {});
        }
      } catch {
        // non-critical: don't let broadcast failure block task lifecycle
      }
    }

    await this.reconcileAgentStatus(task.agentId, task.workspaceId);
    await this.syncIssueStatusFromTask(task, "failed");
    this.maybeUpsertUnread(task, workspaceId, errorMessageId).catch(() => {});
    // Only short-circuit the lookup when we KNOW a comment exists (the error
    // bubble failTask just created). We can't shortcut the negative case: an
    // empty error here just means failTask itself didn't create a message —
    // the agent may have already posted one earlier in the run via send-dm.
    const commentStatus = await this.enforceCommentBackstop(task, workspaceId, {
      knownHasComment: errorMessageId !== null ? true : undefined,
    });
    return { ...task, commentStatus };
  }

  /**
   * Comment-required backstop: every non-exempt task reaching a terminal
   * status (completed/failed — NOT cancelled/superseded, which are
   * user/system-initiated shutdowns, not agent-reported outcomes) must have
   * left at least one message. If it didn't, fire exactly one reminder
   * continuation task carrying a `comment_retry_for` context flag; if THAT
   * continuation also completes/fails with no message, stop for good
   * (retry_exhausted) instead of retrying forever.
   *
   * heartbeat/kill_task are exempt (heartbeat explicitly tells the agent "no
   * need to reply" when there's nothing outstanding; kill_task isn't
   * agent-authored work).
   */
  private async enforceCommentBackstop(
    task: {
      id: string;
      agentId: string;
      workspaceId: string;
      conversationId: string;
      type: string;
      traceId?: string | null;
      context?: unknown;
    },
    workspaceId: string,
    opts?: { knownHasComment?: boolean },
  ): Promise<string | null> {
    if (task.type === TASK_TYPES.HEARTBEAT || task.type === TASK_TYPES.KILL_TASK) {
      return null;
    }

    try {
      const hasComment =
        opts?.knownHasComment !== undefined
          ? opts.knownHasComment
          : await messageQueries.hasMessageForTask(this.db, task.id);
      const ctx = (task.context ?? {}) as Record<string, unknown>;
      const retryForTaskId = typeof ctx.comment_retry_for === "string" ? ctx.comment_retry_for : null;

      if (hasComment) {
        const updated = await taskQueries.setCommentStatus(this.db, task.id, workspaceId, "satisfied");
        if (retryForTaskId) {
          await taskQueries.setCommentStatus(this.db, retryForTaskId, workspaceId, "satisfied");
        }
        return updated?.commentStatus ?? "satisfied";
      }

      if (retryForTaskId) {
        // This task IS the one-and-only retry attempt, and it also produced
        // no comment. Stop here — no further continuations.
        await taskQueries.setCommentStatus(this.db, task.id, workspaceId, "retry_exhausted");
        await taskQueries.setCommentStatus(this.db, retryForTaskId, workspaceId, "retry_exhausted");
        log.warn("enforceCommentBackstop: retry also produced no comment, giving up", {
          taskId: task.id,
          originalTaskId: retryForTaskId,
        });
        return "retry_exhausted";
      }

      // First offense: mark it and wake the agent exactly once more.
      const retryQueuedAt = new Date().toISOString();
      await taskQueries.setCommentStatus(this.db, task.id, workspaceId, "retry_queued", retryQueuedAt);
      try {
        await this.enqueueTask(
          task.agentId,
          task.conversationId,
          workspaceId,
          "Your previous task finished without leaving a message explaining the outcome. Please post a " +
            "brief summary via `alook sync send-dm` describing what happened before finishing.",
          task.type,
          {
            parentTaskId: task.id,
            traceId: task.traceId ?? null,
            context: { comment_retry_for: task.id },
          },
        );
      } catch (err) {
        log.warn("enforceCommentBackstop: failed to dispatch comment-retry task", { taskId: task.id, err });
      }
      return "retry_queued";
    } catch (err) {
      log.warn("enforceCommentBackstop failed", { taskId: task.id, err });
      return null;
    }
  }

  /**
   * Execution-policy gate. If `task.executionPolicy` has stages and hasn't
   * been fully approved (executionState.status !== "completed"), park the
   * task at "in_review" on the first eligible stage/participant instead of
   * letting it complete — returns the updated (in_review) task. Returns
   * null when there's no policy to intercept, letting the caller fall
   * through to normal completion.
   *
   * Loop-back: when the executor re-finishes after a "changes_requested"
   * decision, this re-enters the SAME stage (not stage 0) and — if the
   * previous reviewer is still eligible — reassigns the same participant.
   */
  private async routeThroughExecutionPolicy(
    task: { id: string; agentId: string; workspaceId: string; conversationId: string; executionPolicy?: unknown; executionState?: unknown },
    workspaceId: string,
    data: { result: unknown; sessionId: string | null },
  ) {
    const policy = (task.executionPolicy ?? null) as ExecutionPolicy | null;
    if (!policy || !policy.stages || policy.stages.length === 0) return null;

    const state = (task.executionState ?? null) as ExecutionState | null;
    if (state?.status === "completed") return null;

    const stageIndex =
      state?.status === "changes_requested" && state.currentStageIndex !== null
        ? state.currentStageIndex
        : 0;
    const stage = policy.stages[stageIndex];
    if (!stage) {
      log.warn("routeThroughExecutionPolicy: no stage at index, falling back to normal completion", {
        taskId: task.id,
        stageIndex,
      });
      return null;
    }

    const participant = this.pickEligibleParticipant(stage, task.agentId);
    if (!participant) {
      log.warn("routeThroughExecutionPolicy: no eligible participant for stage, falling back to normal completion", {
        taskId: task.id,
        stageId: stage.id,
      });
      return null;
    }

    const newState: ExecutionState = {
      status: "pending",
      currentStageId: stage.id,
      currentStageIndex: stageIndex,
      currentStageType: stage.type,
      currentParticipant: participant,
      returnAssignee: task.agentId,
      completedStageIds: state?.completedStageIds ?? [],
      lastDecisionId: state?.lastDecisionId ?? null,
      lastDecisionOutcome: state?.lastDecisionOutcome ?? null,
    };

    const routed = await taskQueries.routeTaskToReview(this.db, task.id, workspaceId, {
      result: data.result,
      sessionId: data.sessionId,
      executionState: newState,
    });
    if (!routed) return null;

    await this.reconcileAgentStatus(routed.agentId, routed.workspaceId);
    return routed;
  }

  /** First stage participant that isn't the original executor (self-review/approval is never allowed). */
  private pickEligibleParticipant(
    stage: { participants: ExecutionParticipant[] },
    executorAgentId: string,
  ): ExecutionParticipant | null {
    for (const p of stage.participants) {
      if (p.type === "agent" && p.agentId === executorAgentId) continue;
      return p;
    }
    return null;
  }

  /**
   * Drop stages with no eligible participant (agent doesn't exist in this
   * workspace, user isn't a member, or the only participant IS the task's
   * executor). Returns null if zero valid stages remain — the caller should
   * treat that as "no policy" (falls back to normal completion).
   */
  async sanitizeExecutionPolicy(
    policy: ExecutionPolicy | null,
    workspaceId: string,
    executorAgentId: string,
  ): Promise<ExecutionPolicy | null> {
    if (!policy || !policy.stages || policy.stages.length === 0) return null;

    const stages: ExecutionPolicy["stages"] = [];
    for (const stage of policy.stages) {
      const validParticipants: ExecutionParticipant[] = [];
      for (const p of stage.participants) {
        if (p.type === "agent") {
          if (p.agentId === executorAgentId) continue; // self-review/approval never valid
          const agent = await agentQueries.getAgent(this.db, p.agentId, workspaceId);
          if (agent) validParticipants.push(p);
        } else {
          const member = await memberQueries.getMemberByUserAndWorkspace(this.db, p.userId, workspaceId);
          if (member) validParticipants.push(p);
        }
      }
      if (validParticipants.length > 0) {
        stages.push({ ...stage, participants: validParticipants });
      }
    }

    if (stages.length === 0) return null;
    return { ...policy, stages };
  }

  /**
   * Record a review/approval decision on the task's current stage. Only the
   * currentParticipant may act. Both outcomes require a non-empty `body`.
   *
   * - "changes_requested": task returns to the original executor (status
   *   "queued", executionState parked on the SAME stage so a subsequent
   *   finish loops back here, not stage 0).
   * - "approved": advances to the next stage (reassigning to its first
   *   eligible participant), or — on the last stage — actually completes
   *   the task (comment-backstop still applies at that point).
   */
  async recordExecutionDecision(
    taskId: string,
    workspaceId: string,
    actor: { agentId?: string | null; userId?: string | null },
    outcome: "approved" | "changes_requested",
    body: string,
  ) {
    if (!body || !body.trim()) {
      throw new Error("body is required");
    }

    const task = await taskQueries.getTask(this.db, taskId, workspaceId);
    if (!task) throw new Error("task not found");
    if (task.status !== "in_review") {
      throw new Error(`cannot record execution decision: task is in '${task.status}' status`);
    }

    const state = (task.executionState ?? null) as ExecutionState | null;
    if (!state || state.status !== "pending" || !state.currentParticipant || !state.currentStageId || !state.currentStageType) {
      throw new Error("task has no pending execution decision");
    }

    const participant = state.currentParticipant;
    const isMatch =
      (participant.type === "agent" && !!actor.agentId && participant.agentId === actor.agentId) ||
      (participant.type === "user" && !!actor.userId && participant.userId === actor.userId);
    if (!isMatch) {
      throw new Error("forbidden: caller is not the current participant for this stage");
    }

    await executionDecisionQueries.createExecutionDecision(this.db, {
      taskId: task.id,
      workspaceId,
      stageId: state.currentStageId,
      stageType: state.currentStageType,
      actorAgentId: participant.type === "agent" ? participant.agentId : null,
      actorUserId: participant.type === "user" ? participant.userId : null,
      outcome,
      body,
    });

    await this.postExecutionDecisionMessage(task, state, outcome, body);

    if (outcome === "changes_requested") {
      const newState: ExecutionState = {
        status: "changes_requested",
        currentStageId: state.currentStageId,
        currentStageIndex: state.currentStageIndex,
        currentStageType: state.currentStageType,
        currentParticipant: { type: "agent", agentId: state.returnAssignee ?? task.agentId },
        returnAssignee: state.returnAssignee,
        completedStageIds: state.completedStageIds,
        lastDecisionId: null,
        lastDecisionOutcome: "changes_requested",
      };
      const updated = await taskQueries.returnTaskToExecutor(this.db, task.id, workspaceId, newState);
      if (!updated) throw new Error("failed to return task to executor");
      await this.reconcileAgentStatus(updated.agentId, updated.workspaceId);
      return updated;
    }

    // approved
    const policy = (task.executionPolicy ?? null) as ExecutionPolicy | null;
    if (!policy) throw new Error("task has no execution policy");

    const completedStageIds = [...state.completedStageIds, state.currentStageId];
    const nextIndex = (state.currentStageIndex ?? 0) + 1;
    const nextStage = policy.stages[nextIndex];
    const nextParticipant = nextStage ? this.pickEligibleParticipant(nextStage, task.agentId) : null;

    if (nextStage && nextParticipant) {
      const newState: ExecutionState = {
        status: "pending",
        currentStageId: nextStage.id,
        currentStageIndex: nextIndex,
        currentStageType: nextStage.type,
        currentParticipant: nextParticipant,
        returnAssignee: state.returnAssignee,
        completedStageIds,
        lastDecisionId: null,
        lastDecisionOutcome: "approved",
      };
      const updated = await taskQueries.advanceExecutionState(this.db, task.id, workspaceId, newState);
      if (!updated) throw new Error("failed to advance execution state");
      return updated;
    }

    // Last stage approved (or every remaining stage has no eligible
    // participant, which is inert by the same rule applied at policy-set
    // time) — actually complete the task now.
    const finalState: ExecutionState = {
      status: "completed",
      currentStageId: null,
      currentStageIndex: null,
      currentStageType: null,
      currentParticipant: null,
      returnAssignee: state.returnAssignee,
      completedStageIds,
      lastDecisionId: null,
      lastDecisionOutcome: "approved",
    };
    const advanced = await taskQueries.advanceExecutionState(this.db, task.id, workspaceId, finalState);
    if (!advanced) throw new Error("failed to advance execution state");
    return this.completeTask(task.id, workspaceId, JSON.stringify(task.result ?? {}), task.sessionId ?? "");
  }

  private async postExecutionDecisionMessage(
    task: { id: string; conversationId: string; workspaceId: string },
    state: ExecutionState,
    outcome: "approved" | "changes_requested",
    body: string,
  ) {
    const content =
      outcome === "approved"
        ? `Execution decision: approved (${state.currentStageType}) — ${body}`
        : `Execution decision: changes requested (${state.currentStageType}) — ${body}`;

    const msg = await messageQueries.createMessage(this.db, {
      conversationId: task.conversationId,
      role: "event",
      content,
      taskId: task.id,
      metadata: JSON.stringify({ kind: "execution_decision", outcome, stageId: state.currentStageId }),
    });

    try {
      const conversation = await conversationQueries.getConversation(this.db, task.conversationId, task.workspaceId);
      if (conversation) {
        broadcastToUser(conversation.userId, {
          type: "conversation.message",
          conversationId: task.conversationId,
          message: messageToResponse(msg),
        }).catch(() => {});
      }
    } catch {
      // non-critical: don't let broadcast failure block the decision
    }
  }

  private async syncIssueStatusFromTask(
    task: { id: string; type?: string | null; contextKey?: string | null; workspaceId: string; conversationId: string },
    status: "failed",
  ) {
    if (task.type !== TASK_TYPES.ISSUE_EVENT) return;

    const issue = await issueQueries.getIssueByConversation(this.db, task.conversationId, task.workspaceId);
    if (!issue || issue.status === status) return;

    const updated = await issueQueries.updateIssue(this.db, issue.id, task.workspaceId, { status });
    if (!updated) return;

    const eventMsg = await messageQueries.createMessage(this.db, {
      conversationId: task.conversationId,
      role: "event",
      content: `Issue status changed: ${issue.status} -> ${status}`,
      taskId: task.id,
      metadata: JSON.stringify({ issueId: issue.id }),
    });

    try {
      const conversation = await conversationQueries.getConversation(this.db, task.conversationId, task.workspaceId);
      if (conversation) {
        broadcastToUser(conversation.userId, {
          type: "conversation.message",
          conversationId: task.conversationId,
          message: messageToResponse(eventMsg),
        }).catch(() => {});
      }
    } catch {
      // non-critical: don't let broadcast failure block task lifecycle
    }
  }

  private async maybeUpsertUnread(
    task: { id: string; conversationId: string; type: string; parentTaskId?: string | null; traceId?: string | null; prompt: string; status: string; completedAt?: string | null; context?: unknown; workspaceId: string; agentId: string },
    workspaceId: string,
    knownMessageId: string | null,
  ) {
    if (!inboxQueries.isUnreadEligible(task)) return;
    if (!task.completedAt) return;

    const conversation = await conversationQueries.getConversation(this.db, task.conversationId, workspaceId);
    if (!conversation) return;

    const latestMessageId = knownMessageId ?? await inboxQueries.findLatestAssistantMessageId(this.db, task.conversationId);

    await inboxQueries.upsertUnreadEntry(this.db, {
      conversationId: task.conversationId,
      userId: conversation.userId,
      workspaceId,
      agentId: conversation.agentId,
      taskId: task.id,
      taskType: task.type,
      taskStatus: task.status,
      taskPrompt: task.prompt,
      completedAt: task.completedAt,
      latestMessageId,
    });
  }

  async setExecutionPolicy(taskId: string, workspaceId: string, policy: ExecutionPolicy | null) {
    const task = await taskQueries.getTask(this.db, taskId, workspaceId);
    if (!task) throw new Error("task not found");

    const sanitized = policy ? await this.sanitizeExecutionPolicy(policy, workspaceId, task.agentId) : null;
    const updated = await taskQueries.setExecutionPolicy(this.db, taskId, workspaceId, sanitized ?? null);
    if (!updated) {
      throw new Error(`cannot set execution policy: task is in '${task.status}' status`);
    }
    return { ...task, ...updated, executionPolicy: sanitized };
  }

  async supersedeTask(taskId: string, workspaceId: string) {
    const task = await taskQueries.supersedeTask(this.db, taskId, workspaceId);

    if (!task) {
      const existing = await taskQueries.getTask(this.db, taskId);
      const status = existing?.status ?? "unknown";
      log.warn(`supersedeTask failed: task is in '${status}' status`, { taskId });
      throw new Error(`cannot supersede task in '${status}' status`);
    }

    await this.reconcileAgentStatus(task.agentId, task.workspaceId);
    return task;
  }

  async retryTask(taskId: string, workspaceId: string) {
    const original = await taskQueries.getTask(this.db, taskId);
    if (!original) throw new Error("task not found");
    if (original.workspaceId !== workspaceId) throw new Error("task not found");
    if (original.status !== "failed") throw new Error("only failed tasks can be retried");

    const marked = await taskQueries.markFailedAsSuperseded(this.db, taskId, workspaceId);
    if (!marked) throw new Error("failed to mark task as superseded");

    const newTask = await this.enqueueTask(
      original.agentId,
      original.conversationId,
      workspaceId,
      original.prompt,
      original.type,
      {
        contextKey: original.contextKey ?? null,
        context: original.context as Record<string, unknown> | undefined,
        traceId: original.traceId ?? null,
        parentTaskId: original.parentTaskId ?? null,
      },
    );

    return { oldTask: marked, newTask };
  }

  async cancelActiveTask(conversationId: string, workspaceId: string, opts?: { reason?: string }) {
    const activeTask = await taskQueries.getActiveTaskByConversation(this.db, conversationId, workspaceId);
    if (!activeTask) return null;

    const cancelled = await taskQueries.cancelTask(this.db, activeTask.id, workspaceId);
    if (!cancelled) return null;

    if (activeTask.status === "dispatched" || activeTask.status === "running") {
      const killTask = await taskQueries.createTask(this.db, {
        agentId: activeTask.agentId,
        runtimeId: activeTask.runtimeId,
        workspaceId,
        conversationId,
        prompt: "",
        type: TASK_TYPES.KILL_TASK,
        context: { target_task_id: activeTask.id },
      });

      // Dispatch (claim) the kill task so it arrives at the daemon in "dispatched" status,
      // allowing the daemon to call failTask without a status mismatch error.
      await taskQueries.dispatchTaskById(this.db, killTask.id, workspaceId);

      const runtime = await queries.runtime.getAgentRuntime(this.db, activeTask.runtimeId);
      if (runtime) {
        broadcastToDaemon(runtime.daemonId, {
          type: "daemon.kill",
          workspaceId,
          agentId: activeTask.agentId,
          taskId: killTask.id,
          targetTaskId: activeTask.id,
        }).catch((e) => log.warn("daemon.kill broadcast failed, relying on poll fallback", e));
      }
    }

    // Stamp lifecycle messages (cancelled/superseded) so the chat renders them
    // as quiet centered system notes, not agent speech bubbles.
    await messageQueries.createMessage(this.db, {
      conversationId,
      role: "assistant",
      content: opts?.reason ?? "Task cancelled by you",
      taskId: activeTask.id,
      metadata: JSON.stringify({ kind: "lifecycle" }),
    });

    await this.reconcileAgentStatus(activeTask.agentId, workspaceId);
    return cancelled;
  }

  async reconcileAgentStatus(agentId: string, workspaceId: string) {
    const running = await taskQueries.countRunningTasks(this.db, agentId, workspaceId);
    const status = running > 0 ? "working" : "idle";
    await agentQueries.updateAgentStatus(this.db, agentId, workspaceId, status);
    invalidate(cacheKeys.activeTaskCounts(workspaceId)).catch(() => {});
  }

  async cancelTrace(traceId: string, workspaceId: string, opts?: { reason?: string }) {
    const tasks = await taskQueries.getTraceTree(this.db, traceId, workspaceId);
    const activeConvIds = [...new Set(
      tasks
        .filter(t => ["queued", "dispatched", "running"].includes(t.status))
        .map(t => t.conversationId)
    )];
    for (const convId of activeConvIds) {
      try {
        await this.cancelActiveTask(convId, workspaceId, { reason: opts?.reason });
      } catch (err) {
        log.warn("cancelTrace: failed to cancel task", { traceId, convId, err });
      }
    }
  }

  private async pushTaskToDaemon(
    task: Awaited<ReturnType<typeof taskQueries.createTask>>,
    workspaceId: string,
  ) {
    const runtime = await queries.runtime.getAgentRuntime(this.db, task.runtimeId);
    if (!runtime) return;

    const dispatched = await taskQueries.dispatchTaskById(this.db, task.id, workspaceId);
    if (!dispatched) return;

    const builder = new TaskPayloadBuilder(this.db);
    const payloads = await builder.buildFullPayloads([dispatched], workspaceId);
    if (payloads.length === 0) {
      await taskQueries.revertDispatchedToQueued(this.db, task.id, workspaceId);
      return;
    }

    try {
      const { sent } = await broadcastToDaemon(runtime.daemonId, {
        type: "daemon.tasks",
        tasks: payloads,
      });
      if (sent === 0) {
        await taskQueries.revertDispatchedToQueued(this.db, task.id, workspaceId);
      }
    } catch {
      await taskQueries.revertDispatchedToQueued(this.db, task.id, workspaceId);
    }
  }
}
