import { eq, and, desc } from "drizzle-orm";
import { taskExecutionDecision } from "../schema";
import type { Database } from "../index";

export async function createExecutionDecision(
  db: Database,
  data: {
    taskId: string;
    workspaceId: string;
    stageId: string;
    stageType: string;
    actorAgentId?: string | null;
    actorUserId?: string | null;
    outcome: string;
    body: string;
  }
) {
  const rows = await db
    .insert(taskExecutionDecision)
    .values({
      taskId: data.taskId,
      workspaceId: data.workspaceId,
      stageId: data.stageId,
      stageType: data.stageType,
      actorAgentId: data.actorAgentId ?? null,
      actorUserId: data.actorUserId ?? null,
      outcome: data.outcome,
      body: data.body,
    })
    .returning();
  return rows[0]!;
}

export async function listExecutionDecisions(db: Database, taskId: string, workspaceId: string) {
  return db
    .select()
    .from(taskExecutionDecision)
    .where(and(eq(taskExecutionDecision.taskId, taskId), eq(taskExecutionDecision.workspaceId, workspaceId)))
    .orderBy(desc(taskExecutionDecision.createdAt));
}
