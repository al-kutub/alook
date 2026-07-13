import { eq, and, gte, sql, inArray } from "drizzle-orm";
import { costEvent } from "../schema";
import type { Database } from "../index";

export async function createCostEvent(
  db: Database,
  data: {
    workspaceId: string;
    agentId: string;
    taskId?: string | null;
    provider?: string | null;
    model?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    costCents?: number | null;
  }
) {
  const rows = await db
    .insert(costEvent)
    .values({
      workspaceId: data.workspaceId,
      agentId: data.agentId,
      taskId: data.taskId ?? null,
      provider: data.provider ?? null,
      model: data.model ?? null,
      inputTokens: data.inputTokens ?? null,
      outputTokens: data.outputTokens ?? null,
      costCents: data.costCents ?? null,
    })
    .returning();
  return rows[0]!;
}

/** Start of the current calendar month in UTC, as an ISO string — matches
 * the ISO-string `created_at` convention used everywhere else in this
 * schema, so a plain lexicographic `>=` comparison works. */
export function currentMonthStartIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Live-computed monthly spend for one agent (SUM of cost_cents for the
 * current calendar month; null cost_cents rows count as 0). No stored
 * counter, no reset/staleness logic. */
export async function getMonthlySpentCents(
  db: Database,
  agentId: string,
  workspaceId: string,
  monthStartIso: string = currentMonthStartIso()
): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`COALESCE(SUM(${costEvent.costCents}), 0)` })
    .from(costEvent)
    .where(
      and(
        eq(costEvent.agentId, agentId),
        eq(costEvent.workspaceId, workspaceId),
        gte(costEvent.createdAt, monthStartIso)
      )
    );
  return Number(rows[0]?.total ?? 0);
}

/** Batched version for list endpoints — one query, grouped by agent. */
export async function getMonthlySpentCentsByAgentIds(
  db: Database,
  agentIds: string[],
  workspaceId: string,
  monthStartIso: string = currentMonthStartIso()
): Promise<Map<string, number>> {
  if (agentIds.length === 0) return new Map();
  const rows = await db
    .select({
      agentId: costEvent.agentId,
      total: sql<number>`COALESCE(SUM(${costEvent.costCents}), 0)`,
    })
    .from(costEvent)
    .where(
      and(
        eq(costEvent.workspaceId, workspaceId),
        inArray(costEvent.agentId, agentIds),
        gte(costEvent.createdAt, monthStartIso)
      )
    )
    .groupBy(costEvent.agentId);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.agentId, Number(r.total ?? 0));
  return map;
}
