import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ getDb: vi.fn(() => ({})) }));

vi.mock("@alook/shared", () => ({
  TASK_TYPES: {
    USER_DM_MESSAGE: "user_dm_message",
    EMAIL_NOTIFICATION: "email_notification",
    CALENDAR_EVENT: "calendar_event",
    ISSUE_EVENT: "issue_event",
    KILL_TASK: "kill_task",
    HEARTBEAT: "heartbeat",
  },
  MAX_TASKS_PER_TRACE: 256,
  BUDGET_PAUSED_REASON_EXCEEDED: "budget_exceeded",
  isOverBudget: (budget: number | null, spent: number) => budget !== null && spent >= budget,
  queries: {
    task: {
      createTask: vi.fn(),
      claimTask: vi.fn(),
      startTask: vi.fn(),
      completeTask: vi.fn(),
      failTask: vi.fn(),
      supersedeTask: vi.fn(),
      markFailedAsSuperseded: vi.fn(),
      getTask: vi.fn(),
      countRunningTasks: vi.fn(),
      countTasksByTrace: vi.fn().mockResolvedValue(0),
      getLatestTaskForConversation: vi.fn().mockResolvedValue(null),
      listPendingTasksByRuntimes: vi.fn(),
      claimKillTasks: vi.fn().mockResolvedValue([]),
      getActiveTaskByConversation: vi.fn(),
      cancelTask: vi.fn(),
      dispatchTaskById: vi.fn().mockResolvedValue(null),
      findSteerableReplacement: vi.fn().mockResolvedValue(null),
      setCommentStatus: vi.fn().mockResolvedValue({ id: "t1", commentStatus: null }),
      routeTaskToReview: vi.fn(),
      advanceExecutionState: vi.fn(),
      returnTaskToExecutor: vi.fn(),
      setExecutionPolicy: vi.fn(),
    },
    agent: {
      getAgent: vi.fn(),
      getAgentsByIds: vi.fn(),
      updateAgentStatus: vi.fn(),
      updateAgent: vi.fn().mockResolvedValue(null),
    },
    message: {
      createMessage: vi.fn(),
      updateMessageTaskId: vi.fn().mockResolvedValue(undefined),
      hasMessageForTask: vi.fn().mockResolvedValue(false),
    },
    conversation: {
      getConversation: vi.fn(),
    },
    issue: {
      getIssue: vi.fn(),
      getIssueByConversation: vi.fn(),
      updateIssue: vi.fn(),
    },
    runtime: {
      getAgentRuntime: vi.fn(),
    },
    inbox: {
      isUnreadEligible: vi.fn().mockReturnValue(false),
      upsertUnreadEntry: vi.fn().mockResolvedValue(undefined),
      findLatestAssistantMessageId: vi.fn().mockResolvedValue(null),
    },
    executionDecision: {
      createExecutionDecision: vi.fn().mockResolvedValue({ id: "ted_1" }),
    },
    member: {
      getMemberByUserAndWorkspace: vi.fn(),
    },
    costEvent: {
      getMonthlySpentCents: vi.fn().mockResolvedValue(0),
      createCostEvent: vi.fn().mockResolvedValue({ id: "cev_1" }),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/broadcast", () => ({
  broadcastToUser: vi.fn().mockResolvedValue(undefined),
  broadcastToDaemon: vi.fn().mockResolvedValue({ sent: 1 }),
}));

vi.mock("@/lib/api/responses", () => ({
  messageToResponse: (m: unknown) => m,
  taskToResponse: (t: unknown) => t,
}));

import { TaskService } from "./task";
import { queries } from "@alook/shared";
import { broadcastToUser, broadcastToDaemon } from "@/lib/broadcast";
import { log } from "@/lib/logger";

const taskQ = queries.task as {
  [K in keyof typeof queries.task]: ReturnType<typeof vi.fn>;
};
const agentQ = queries.agent as {
  [K in keyof typeof queries.agent]: ReturnType<typeof vi.fn>;
};
const messageQ = queries.message as {
  [K in keyof typeof queries.message]: ReturnType<typeof vi.fn>;
};
const costEventQ = (queries as any).costEvent as {
  getMonthlySpentCents: ReturnType<typeof vi.fn>;
  createCostEvent: ReturnType<typeof vi.fn>;
};
const conversationQ = (queries as any).conversation as {
  getConversation: ReturnType<typeof vi.fn>;
};
const issueQ = (queries as any).issue as {
  getIssue: ReturnType<typeof vi.fn>;
  getIssueByConversation: ReturnType<typeof vi.fn>;
  updateIssue: ReturnType<typeof vi.fn>;
};
const runtimeQ = (queries as any).runtime as {
  getAgentRuntime: ReturnType<typeof vi.fn>;
};
const executionDecisionQ = (queries as any).executionDecision as {
  createExecutionDecision: ReturnType<typeof vi.fn>;
};
const memberQ = (queries as any).member as {
  getMemberByUserAndWorkspace: ReturnType<typeof vi.fn>;
};

const service = new TaskService({} as any);

describe("TaskService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no kill tasks to claim
    taskQ.claimKillTasks.mockResolvedValue([]);
    // Default: no comment on the task and no agent to retry-dispatch to —
    // clearAllMocks() only clears call history, not implementations set via
    // .mockResolvedValue in earlier tests, so pin these explicitly each run
    // to stop the comment-backstop's best-effort retry path (see
    // enforceCommentBackstop) from leaking agent/message state across tests.
    messageQ.hasMessageForTask.mockResolvedValue(false);
    agentQ.getAgent.mockResolvedValue(null);
    // Default: no task row found by id — completeTask's execution-policy
    // lookup should no-op unless a test explicitly wires a task with a
    // policy (same "pin defaults" rationale as above).
    taskQ.getTask.mockResolvedValue(undefined);
  });

  // ── enqueueTask ──────────────────────────────────────────────────

  describe("enqueueTask", () => {
    it("throws when agent not found", async () => {
      agentQ.getAgent.mockResolvedValue(null);

      await expect(
        service.enqueueTask("a1", "c1", "w1", "do stuff")
      ).rejects.toThrow("agent not found");
    });

    it("throws when agent has no runtime", async () => {
      agentQ.getAgent.mockResolvedValue({ id: "a1", runtimeId: null });

      await expect(
        service.enqueueTask("a1", "c1", "w1", "do stuff")
      ).rejects.toThrow("agent has no runtime");
    });

    it("creates task with correct params on success", async () => {
      agentQ.getAgent.mockResolvedValue({ id: "a1", runtimeId: "r1" });
      taskQ.createTask.mockResolvedValue({ id: "t1" });

      const result = await service.enqueueTask("a1", "c1", "w1", "do stuff");

      expect(taskQ.createTask).toHaveBeenCalledWith({}, {
        agentId: "a1",
        runtimeId: "r1",
        workspaceId: "w1",
        conversationId: "c1",
        prompt: "do stuff",
        type: "user_dm_message",
        contextKey: null,
        priority: 0,
        context: undefined,
        traceId: null,
        parentTaskId: null,
        executionPolicy: null,
      });
      expect(result).toEqual({ id: "t1" });
    });

    it("sanitizes and persists an execution_policy passed at creation time", async () => {
      agentQ.getAgent.mockResolvedValue({ id: "a1", runtimeId: "r1" });
      memberQ.getMemberByUserAndWorkspace.mockResolvedValue({ id: "m1" });
      taskQ.createTask.mockResolvedValue({ id: "t1" });

      const policy = {
        mode: "normal" as const,
        stages: [{ id: "s1", type: "review" as const, participants: [{ type: "user" as const, userId: "u2" }] }],
      };

      await service.enqueueTask("a1", "c1", "w1", "do stuff", "user_dm_message", { executionPolicy: policy });

      expect(taskQ.createTask).toHaveBeenCalledWith({}, expect.objectContaining({
        executionPolicy: policy,
      }));
    });
  });

  describe("enqueueTask budget gate", () => {
    it("allows dispatch when spent is under budget", async () => {
      agentQ.getAgent.mockResolvedValue({ id: "a1", runtimeId: "r1", budgetMonthlyCents: 1000, pausedReason: null });
      costEventQ.getMonthlySpentCents.mockResolvedValue(500);
      taskQ.createTask.mockResolvedValue({ id: "t1" });

      const result = await service.enqueueTask("a1", "c1", "w1", "do stuff");

      expect(result).toEqual({ id: "t1" });
      expect(agentQ.updateAgent).not.toHaveBeenCalled();
    });

    it("blocks dispatch and sets paused_reason once spent >= budget", async () => {
      agentQ.getAgent.mockResolvedValue({ id: "a1", runtimeId: "r1", budgetMonthlyCents: 1000, pausedReason: null });
      costEventQ.getMonthlySpentCents.mockResolvedValue(1000);

      await expect(service.enqueueTask("a1", "c1", "w1", "do stuff")).rejects.toThrow(/over its monthly budget/);

      expect(taskQ.createTask).not.toHaveBeenCalled();
      expect(agentQ.updateAgent).toHaveBeenCalledWith({}, "a1", "w1", { pausedReason: "budget_exceeded" });
    });

    it("blocks dispatch when spent exceeds budget (not just equal)", async () => {
      agentQ.getAgent.mockResolvedValue({ id: "a1", runtimeId: "r1", budgetMonthlyCents: 1000, pausedReason: null });
      costEventQ.getMonthlySpentCents.mockResolvedValue(1500);

      await expect(service.enqueueTask("a1", "c1", "w1", "do stuff")).rejects.toThrow(/over its monthly budget/);
      expect(taskQ.createTask).not.toHaveBeenCalled();
    });

    it("never blocks when budget is null (unlimited)", async () => {
      agentQ.getAgent.mockResolvedValue({ id: "a1", runtimeId: "r1", budgetMonthlyCents: null, pausedReason: null });
      costEventQ.getMonthlySpentCents.mockResolvedValue(999_999);
      taskQ.createTask.mockResolvedValue({ id: "t1" });

      const result = await service.enqueueTask("a1", "c1", "w1", "do stuff");

      expect(result).toEqual({ id: "t1" });
    });

    it("clears a stale paused_reason once back under budget", async () => {
      agentQ.getAgent.mockResolvedValue({ id: "a1", runtimeId: "r1", budgetMonthlyCents: 1000, pausedReason: "budget_exceeded" });
      costEventQ.getMonthlySpentCents.mockResolvedValue(0);
      taskQ.createTask.mockResolvedValue({ id: "t1" });

      const result = await service.enqueueTask("a1", "c1", "w1", "do stuff");

      expect(result).toEqual({ id: "t1" });
      expect(agentQ.updateAgent).toHaveBeenCalledWith({}, "a1", "w1", { pausedReason: null });
    });

    it("always lets kill_task through even when over budget", async () => {
      agentQ.getAgent.mockResolvedValue({ id: "a1", runtimeId: "r1", budgetMonthlyCents: 1000, pausedReason: "budget_exceeded" });
      taskQ.createTask.mockResolvedValue({ id: "kt1" });

      const result = await service.enqueueTask("a1", "c1", "w1", "stop", "kill_task");

      expect(result).toEqual({ id: "kt1" });
      expect(costEventQ.getMonthlySpentCents).not.toHaveBeenCalled();
    });
  });

  // ── claimTask ────────────────────────────────────────────────────

  describe("claimTask", () => {
    it("returns null when agent not found", async () => {
      agentQ.getAgent.mockResolvedValue(null);

      const result = await service.claimTask("a1", "w1");
      expect(result).toBeNull();
    });

    it("returns null when at max capacity", async () => {
      agentQ.getAgent.mockResolvedValue({
        id: "a1",
        maxConcurrentTasks: 2,
      });
      taskQ.countRunningTasks.mockResolvedValue(2);

      const result = await service.claimTask("a1", "w1");
      expect(result).toBeNull();
    });

    it("returns null when no queued tasks", async () => {
      agentQ.getAgent.mockResolvedValue({
        id: "a1",
        maxConcurrentTasks: 5,
      });
      taskQ.countRunningTasks.mockResolvedValue(0);
      taskQ.claimTask.mockResolvedValue(null);

      const result = await service.claimTask("a1", "w1");
      expect(result).toBeNull();
    });

    it("claims task and updates agent to working on success", async () => {
      agentQ.getAgent.mockResolvedValue({
        id: "a1",
        maxConcurrentTasks: 5,
      });
      taskQ.countRunningTasks.mockResolvedValue(1);
      taskQ.claimTask.mockResolvedValue({ id: "t1", agentId: "a1" });

      const result = await service.claimTask("a1", "w1");

      expect(result).toEqual({ id: "t1", agentId: "a1" });
      expect(agentQ.updateAgentStatus).toHaveBeenCalledWith(
        {},
        "a1",
        "w1",
        "working"
      );
    });
  });

  // ── claimTasksForRuntimes ─────────────────────────────────────────

  describe("claimTasksForRuntimes", () => {
    it("returns empty array when no pending tasks", async () => {
      taskQ.listPendingTasksByRuntimes.mockResolvedValue([]);

      const result = await service.claimTasksForRuntimes(["r1"], 1, "w1");
      expect(result).toEqual([]);
    });

    it("deduplicates by agent ID and workspace ID", async () => {
      taskQ.listPendingTasksByRuntimes.mockResolvedValue([
        { agentId: "a1", workspaceId: "w1", id: "t1", runtimeId: "r1" },
        { agentId: "a1", workspaceId: "w1", id: "t2", runtimeId: "r1" },
      ]);
      agentQ.getAgentsByIds.mockResolvedValue([{
        id: "a1",
        maxConcurrentTasks: 5,
      }]);
      taskQ.countRunningTasks.mockResolvedValue(0);
      taskQ.claimTask.mockResolvedValue({
        id: "t1",
        agentId: "a1",
        runtimeId: "r1",
      });

      const result = await service.claimTasksForRuntimes(["r1"], 5, "w1");

      expect(result).toEqual([{ id: "t1", agentId: "a1", runtimeId: "r1" }]);
      expect(taskQ.claimTask).toHaveBeenCalledTimes(1);
    });

    it("respects maxTasks limit", async () => {
      taskQ.listPendingTasksByRuntimes.mockResolvedValue([
        { agentId: "a1", workspaceId: "w1", id: "t1", runtimeId: "r1" },
        { agentId: "a2", workspaceId: "w1", id: "t2", runtimeId: "r1" },
        { agentId: "a3", workspaceId: "w1", id: "t3", runtimeId: "r1" },
      ]);
      agentQ.getAgentsByIds.mockResolvedValue([
        { id: "a1", maxConcurrentTasks: 5 },
        { id: "a2", maxConcurrentTasks: 5 },
      ]);
      taskQ.countRunningTasks.mockResolvedValue(0);

      let callCount = 0;
      taskQ.claimTask.mockImplementation(async () => {
        callCount++;
        return { id: `t${callCount}`, agentId: `a${callCount}`, runtimeId: "r1" };
      });

      const result = await service.claimTasksForRuntimes(["r1"], 2, "w1");
      expect(result).toHaveLength(2);
    });

    it("skips claimed task whose runtimeId is not in the provided set", async () => {
      taskQ.listPendingTasksByRuntimes.mockResolvedValue([
        { agentId: "a1", workspaceId: "w1", id: "t1", runtimeId: "r1" },
      ]);
      agentQ.getAgentsByIds.mockResolvedValue([{ id: "a1", maxConcurrentTasks: 5 }]);
      taskQ.countRunningTasks.mockResolvedValue(0);
      taskQ.claimTask.mockResolvedValue({
        id: "t1",
        agentId: "a1",
        runtimeId: "r2", // different runtime than provided
      });

      const result = await service.claimTasksForRuntimes(["r1"], 5, "w1");
      expect(result).toEqual([]);
    });

    it("returns tasks across multiple runtimes", async () => {
      taskQ.listPendingTasksByRuntimes.mockResolvedValue([
        { agentId: "a1", workspaceId: "w1", id: "t1", runtimeId: "r1" },
        { agentId: "a2", workspaceId: "w1", id: "t2", runtimeId: "r2" },
      ]);
      agentQ.getAgentsByIds.mockResolvedValue([
        { id: "a1", maxConcurrentTasks: 5 },
        { id: "a2", maxConcurrentTasks: 5 },
      ]);
      taskQ.countRunningTasks.mockResolvedValue(0);

      let callCount = 0;
      taskQ.claimTask.mockImplementation(async () => {
        callCount++;
        const rid = callCount === 1 ? "r1" : "r2";
        return { id: `t${callCount}`, agentId: `a${callCount}`, runtimeId: rid };
      });

      const result = await service.claimTasksForRuntimes(["r1", "r2"], 5, "w1");
      expect(result).toHaveLength(2);
    });
  });

  // ── startTask ────────────────────────────────────────────────────

  describe("startTask", () => {
    it("throws when not in dispatched status", async () => {
      taskQ.startTask.mockResolvedValue(null);

      await expect(service.startTask("t1", "w1")).rejects.toThrow(
        "task not in dispatched status"
      );
    });

    it("returns started task on success", async () => {
      const task = { id: "t1", status: "running" };
      taskQ.startTask.mockResolvedValue(task);

      const result = await service.startTask("t1", "w1");
      expect(result).toEqual(task);
      expect(taskQ.startTask).toHaveBeenCalledWith({}, "t1", "w1");
    });

    it("moves issue tasks to in_progress when they start", async () => {
      const task = {
        id: "t1",
        type: "issue_event",
        contextKey: "iss_1",
        workspaceId: "w1",
        conversationId: "c1",
        status: "running",
      };
      taskQ.startTask.mockResolvedValue(task);

      await service.startTask("t1", "w1");

      // Agent now controls issue status via CLI — startTask no longer auto-syncs
      expect(issueQ.updateIssue).not.toHaveBeenCalled();
    });
  });

  // ── completeTask ─────────────────────────────────────────────────

  describe("completeTask", () => {
    it("does NOT create an assistant message or broadcast from result.output (A1)", async () => {
      // A1: the agent owns its voice via `sync send-dm`. completeTask must no
      // longer auto-extract the final output into a chat bubble.
      const task = {
        id: "t1",
        agentId: "a1",
        workspaceId: "w1",
        conversationId: "c1",
        status: "completed",
      };
      taskQ.completeTask.mockResolvedValue(task);
      taskQ.countRunningTasks.mockResolvedValue(0);
      agentQ.updateAgentStatus.mockResolvedValue(undefined);

      await service.completeTask(
        "t1",
        "w1",
        JSON.stringify({ output: "Here is the answer" }),
        "sess-1"
      );

      expect(messageQ.createMessage).not.toHaveBeenCalled();
      expect(broadcastToUser).not.toHaveBeenCalled();
      // lifecycle side-effects still run
      expect(taskQ.completeTask).toHaveBeenCalled();
      expect(agentQ.updateAgentStatus).toHaveBeenCalled();
    });

    it("does not create message when result has no output", async () => {
      const task = {
        id: "t1",
        agentId: "a1",
        workspaceId: "w1",
        conversationId: "c1",
        status: "completed",
      };
      taskQ.completeTask.mockResolvedValue(task);
      taskQ.countRunningTasks.mockResolvedValue(0);
      agentQ.updateAgentStatus.mockResolvedValue(undefined);

      await service.completeTask("t1", "w1", JSON.stringify({}), "sess-1");

      expect(messageQ.createMessage).not.toHaveBeenCalled();
    });

    it("calls reconcileAgentStatus", async () => {
      const task = {
        id: "t1",
        agentId: "a1",
        workspaceId: "w1",
        conversationId: "c1",
        status: "completed",
      };
      taskQ.completeTask.mockResolvedValue(task);
      taskQ.countRunningTasks.mockResolvedValue(1);
      agentQ.updateAgentStatus.mockResolvedValue(undefined);

      await service.completeTask("t1", "w1", JSON.stringify({}), "sess-1");

      expect(agentQ.updateAgentStatus).toHaveBeenCalledWith(
        {},
        "a1",
        "w1",
        "working"
      );
    });

    it("moves issue tasks to done when they complete", async () => {
      const task = {
        id: "t1",
        agentId: "a1",
        workspaceId: "w1",
        conversationId: "c1",
        type: "issue_event",
        contextKey: "iss_1",
        status: "completed",
      };
      taskQ.completeTask.mockResolvedValue(task);
      taskQ.countRunningTasks.mockResolvedValue(0);
      agentQ.updateAgentStatus.mockResolvedValue(undefined);

      await service.completeTask("t1", "w1", JSON.stringify({}), "sess-1");

      // Agent now controls issue status via CLI — completeTask no longer auto-syncs
      expect(issueQ.updateIssue).not.toHaveBeenCalled();
    });

    // ── comment-required backstop ─────────────────────────────────

    it("completeTask_noMessage_marksRetryQueuedAndDispatchesReminder", async () => {
      const task = {
        id: "t1",
        agentId: "a1",
        workspaceId: "w1",
        conversationId: "c1",
        type: "user_dm_message",
        status: "completed",
      };
      taskQ.completeTask.mockResolvedValue(task);
      taskQ.countRunningTasks.mockResolvedValue(0);
      agentQ.updateAgentStatus.mockResolvedValue(undefined);
      messageQ.hasMessageForTask.mockResolvedValue(false);
      taskQ.setCommentStatus.mockResolvedValue({ id: "t1", commentStatus: "retry_queued" });
      agentQ.getAgent.mockResolvedValue({ id: "a1", runtimeId: "rt1" });
      taskQ.createTask.mockResolvedValue({ id: "t2", agentId: "a1", runtimeId: "rt1", workspaceId: "w1", conversationId: "c1" });

      const result = await service.completeTask("t1", "w1", JSON.stringify({}), "sess-1");

      expect(messageQ.hasMessageForTask).toHaveBeenCalledWith({}, "t1");
      expect(taskQ.setCommentStatus).toHaveBeenCalledWith({}, "t1", "w1", "retry_queued", expect.any(String));
      expect(taskQ.createTask).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          agentId: "a1",
          conversationId: "c1",
          parentTaskId: "t1",
          context: { comment_retry_for: "t1" },
        })
      );
      expect(result.commentStatus).toBe("retry_queued");
    });

    it("completeTask_withMessage_marksSatisfiedAndDoesNotRetry", async () => {
      const task = {
        id: "t1",
        agentId: "a1",
        workspaceId: "w1",
        conversationId: "c1",
        type: "user_dm_message",
        status: "completed",
      };
      taskQ.completeTask.mockResolvedValue(task);
      taskQ.countRunningTasks.mockResolvedValue(0);
      agentQ.updateAgentStatus.mockResolvedValue(undefined);
      messageQ.hasMessageForTask.mockResolvedValue(true);
      taskQ.setCommentStatus.mockResolvedValue({ id: "t1", commentStatus: "satisfied" });

      const result = await service.completeTask("t1", "w1", JSON.stringify({}), "sess-1");

      expect(taskQ.setCommentStatus).toHaveBeenCalledWith({}, "t1", "w1", "satisfied");
      expect(taskQ.createTask).not.toHaveBeenCalled();
      expect(result.commentStatus).toBe("satisfied");
    });

    it("completeTask_retryTaskAlsoSilent_marksRetryExhaustedOnBothAndStops", async () => {
      // This IS the reminder continuation (context.comment_retry_for points
      // back at the original task) — it also completed with no message.
      const retryTask = {
        id: "t2",
        agentId: "a1",
        workspaceId: "w1",
        conversationId: "c1",
        type: "user_dm_message",
        status: "completed",
        context: { comment_retry_for: "t1" },
      };
      taskQ.completeTask.mockResolvedValue(retryTask);
      taskQ.countRunningTasks.mockResolvedValue(0);
      agentQ.updateAgentStatus.mockResolvedValue(undefined);
      messageQ.hasMessageForTask.mockResolvedValue(false);

      const result = await service.completeTask("t2", "w1", JSON.stringify({}), "sess-1");

      expect(taskQ.setCommentStatus).toHaveBeenCalledWith({}, "t2", "w1", "retry_exhausted");
      expect(taskQ.setCommentStatus).toHaveBeenCalledWith({}, "t1", "w1", "retry_exhausted");
      // Bounded: no second continuation is ever dispatched.
      expect(taskQ.createTask).not.toHaveBeenCalled();
      expect(result.commentStatus).toBe("retry_exhausted");
    });

    it("completeTask_heartbeatType_skipsBackstopEntirely", async () => {
      const task = {
        id: "t1",
        agentId: "a1",
        workspaceId: "w1",
        conversationId: "c1",
        type: "heartbeat",
        status: "completed",
      };
      taskQ.completeTask.mockResolvedValue(task);
      taskQ.countRunningTasks.mockResolvedValue(0);
      agentQ.updateAgentStatus.mockResolvedValue(undefined);

      const result = await service.completeTask("t1", "w1", JSON.stringify({}), "sess-1");

      expect(messageQ.hasMessageForTask).not.toHaveBeenCalled();
      expect(taskQ.setCommentStatus).not.toHaveBeenCalled();
      expect(result.commentStatus).toBeNull();
    });
  });

  // ── execution policy (review/approval gates) ────────────────────

  describe("execution policy", () => {
    const reviewPolicy = {
      mode: "normal",
      stages: [
        { id: "s_review", type: "review", participants: [{ type: "agent", agentId: "reviewer1" }] },
        { id: "s_approval", type: "approval", participants: [{ type: "agent", agentId: "approver1" }] },
      ],
    };

    describe("completeTask routing (finish while a policy is active)", () => {
      it("routes to review on first finish instead of completing", async () => {
        const task = {
          id: "t1",
          agentId: "executor1",
          workspaceId: "w1",
          conversationId: "c1",
          type: "user_dm_message",
          status: "running",
          executionPolicy: reviewPolicy,
          executionState: null,
        };
        taskQ.getTask.mockResolvedValue(task);
        taskQ.routeTaskToReview.mockResolvedValue({ ...task, status: "in_review" });
        taskQ.countRunningTasks.mockResolvedValue(0);
        agentQ.updateAgentStatus.mockResolvedValue(undefined);

        const result = await service.completeTask("t1", "w1", JSON.stringify({ output: "done" }), "sess-1");

        expect(taskQ.completeTask).not.toHaveBeenCalled();
        expect(taskQ.routeTaskToReview).toHaveBeenCalledWith(
          {},
          "t1",
          "w1",
          {
            result: { output: "done" },
            sessionId: "sess-1",
            executionState: expect.objectContaining({
              status: "pending",
              currentStageId: "s_review",
              currentStageIndex: 0,
              currentStageType: "review",
              currentParticipant: { type: "agent", agentId: "reviewer1" },
              returnAssignee: "executor1",
            }),
          },
        );
        // The executor's runtime finished (left "running") — reconcile now,
        // not just on the eventual real completion.
        expect(agentQ.updateAgentStatus).toHaveBeenCalledWith({}, "executor1", "w1", "idle");
        expect(result.status).toBe("in_review");
        expect(result.commentStatus).toBeNull();
      });

      it("excludes the original executor from stage-0 eligibility (no self-review)", async () => {
        const selfPolicy = {
          mode: "normal",
          stages: [
            {
              id: "s_review",
              type: "review",
              // executor is listed first — must be skipped in favor of reviewer1
              participants: [{ type: "agent", agentId: "executor1" }, { type: "agent", agentId: "reviewer1" }],
            },
          ],
        };
        const task = {
          id: "t1",
          agentId: "executor1",
          workspaceId: "w1",
          conversationId: "c1",
          type: "user_dm_message",
          status: "running",
          executionPolicy: selfPolicy,
          executionState: null,
        };
        taskQ.getTask.mockResolvedValue(task);
        taskQ.routeTaskToReview.mockResolvedValue({ ...task, status: "in_review" });
        taskQ.countRunningTasks.mockResolvedValue(0);

        await service.completeTask("t1", "w1", JSON.stringify({}), "sess-1");

        expect(taskQ.routeTaskToReview).toHaveBeenCalledWith(
          {},
          "t1",
          "w1",
          expect.objectContaining({
            executionState: expect.objectContaining({
              currentParticipant: { type: "agent", agentId: "reviewer1" },
            }),
          }),
        );
      });

      it("loops back to the SAME (non-zero) stage after changes_requested, not stage 0", async () => {
        const task = {
          id: "t1",
          agentId: "executor1",
          workspaceId: "w1",
          conversationId: "c1",
          type: "user_dm_message",
          status: "running",
          executionPolicy: reviewPolicy,
          executionState: {
            status: "changes_requested",
            currentStageId: "s_approval",
            currentStageIndex: 1,
            currentStageType: "approval",
            currentParticipant: { type: "agent", agentId: "executor1" },
            returnAssignee: "executor1",
            completedStageIds: ["s_review"],
          },
        };
        taskQ.getTask.mockResolvedValue(task);
        taskQ.routeTaskToReview.mockResolvedValue({ ...task, status: "in_review" });
        taskQ.countRunningTasks.mockResolvedValue(0);

        await service.completeTask("t1", "w1", JSON.stringify({}), "sess-2");

        expect(taskQ.routeTaskToReview).toHaveBeenCalledWith(
          {},
          "t1",
          "w1",
          expect.objectContaining({
            executionState: expect.objectContaining({
              currentStageId: "s_approval",
              currentStageIndex: 1,
              currentStageType: "approval",
              currentParticipant: { type: "agent", agentId: "approver1" },
              completedStageIds: ["s_review"],
            }),
          }),
        );
      });

      it("does not intercept once executionState.status is already completed", async () => {
        const task = {
          id: "t1",
          agentId: "executor1",
          workspaceId: "w1",
          conversationId: "c1",
          type: "user_dm_message",
          status: "in_review",
          executionPolicy: reviewPolicy,
          executionState: { status: "completed", currentStageId: null, currentStageIndex: null, currentStageType: null, currentParticipant: null, returnAssignee: "executor1", completedStageIds: ["s_review", "s_approval"] },
        };
        taskQ.getTask.mockResolvedValue(task);
        taskQ.completeTask.mockResolvedValue({ ...task, status: "completed" });
        taskQ.countRunningTasks.mockResolvedValue(0);
        messageQ.hasMessageForTask.mockResolvedValue(true);

        const result = await service.completeTask("t1", "w1", JSON.stringify({}), "sess-3");

        expect(taskQ.routeTaskToReview).not.toHaveBeenCalled();
        expect(taskQ.completeTask).toHaveBeenCalled();
        expect(result.status).toBe("completed");
      });
    });

    describe("recordExecutionDecision", () => {
      const reviewPendingTask = {
        id: "t1",
        agentId: "executor1",
        workspaceId: "w1",
        conversationId: "c1",
        type: "user_dm_message",
        status: "in_review",
        result: { output: "done" },
        sessionId: "sess-1",
        executionPolicy: reviewPolicy,
        executionState: {
          status: "pending",
          currentStageId: "s_review",
          currentStageIndex: 0,
          currentStageType: "review",
          currentParticipant: { type: "agent", agentId: "reviewer1" },
          returnAssignee: "executor1",
          completedStageIds: [],
        },
      };

      it("rejects a decision from anyone other than the current participant", async () => {
        taskQ.getTask.mockResolvedValue(reviewPendingTask);

        await expect(
          service.recordExecutionDecision("t1", "w1", { agentId: "someone-else" }, "approved", "looks fine")
        ).rejects.toThrow(/forbidden/);

        expect(executionDecisionQ.createExecutionDecision).not.toHaveBeenCalled();
        expect(taskQ.advanceExecutionState).not.toHaveBeenCalled();
        expect(taskQ.returnTaskToExecutor).not.toHaveBeenCalled();
      });

      it("rejects an empty body for either outcome", async () => {
        taskQ.getTask.mockResolvedValue(reviewPendingTask);

        await expect(
          service.recordExecutionDecision("t1", "w1", { agentId: "reviewer1" }, "approved", "")
        ).rejects.toThrow(/body is required/);
        await expect(
          service.recordExecutionDecision("t1", "w1", { agentId: "reviewer1" }, "changes_requested", "")
        ).rejects.toThrow(/body is required/);

        expect(executionDecisionQ.createExecutionDecision).not.toHaveBeenCalled();
      });

      it("review approve advances to the approval stage (task stays in_review, new participant)", async () => {
        taskQ.getTask.mockResolvedValue(reviewPendingTask);
        taskQ.advanceExecutionState.mockResolvedValue({
          ...reviewPendingTask,
          executionState: {
            ...reviewPendingTask.executionState,
            status: "pending",
            currentStageId: "s_approval",
            currentStageIndex: 1,
            currentStageType: "approval",
            currentParticipant: { type: "agent", agentId: "approver1" },
          },
        });

        const result = await service.recordExecutionDecision("t1", "w1", { agentId: "reviewer1" }, "approved", "looks good");

        expect(executionDecisionQ.createExecutionDecision).toHaveBeenCalledWith({}, expect.objectContaining({
          taskId: "t1",
          stageId: "s_review",
          stageType: "review",
          actorAgentId: "reviewer1",
          outcome: "approved",
          body: "looks good",
        }));
        expect(taskQ.advanceExecutionState).toHaveBeenCalledWith({}, "t1", "w1", expect.objectContaining({
          status: "pending",
          currentStageId: "s_approval",
          currentStageIndex: 1,
          currentStageType: "approval",
          currentParticipant: { type: "agent", agentId: "approver1" },
          completedStageIds: ["s_review"],
        }));
        expect(taskQ.completeTask).not.toHaveBeenCalled();
        expect(result.executionState.currentStageId).toBe("s_approval");
      });

      it("approval approve on the last stage actually completes the task", async () => {
        const approvalPendingTask = {
          ...reviewPendingTask,
          executionState: {
            status: "pending",
            currentStageId: "s_approval",
            currentStageIndex: 1,
            currentStageType: "approval",
            currentParticipant: { type: "agent", agentId: "approver1" },
            returnAssignee: "executor1",
            completedStageIds: ["s_review"],
          },
        };
        // First getTask call is recordExecutionDecision's own lookup; the
        // second is completeTask's internal policy check after
        // executionState has been advanced to "completed" on the row.
        taskQ.getTask
          .mockResolvedValueOnce(approvalPendingTask)
          .mockResolvedValueOnce({
            ...approvalPendingTask,
            executionState: { ...approvalPendingTask.executionState, status: "completed" },
          });
        taskQ.advanceExecutionState.mockResolvedValue({ ...approvalPendingTask, executionState: { status: "completed" } });
        taskQ.completeTask.mockResolvedValue({ ...approvalPendingTask, status: "completed" });
        taskQ.countRunningTasks.mockResolvedValue(0);
        agentQ.updateAgentStatus.mockResolvedValue(undefined);
        messageQ.hasMessageForTask.mockResolvedValue(true);
        taskQ.setCommentStatus.mockResolvedValue({ id: "t1", commentStatus: "satisfied" });

        const result = await service.recordExecutionDecision("t1", "w1", { agentId: "approver1" }, "approved", "shipping it");

        expect(taskQ.advanceExecutionState).toHaveBeenCalledWith({}, "t1", "w1", expect.objectContaining({
          status: "completed",
          completedStageIds: ["s_review", "s_approval"],
        }));
        expect(taskQ.completeTask).toHaveBeenCalled();
        expect(result.status).toBe("completed");
      });

      it("changes_requested returns the task to the original executor on the same stage", async () => {
        taskQ.getTask.mockResolvedValue(reviewPendingTask);
        taskQ.returnTaskToExecutor.mockResolvedValue({
          ...reviewPendingTask,
          status: "queued",
          executionState: {
            ...reviewPendingTask.executionState,
            status: "changes_requested",
            currentParticipant: { type: "agent", agentId: "executor1" },
          },
        });
        agentQ.updateAgentStatus.mockResolvedValue(undefined);
        taskQ.countRunningTasks.mockResolvedValue(0);

        const result = await service.recordExecutionDecision("t1", "w1", { agentId: "reviewer1" }, "changes_requested", "please fix the typo");

        expect(executionDecisionQ.createExecutionDecision).toHaveBeenCalledWith({}, expect.objectContaining({
          outcome: "changes_requested",
          body: "please fix the typo",
        }));
        expect(taskQ.returnTaskToExecutor).toHaveBeenCalledWith({}, "t1", "w1", expect.objectContaining({
          status: "changes_requested",
          currentStageId: "s_review",
          currentStageIndex: 0,
          currentParticipant: { type: "agent", agentId: "executor1" },
          returnAssignee: "executor1",
        }));
        expect(result.status).toBe("queued");
      });

      it("rejects a decision when the task isn't in_review", async () => {
        taskQ.getTask.mockResolvedValue({ ...reviewPendingTask, status: "running" });

        await expect(
          service.recordExecutionDecision("t1", "w1", { agentId: "reviewer1" }, "approved", "x")
        ).rejects.toThrow(/in 'running' status/);
      });
    });

    describe("setExecutionPolicy", () => {
      it("drops a stage whose only participant is the task's own executor, nulling the policy", async () => {
        const task = { id: "t1", agentId: "executor1", workspaceId: "w1", status: "queued" };
        taskQ.getTask.mockResolvedValue(task);
        taskQ.setExecutionPolicy.mockResolvedValue({ ...task, executionPolicy: null });

        const policy = {
          mode: "normal",
          stages: [{ id: "s1", type: "review", participants: [{ type: "agent", agentId: "executor1" }] }],
        };

        await service.setExecutionPolicy("t1", "w1", policy as any);

        expect(taskQ.setExecutionPolicy).toHaveBeenCalledWith({}, "t1", "w1", null);
      });

      it("keeps a stage with a valid non-executor agent participant", async () => {
        const task = { id: "t1", agentId: "executor1", workspaceId: "w1", status: "queued" };
        taskQ.getTask.mockResolvedValue(task);
        agentQ.getAgent.mockResolvedValue({ id: "reviewer1" });
        taskQ.setExecutionPolicy.mockResolvedValue({ ...task, executionPolicy: {} });

        const policy = {
          mode: "normal",
          stages: [{ id: "s1", type: "review", participants: [{ type: "agent", agentId: "reviewer1" }] }],
        };

        await service.setExecutionPolicy("t1", "w1", policy as any);

        expect(taskQ.setExecutionPolicy).toHaveBeenCalledWith({}, "t1", "w1", expect.objectContaining({
          stages: [{ id: "s1", type: "review", participants: [{ type: "agent", agentId: "reviewer1" }] }],
        }));
      });
    });
  });

  // ── failTask ─────────────────────────────────────────────────────

  describe("failTask", () => {
    it("creates a runtime-attributed error message with the resolved provider (TC6)", async () => {
      const task = {
        id: "t1",
        agentId: "a1",
        workspaceId: "w1",
        conversationId: "c1",
        runtimeId: "rt1",
        status: "failed",
      };
      taskQ.failTask.mockResolvedValue(task);
      taskQ.countRunningTasks.mockResolvedValue(0);
      agentQ.updateAgentStatus.mockResolvedValue(undefined);
      runtimeQ.getAgentRuntime.mockResolvedValue({ id: "rt1", provider: "claude" });

      await service.failTask("t1", "w1", "Not logged in · Please run /login");

      expect(runtimeQ.getAgentRuntime).toHaveBeenCalledWith({}, "rt1");
      expect(messageQ.createMessage).toHaveBeenCalledWith({}, {
        conversationId: "c1",
        role: "assistant",
        content: "Not logged in · Please run /login",
        taskId: "t1",
        metadata: JSON.stringify({ error_source: "runtime", provider: "claude" }),
      });
    });

    it("still attributes the message with provider:null when the runtime can't be resolved (TC7)", async () => {
      const task = {
        id: "t1",
        agentId: "a1",
        workspaceId: "w1",
        conversationId: "c1",
        runtimeId: "rt1",
        status: "failed",
      };
      taskQ.failTask.mockResolvedValue(task);
      taskQ.countRunningTasks.mockResolvedValue(0);
      agentQ.updateAgentStatus.mockResolvedValue(undefined);
      // Lookup throws — must not block the task lifecycle.
      runtimeQ.getAgentRuntime.mockRejectedValue(new Error("db down"));

      await expect(service.failTask("t1", "w1", "boom")).resolves.toBeTruthy();

      expect(messageQ.createMessage).toHaveBeenCalledWith({}, {
        conversationId: "c1",
        role: "assistant",
        content: "boom",
        taskId: "t1",
        metadata: JSON.stringify({ error_source: "runtime", provider: null }),
      });
      expect(agentQ.updateAgentStatus).toHaveBeenCalled();
    });

    it("attributes with provider:null when the task has no runtimeId", async () => {
      const task = {
        id: "t1",
        agentId: "a1",
        workspaceId: "w1",
        conversationId: "c1",
        status: "failed",
      };
      taskQ.failTask.mockResolvedValue(task);
      taskQ.countRunningTasks.mockResolvedValue(0);
      agentQ.updateAgentStatus.mockResolvedValue(undefined);

      await service.failTask("t1", "w1", "something went wrong");

      expect(runtimeQ.getAgentRuntime).not.toHaveBeenCalled();
      expect(messageQ.createMessage).toHaveBeenCalledWith({}, {
        conversationId: "c1",
        role: "assistant",
        content: "something went wrong",
        taskId: "t1",
        metadata: JSON.stringify({ error_source: "runtime", provider: null }),
      });
    });

    it("does not create message when error is empty", async () => {
      const task = {
        id: "t1",
        agentId: "a1",
        workspaceId: "w1",
        conversationId: "c1",
        status: "failed",
      };
      taskQ.failTask.mockResolvedValue(task);
      taskQ.countRunningTasks.mockResolvedValue(0);
      agentQ.updateAgentStatus.mockResolvedValue(undefined);

      await service.failTask("t1", "w1", "");

      expect(messageQ.createMessage).not.toHaveBeenCalled();
    });

    it("failTask_emptyError_noAutoMessage_stillQueuesCommentRetry", async () => {
      // Bug-fix audit: failTask's own error-attribution branch only creates a
      // message when `error` is truthy — an empty-string fail (allowed by
      // FailTaskRequestSchema) is just as silent as a no-message complete.
      // The backstop must catch this path too, not just completeTask's.
      const task = {
        id: "t1",
        agentId: "a1",
        workspaceId: "w1",
        conversationId: "c1",
        type: "user_dm_message",
        status: "failed",
      };
      taskQ.failTask.mockResolvedValue(task);
      taskQ.countRunningTasks.mockResolvedValue(0);
      agentQ.updateAgentStatus.mockResolvedValue(undefined);
      messageQ.hasMessageForTask.mockResolvedValue(false);
      taskQ.setCommentStatus.mockResolvedValue({ id: "t1", commentStatus: "retry_queued" });
      agentQ.getAgent.mockResolvedValue({ id: "a1", runtimeId: "rt1" });
      taskQ.createTask.mockResolvedValue({ id: "t2", agentId: "a1", runtimeId: "rt1", workspaceId: "w1", conversationId: "c1" });

      const result = await service.failTask("t1", "w1", "");

      // Empty error only tells us failTask itself didn't create a message —
      // the agent may have already posted one earlier via send-dm, so this
      // must still query rather than assume silence.
      expect(messageQ.hasMessageForTask).toHaveBeenCalledWith({}, "t1");
      expect(taskQ.setCommentStatus).toHaveBeenCalledWith({}, "t1", "w1", "retry_queued", expect.any(String));
      expect(result.commentStatus).toBe("retry_queued");
    });

    it("failTask_emptyError_priorSendDmExists_doesNotRetry", async () => {
      // The agent DM'd earlier in the run, then failed with an empty error
      // string (e.g. a clean early-exit). knownHasComment must NOT
      // short-circuit this to "no comment" — it has to actually check.
      const task = {
        id: "t1",
        agentId: "a1",
        workspaceId: "w1",
        conversationId: "c1",
        type: "user_dm_message",
        status: "failed",
      };
      taskQ.failTask.mockResolvedValue(task);
      taskQ.countRunningTasks.mockResolvedValue(0);
      agentQ.updateAgentStatus.mockResolvedValue(undefined);
      messageQ.hasMessageForTask.mockResolvedValue(true);
      taskQ.setCommentStatus.mockResolvedValue({ id: "t1", commentStatus: "satisfied" });

      const result = await service.failTask("t1", "w1", "");

      expect(messageQ.hasMessageForTask).toHaveBeenCalledWith({}, "t1");
      expect(taskQ.setCommentStatus).toHaveBeenCalledWith({}, "t1", "w1", "satisfied");
      expect(taskQ.createTask).not.toHaveBeenCalled();
      expect(result.commentStatus).toBe("satisfied");
    });

    it("calls reconcileAgentStatus", async () => {
      const task = {
        id: "t1",
        agentId: "a1",
        workspaceId: "w1",
        conversationId: "c1",
        status: "failed",
      };
      taskQ.failTask.mockResolvedValue(task);
      taskQ.countRunningTasks.mockResolvedValue(2);
      agentQ.updateAgentStatus.mockResolvedValue(undefined);

      await service.failTask("t1", "w1", "err");

      expect(agentQ.updateAgentStatus).toHaveBeenCalledWith(
        {},
        "a1",
        "w1",
        "working"
      );
    });

    it("moves issue tasks to failed when they fail", async () => {
      const task = {
        id: "t1",
        agentId: "a1",
        workspaceId: "w1",
        conversationId: "c1",
        type: "issue_event",
        contextKey: "iss_1",
        status: "failed",
      };
      taskQ.failTask.mockResolvedValue(task);
      taskQ.countRunningTasks.mockResolvedValue(0);
      agentQ.updateAgentStatus.mockResolvedValue(undefined);
      issueQ.getIssueByConversation.mockResolvedValue({ id: "iss_1", status: "in_progress", conversationId: "c1" });
      issueQ.updateIssue.mockResolvedValue({ id: "iss_1", status: "failed", conversationId: "c1" });
      const eventMsg = { id: "m1", conversationId: "c1", role: "event", content: "Issue status changed: in_progress -> failed" };
      messageQ.createMessage.mockResolvedValueOnce(undefined).mockResolvedValueOnce(eventMsg);
      conversationQ.getConversation.mockResolvedValue({ id: "c1", userId: "u1", workspaceId: "w1" });

      await service.failTask("t1", "w1", "something went wrong");

      expect(issueQ.updateIssue).toHaveBeenCalledWith({}, "iss_1", "w1", { status: "failed" });
      expect(messageQ.createMessage).toHaveBeenCalledWith({}, {
        conversationId: "c1",
        role: "assistant",
        content: "something went wrong",
        taskId: "t1",
        metadata: JSON.stringify({ error_source: "runtime", provider: null }),
      });
      expect(messageQ.createMessage).toHaveBeenCalledWith({}, {
        conversationId: "c1",
        role: "event",
        content: "Issue status changed: in_progress -> failed",
        taskId: "t1",
        metadata: JSON.stringify({ issueId: "iss_1" }),
      });
      expect(broadcastToUser).toHaveBeenCalledWith("u1", expect.objectContaining({
        type: "conversation.message",
        conversationId: "c1",
        message: eventMsg,
      }));
    });
  });

  // ── reconcileAgentStatus ─────────────────────────────────────────

  describe("reconcileAgentStatus", () => {
    it("sets working when running tasks > 0", async () => {
      taskQ.countRunningTasks.mockResolvedValue(3);
      agentQ.updateAgentStatus.mockResolvedValue(undefined);

      await service.reconcileAgentStatus("a1", "w1");

      expect(agentQ.updateAgentStatus).toHaveBeenCalledWith(
        {},
        "a1",
        "w1",
        "working"
      );
    });

    it("sets idle when running tasks = 0", async () => {
      taskQ.countRunningTasks.mockResolvedValue(0);
      agentQ.updateAgentStatus.mockResolvedValue(undefined);

      await service.reconcileAgentStatus("a1", "w1");

      expect(agentQ.updateAgentStatus).toHaveBeenCalledWith(
        {},
        "a1",
        "w1",
        "idle"
      );
    });
  });

  // ── failTask creates a runtime-error assistant message (TC6) ────

  describe("failTask runtime-error message", () => {
    it("creates a role=assistant message with metadata.error_source=runtime + provider", async () => {
      const task = {
        id: "t1",
        agentId: "a1",
        workspaceId: "w1",
        conversationId: "c1",
        status: "failed",
        runtimeId: "r1",
      };
      taskQ.failTask.mockResolvedValue(task);
      taskQ.countRunningTasks.mockResolvedValue(0);
      agentQ.updateAgentStatus.mockResolvedValue(undefined);
      runtimeQ.getAgentRuntime.mockResolvedValue({ provider: "claude_code" });

      await service.failTask("t1", "w1", "boom");

      expect(messageQ.createMessage).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          conversationId: "c1",
          role: "assistant",
          content: "boom",
          taskId: "t1",
          metadata: JSON.stringify({ error_source: "runtime", provider: "claude_code" }),
        })
      );
    });
  });

  // ── failTask skips side-effects for kill_task ──────────────────

  describe("failTask kill_task guard", () => {
    it("skips message creation and reconciliation for kill_task type", async () => {
      const task = {
        id: "kt1",
        agentId: "a1",
        workspaceId: "w1",
        conversationId: "c1",
        status: "failed",
        type: "kill_task",
      };
      taskQ.failTask.mockResolvedValue(task);

      const result = await service.failTask("kt1", "w1", "killed");

      expect(result).toEqual(task);
      expect(messageQ.createMessage).not.toHaveBeenCalled();
      expect(taskQ.countRunningTasks).not.toHaveBeenCalled();
      expect(agentQ.updateAgentStatus).not.toHaveBeenCalled();
    });
  });

  // ── cancelActiveTask ─────────────────────────────────────────

  describe("cancelActiveTask", () => {
    it("returns null when no active task", async () => {
      taskQ.getActiveTaskByConversation.mockResolvedValue(null);

      const result = await service.cancelActiveTask("c1", "w1");
      expect(result).toBeNull();
    });

    it("cancels queued task without creating kill_task", async () => {
      const task = { id: "t1", status: "queued", agentId: "a1", runtimeId: "r1", conversationId: "c1" };
      taskQ.getActiveTaskByConversation.mockResolvedValue(task);
      taskQ.cancelTask.mockResolvedValue({ ...task, status: "cancelled" });
      taskQ.countRunningTasks.mockResolvedValue(0);

      const result = await service.cancelActiveTask("c1", "w1");

      expect(result!.status).toBe("cancelled");
      expect(taskQ.createTask).not.toHaveBeenCalled();
      expect(messageQ.createMessage).toHaveBeenCalledWith({}, expect.objectContaining({
        content: "Task cancelled by you",
        taskId: "t1",
        // Stamped as a lifecycle note so the chat renders it as a centered
        // system line, not an agent bubble.
        metadata: JSON.stringify({ kind: "lifecycle" }),
      }));
    });

    it("creates kill_task for running task", async () => {
      const task = { id: "t1", status: "running", agentId: "a1", runtimeId: "r1", conversationId: "c1" };
      taskQ.getActiveTaskByConversation.mockResolvedValue(task);
      taskQ.cancelTask.mockResolvedValue({ ...task, status: "cancelled" });
      taskQ.createTask.mockResolvedValue({ id: "kt1" });
      taskQ.countRunningTasks.mockResolvedValue(0);
      runtimeQ.getAgentRuntime.mockResolvedValue({ daemonId: "d1" });

      await service.cancelActiveTask("c1", "w1");

      expect(taskQ.createTask).toHaveBeenCalledWith({}, expect.objectContaining({
        type: "kill_task",
        agentId: "a1",
        runtimeId: "r1",
        conversationId: "c1",
        context: { target_task_id: "t1" },
      }));
    });

    it("pushes daemon.kill for running task", async () => {
      const task = { id: "t1", status: "running", agentId: "a1", runtimeId: "r1", conversationId: "c1" };
      taskQ.getActiveTaskByConversation.mockResolvedValue(task);
      taskQ.cancelTask.mockResolvedValue({ ...task, status: "cancelled" });
      taskQ.createTask.mockResolvedValue({ id: "kt1" });
      taskQ.countRunningTasks.mockResolvedValue(0);
      runtimeQ.getAgentRuntime.mockResolvedValue({ daemonId: "d1" });

      await service.cancelActiveTask("c1", "w1");

      expect(broadcastToDaemon).toHaveBeenCalledWith("d1", {
        type: "daemon.kill",
        workspaceId: "w1",
        agentId: "a1",
        taskId: "kt1",
        targetTaskId: "t1",
      });
    });

    it("pushes daemon.kill for dispatched task", async () => {
      const task = { id: "t1", status: "dispatched", agentId: "a1", runtimeId: "r1", conversationId: "c1" };
      taskQ.getActiveTaskByConversation.mockResolvedValue(task);
      taskQ.cancelTask.mockResolvedValue({ ...task, status: "cancelled" });
      taskQ.createTask.mockResolvedValue({ id: "kt1" });
      taskQ.countRunningTasks.mockResolvedValue(0);
      runtimeQ.getAgentRuntime.mockResolvedValue({ daemonId: "d1" });

      await service.cancelActiveTask("c1", "w1");

      expect(broadcastToDaemon).toHaveBeenCalledWith("d1", expect.objectContaining({
        type: "daemon.kill",
        targetTaskId: "t1",
      }));
    });

    it("does not push daemon.kill for queued task", async () => {
      const task = { id: "t1", status: "queued", agentId: "a1", runtimeId: "r1", conversationId: "c1" };
      taskQ.getActiveTaskByConversation.mockResolvedValue(task);
      taskQ.cancelTask.mockResolvedValue({ ...task, status: "cancelled" });
      taskQ.countRunningTasks.mockResolvedValue(0);

      await service.cancelActiveTask("c1", "w1");

      expect(broadcastToDaemon).not.toHaveBeenCalled();
    });

    it("creates kill_task for dispatched task", async () => {
      const task = { id: "t1", status: "dispatched", agentId: "a1", runtimeId: "r1", conversationId: "c1" };
      taskQ.getActiveTaskByConversation.mockResolvedValue(task);
      taskQ.cancelTask.mockResolvedValue({ ...task, status: "cancelled" });
      taskQ.createTask.mockResolvedValue({ id: "kt1" });
      taskQ.countRunningTasks.mockResolvedValue(0);
      runtimeQ.getAgentRuntime.mockResolvedValue({ daemonId: "d1" });

      await service.cancelActiveTask("c1", "w1");

      expect(taskQ.createTask).toHaveBeenCalledWith({}, expect.objectContaining({
        type: "kill_task",
        context: { target_task_id: "t1" },
      }));
    });

    it("daemon.kill payload includes agentId from active task", async () => {
      const task = { id: "t1", status: "running", agentId: "agent_xyz", runtimeId: "r1", conversationId: "c1" };
      taskQ.getActiveTaskByConversation.mockResolvedValue(task);
      taskQ.cancelTask.mockResolvedValue({ ...task, status: "cancelled" });
      taskQ.createTask.mockResolvedValue({ id: "kt1" });
      taskQ.countRunningTasks.mockResolvedValue(0);
      runtimeQ.getAgentRuntime.mockResolvedValue({ daemonId: "d1" });

      await service.cancelActiveTask("c1", "w1");

      expect(broadcastToDaemon).toHaveBeenCalledWith("d1", expect.objectContaining({
        agentId: "agent_xyz",
      }));
    });

    it("logs warning when daemon.kill broadcast fails", async () => {
      const task = { id: "t1", status: "running", agentId: "a1", runtimeId: "r1", conversationId: "c1" };
      taskQ.getActiveTaskByConversation.mockResolvedValue(task);
      taskQ.cancelTask.mockResolvedValue({ ...task, status: "cancelled" });
      taskQ.createTask.mockResolvedValue({ id: "kt1" });
      taskQ.countRunningTasks.mockResolvedValue(0);
      runtimeQ.getAgentRuntime.mockResolvedValue({ daemonId: "d1" });

      const broadcastError = new Error("connection refused");
      vi.mocked(broadcastToDaemon).mockRejectedValueOnce(broadcastError);

      await service.cancelActiveTask("c1", "w1");

      await vi.waitFor(() => {
        expect(log.warn).toHaveBeenCalledWith(
          "daemon.kill broadcast failed, relying on poll fallback",
          broadcastError,
        );
      });
    });

    it("dispatches kill task before broadcasting daemon.kill", async () => {
      const task = { id: "t1", status: "running", agentId: "a1", runtimeId: "r1", conversationId: "c1" };
      taskQ.getActiveTaskByConversation.mockResolvedValue(task);
      taskQ.cancelTask.mockResolvedValue({ ...task, status: "cancelled" });
      taskQ.createTask.mockResolvedValue({ id: "kt1" });
      taskQ.countRunningTasks.mockResolvedValue(0);
      runtimeQ.getAgentRuntime.mockResolvedValue({ daemonId: "d1" });

      await service.cancelActiveTask("c1", "w1");

      expect(taskQ.dispatchTaskById).toHaveBeenCalledWith({}, "kt1", "w1");
      // dispatchTaskById should be called before broadcastToDaemon
      const dispatchOrder = taskQ.dispatchTaskById.mock.invocationCallOrder[0];
      const broadcastOrder = vi.mocked(broadcastToDaemon).mock.invocationCallOrder[0];
      expect(dispatchOrder).toBeLessThan(broadcastOrder);
    });
  });

  // ── retryTask ──────────────────────────────────────────────

  describe("retryTask", () => {
    const failedTask = {
      id: "t1",
      agentId: "a1",
      workspaceId: "w1",
      conversationId: "c1",
      prompt: "do stuff",
      type: "user_dm_message",
      status: "failed",
      context: null,
    };

    it("throws when task not found", async () => {
      taskQ.getTask.mockResolvedValue(null);

      await expect(service.retryTask("t1", "w1")).rejects.toThrow("task not found");
    });

    it("throws when workspace mismatch", async () => {
      taskQ.getTask.mockResolvedValue({ ...failedTask, workspaceId: "other" });

      await expect(service.retryTask("t1", "w1")).rejects.toThrow("task not found");
    });

    it("throws when task is not failed", async () => {
      taskQ.getTask.mockResolvedValue({ ...failedTask, status: "completed" });

      await expect(service.retryTask("t1", "w1")).rejects.toThrow("only failed tasks can be retried");
    });

    it("marks old task as superseded and creates new task", async () => {
      taskQ.getTask.mockResolvedValue(failedTask);
      taskQ.markFailedAsSuperseded.mockResolvedValue({ ...failedTask, status: "superseded" });
      agentQ.getAgent.mockResolvedValue({ id: "a1", runtimeId: "r1" });
      taskQ.createTask.mockResolvedValue({ id: "t2", status: "queued" });

      const { oldTask, newTask } = await service.retryTask("t1", "w1");

      expect(taskQ.markFailedAsSuperseded).toHaveBeenCalledWith({}, "t1", "w1");
      expect(taskQ.createTask).toHaveBeenCalledWith({}, expect.objectContaining({
        agentId: "a1",
        conversationId: "c1",
        workspaceId: "w1",
        prompt: "do stuff",
        type: "user_dm_message",
      }));
      expect(oldTask.status).toBe("superseded");
      expect(newTask.status).toBe("queued");
    });

    it("throws when markFailedAsSuperseded fails", async () => {
      taskQ.getTask.mockResolvedValue(failedTask);
      taskQ.markFailedAsSuperseded.mockResolvedValue(null);

      await expect(service.retryTask("t1", "w1")).rejects.toThrow("failed to mark task as superseded");
    });

    it("preserves context from original task", async () => {
      const taskWithContext = { ...failedTask, context: { attachment_ids: ["a1"] } };
      taskQ.getTask.mockResolvedValue(taskWithContext);
      taskQ.markFailedAsSuperseded.mockResolvedValue({ ...taskWithContext, status: "superseded" });
      agentQ.getAgent.mockResolvedValue({ id: "a1", runtimeId: "r1" });
      taskQ.createTask.mockResolvedValue({ id: "t2", status: "queued" });

      await service.retryTask("t1", "w1");

      expect(taskQ.createTask).toHaveBeenCalledWith({}, expect.objectContaining({
        context: { attachment_ids: ["a1"] },
      }));
    });

    it("propagates contextKey from original task", async () => {
      const taskWithKey = { ...failedTask, contextKey: "c1" };
      taskQ.getTask.mockResolvedValue(taskWithKey);
      taskQ.markFailedAsSuperseded.mockResolvedValue({ ...taskWithKey, status: "superseded" });
      agentQ.getAgent.mockResolvedValue({ id: "a1", runtimeId: "r1" });
      taskQ.createTask.mockResolvedValue({ id: "t2", status: "queued" });

      await service.retryTask("t1", "w1");

      expect(taskQ.createTask).toHaveBeenCalledWith({}, expect.objectContaining({
        contextKey: "c1",
      }));
    });

    it("handles original task with contextKey: null gracefully", async () => {
      const taskNoKey = { ...failedTask, contextKey: null };
      taskQ.getTask.mockResolvedValue(taskNoKey);
      taskQ.markFailedAsSuperseded.mockResolvedValue({ ...taskNoKey, status: "superseded" });
      agentQ.getAgent.mockResolvedValue({ id: "a1", runtimeId: "r1" });
      taskQ.createTask.mockResolvedValue({ id: "t2", status: "queued" });

      await service.retryTask("t1", "w1");

      expect(taskQ.createTask).toHaveBeenCalledWith({}, expect.objectContaining({
        contextKey: null,
      }));
    });
  });

  // ── claimTasksForRuntimes with kill_tasks ───────────────────

  describe("claimTasksForRuntimes with kill_tasks", () => {
    it("claims kill_tasks before normal tasks", async () => {
      const killTask = { id: "kt1", agentId: "a1", runtimeId: "r1", workspaceId: "w1", type: "kill_task" };
      taskQ.claimKillTasks.mockResolvedValue([killTask]);
      taskQ.listPendingTasksByRuntimes.mockResolvedValue([]);

      const result = await service.claimTasksForRuntimes(["r1"], 2, "w1");

      expect(result).toEqual([killTask]);
      expect(taskQ.claimKillTasks).toHaveBeenCalledWith({}, ["r1"], "w1", 2);
    });

    it("subtracts kill_tasks from remaining capacity", async () => {
      const killTask = { id: "kt1", agentId: "a1", runtimeId: "r1", workspaceId: "w1", type: "kill_task" };
      taskQ.claimKillTasks.mockResolvedValue([killTask]);
      taskQ.listPendingTasksByRuntimes.mockResolvedValue([
        { agentId: "a2", workspaceId: "w1", id: "t2", runtimeId: "r1" },
      ]);
      agentQ.getAgent.mockResolvedValue({ id: "a2", maxConcurrentTasks: 5 });
      taskQ.countRunningTasks.mockResolvedValue(0);
      taskQ.claimTask.mockResolvedValue({ id: "t2", agentId: "a2", runtimeId: "r1" });

      const result = await service.claimTasksForRuntimes(["r1"], 1, "w1");

      // Only the kill_task — maxTasks=1 is fully consumed
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("kt1");
    });
  });
});
