import { eq, and, desc } from "drizzle-orm";
import { companyGoal, goalStrategy } from "../schema";
import type { Database } from "../index";
import { GoalStatus, GoalStrategyStatus } from "../../constants";

export async function createGoal(
  db: Database,
  data: { workspaceId: string; title: string; description?: string; createdByUserId: string }
) {
  const rows = await db
    .insert(companyGoal)
    .values({
      workspaceId: data.workspaceId,
      title: data.title,
      description: data.description ?? "",
      createdByUserId: data.createdByUserId,
    })
    .returning();
  return rows[0]!;
}

export async function listGoals(db: Database, workspaceId: string) {
  return db
    .select()
    .from(companyGoal)
    .where(eq(companyGoal.workspaceId, workspaceId))
    .orderBy(desc(companyGoal.createdAt));
}

export async function getGoal(db: Database, goalId: string, workspaceId: string) {
  const rows = await db
    .select()
    .from(companyGoal)
    .where(and(eq(companyGoal.id, goalId), eq(companyGoal.workspaceId, workspaceId)));
  return rows[0] ?? null;
}

export async function updateGoalStatus(db: Database, goalId: string, workspaceId: string, status: string) {
  const rows = await db
    .update(companyGoal)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(and(eq(companyGoal.id, goalId), eq(companyGoal.workspaceId, workspaceId)))
    .returning();
  return rows[0] ?? null;
}

export async function createStrategy(
  db: Database,
  data: { goalId: string; workspaceId: string; proposedByAgentId: string; content: string }
) {
  const rows = await db
    .insert(goalStrategy)
    .values({
      goalId: data.goalId,
      workspaceId: data.workspaceId,
      proposedByAgentId: data.proposedByAgentId,
      content: data.content,
    })
    .returning();
  return rows[0]!;
}

/** The most recent strategy proposal for a goal, regardless of status —
 * this is what a decision acts on and what the heartbeat nudge inspects. */
export async function getLatestStrategyForGoal(db: Database, goalId: string, workspaceId: string) {
  const rows = await db
    .select()
    .from(goalStrategy)
    .where(and(eq(goalStrategy.goalId, goalId), eq(goalStrategy.workspaceId, workspaceId)))
    .orderBy(desc(goalStrategy.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getStrategy(db: Database, strategyId: string, workspaceId: string) {
  const rows = await db
    .select()
    .from(goalStrategy)
    .where(and(eq(goalStrategy.id, strategyId), eq(goalStrategy.workspaceId, workspaceId)));
  return rows[0] ?? null;
}

export async function decideStrategy(
  db: Database,
  strategyId: string,
  workspaceId: string,
  data: { status: string; decidedByUserId: string; decisionComment: string }
) {
  const rows = await db
    .update(goalStrategy)
    .set({
      status: data.status,
      decidedByUserId: data.decidedByUserId,
      decisionComment: data.decisionComment,
      decidedAt: new Date().toISOString(),
    })
    .where(and(eq(goalStrategy.id, strategyId), eq(goalStrategy.workspaceId, workspaceId)))
    .returning();
  return rows[0] ?? null;
}

/** True if the goal's latest strategy proposal is approved — the gate
 * TaskService.enqueueTask checks before allowing a task with this goal_id. */
export async function hasApprovedStrategy(db: Database, goalId: string, workspaceId: string): Promise<boolean> {
  const latest = await getLatestStrategyForGoal(db, goalId, workspaceId);
  return latest?.status === GoalStrategyStatus.APPROVED;
}

/** Active goals in a workspace with no strategy yet, or whose latest
 * strategy was rejected — what the heartbeat nudge surfaces to the CEO. */
export async function getGoalsNeedingStrategy(db: Database, workspaceId: string) {
  const goals = await db
    .select()
    .from(companyGoal)
    .where(and(eq(companyGoal.workspaceId, workspaceId), eq(companyGoal.status, GoalStatus.ACTIVE)));
  const needing: { goal: typeof goals[number]; reason: "no_strategy" | "rejected" }[] = [];
  for (const goal of goals) {
    const latest = await getLatestStrategyForGoal(db, goal.id, workspaceId);
    if (!latest) needing.push({ goal, reason: "no_strategy" });
    else if (latest.status === GoalStrategyStatus.REJECTED) needing.push({ goal, reason: "rejected" });
  }
  return needing;
}
