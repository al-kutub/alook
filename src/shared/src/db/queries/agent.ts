import { eq, and, desc, or, exists, inArray, isNull, sql } from "drizzle-orm";
import { agent, agentAccess } from "../schema";
import type { Database } from "../index";

export async function getAgent(db: Database, id: string, workspaceId: string, userId?: string) {
  const rows = await db
    .select()
    .from(agent)
    .where(and(eq(agent.id, id), eq(agent.workspaceId, workspaceId)));
  const row = rows[0] ?? null;
  if (!row || !userId) return row;
  if (row.visibility === "public" || row.ownerId === userId) return row;
  const access = await db
    .select({ id: agentAccess.id })
    .from(agentAccess)
    .where(and(eq(agentAccess.agentId, id), eq(agentAccess.workspaceId, workspaceId), eq(agentAccess.userId, userId)));
  return access.length > 0 ? row : null;
}

export async function listAgents(db: Database, workspaceId: string, userId?: string) {
  if (!userId) {
    return db.select().from(agent).where(eq(agent.workspaceId, workspaceId)).orderBy(desc(agent.createdAt));
  }
  return db
    .select()
    .from(agent)
    .where(
      and(
        eq(agent.workspaceId, workspaceId),
        or(
          eq(agent.visibility, "public"),
          eq(agent.ownerId, userId),
          exists(
            db.select({ id: agentAccess.id }).from(agentAccess).where(
              and(
                eq(agentAccess.agentId, agent.id),
                eq(agentAccess.workspaceId, agent.workspaceId),
                eq(agentAccess.userId, userId)
              )
            )
          )
        )
      )
    )
    .orderBy(desc(agent.createdAt));
}

export async function createAgent(
  db: Database,
  data: {
    workspaceId: string;
    name: string;
    description?: string;
    instructions?: string;
    avatarUrl?: string | null;
    runtimeId?: string | null;
    runtimeMode?: string;
    runtimeConfig?: unknown;
    visibility?: string;
    maxConcurrentTasks?: number;
    ownerId?: string | null;
    tools?: unknown;
    triggers?: unknown;
    emailHandle?: string | null;
    heartbeatEnabled?: boolean;
    heartbeatIntervalSeconds?: number;
  }
) {
  const rows = await db
    .insert(agent)
    .values({
      workspaceId: data.workspaceId,
      name: data.name,
      runtimeId: data.runtimeId ?? null,
      description: data.description ?? "",
      instructions: data.instructions ?? "",
      avatarUrl: data.avatarUrl ?? null,
      runtimeMode: data.runtimeMode ?? "local",
      runtimeConfig: data.runtimeConfig ?? null,
      visibility: data.visibility ?? "private",
      maxConcurrentTasks: data.maxConcurrentTasks ?? 6,
      ownerId: data.ownerId ?? null,
      tools: data.tools ?? null,
      triggers: data.triggers ?? null,
      emailHandle: data.emailHandle ?? null,
      ...(data.heartbeatEnabled !== undefined ? { heartbeatEnabled: data.heartbeatEnabled } : {}),
      ...(data.heartbeatIntervalSeconds !== undefined ? { heartbeatIntervalSeconds: data.heartbeatIntervalSeconds } : {}),
    })
    .returning();
  return rows[0]!;
}

export async function deleteAgent(
  db: Database,
  id: string,
  workspaceId: string,
  ownerId?: string
) {
  const conditions = [eq(agent.id, id), eq(agent.workspaceId, workspaceId)];
  if (ownerId) conditions.push(eq(agent.ownerId, ownerId));
  const rows = await db
    .delete(agent)
    .where(and(...conditions))
    .returning();
  return rows[0] ?? null;
}

export async function updateAgent(
  db: Database,
  id: string,
  workspaceId: string,
  data: {
    name?: string;
    description?: string;
    instructions?: string;
    runtimeId?: string | null;
    runtimeConfig?: unknown;
    visibility?: string;
    avatarUrl?: string | null;
    heartbeatEnabled?: boolean;
    heartbeatIntervalSeconds?: number;
    budgetMonthlyCents?: number | null;
    pausedReason?: string | null;
    reportsTo?: string | null;
  },
  ownerId?: string
) {
  const conditions = [eq(agent.id, id), eq(agent.workspaceId, workspaceId)];
  if (ownerId) conditions.push(eq(agent.ownerId, ownerId));
  const rows = await db
    .update(agent)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(and(...conditions))
    .returning();
  return rows[0] ?? null;
}

export async function updateAgentHeartbeatFired(
  db: Database,
  id: string,
  workspaceId: string,
  firedAt: string
) {
  const rows = await db
    .update(agent)
    .set({ lastHeartbeatAt: firedAt })
    .where(and(eq(agent.id, id), eq(agent.workspaceId, workspaceId)))
    .returning();
  return rows[0] ?? null;
}

export async function getAgentsDueForHeartbeat(db: Database, workspaceId: string) {
  const now = new Date().toISOString();
  return db
    .select()
    .from(agent)
    .where(
      and(
        eq(agent.workspaceId, workspaceId),
        eq(agent.heartbeatEnabled, true),
        or(
          isNull(agent.lastHeartbeatAt),
          sql`(unixepoch(${now}) - unixepoch(${agent.lastHeartbeatAt})) >= ${agent.heartbeatIntervalSeconds}`
        )
      )
    );
}

export async function updateAgentStatus(
  db: Database,
  id: string,
  workspaceId: string,
  status: string
) {
  const rows = await db
    .update(agent)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(and(eq(agent.id, id), eq(agent.workspaceId, workspaceId)))
    .returning();
  return rows[0] ?? null;
}

export async function getAgentByHandle(db: Database, emailHandle: string) {
  const rows = await db
    .select()
    .from(agent)
    .where(eq(agent.emailHandle, emailHandle));
  return rows[0] ?? null;
}

export async function getExistingHandles(db: Database, handles: string[]) {
  if (handles.length === 0) return [];
  const rows = await db
    .select({ emailHandle: agent.emailHandle })
    .from(agent)
    .where(inArray(agent.emailHandle, handles));
  return rows.map((r) => r.emailHandle).filter(Boolean) as string[];
}

export async function getAgentsByIds(db: Database, ids: string[], workspaceId: string) {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(agent)
    .where(and(inArray(agent.id, ids), eq(agent.workspaceId, workspaceId)));
}

export async function getAllAgentsForWorkspace(db: Database, workspaceId: string) {
  return db.select().from(agent).where(eq(agent.workspaceId, workspaceId)).orderBy(desc(agent.createdAt));
}

export async function getAllHandlesForWorkspace(db: Database, workspaceId: string) {
  return db
    .select({ id: agent.id, emailHandle: agent.emailHandle })
    .from(agent)
    .where(eq(agent.workspaceId, workspaceId));
}

// ── Enforced org hierarchy ───────────────────────────────────────────────
// See 0063_agent_org_hierarchy.sql. reportsTo is a strict single-parent
// tree, distinct from agent_link (a free-form collaboration graph).

export interface OrgChartNode {
  id: string;
  name: string;
  reportsTo: string | null;
  status: string;
}

/** Flat list of every agent in the workspace with id/name/reportsTo/status
 * — enough for a caller to build the tree client-side. A "chart" query
 * (rather than a tree-shaped one) keeps this cheap and lets the caller
 * decide how to render orphaned/cyclic edges if the data is ever
 * inconsistent (shouldn't happen given updateAgent's cycle guard, but a
 * flat list degrades gracefully either way). */
export async function getOrgChart(db: Database, workspaceId: string): Promise<OrgChartNode[]> {
  const rows = await db
    .select({ id: agent.id, name: agent.name, reportsTo: agent.reportsTo, status: agent.status })
    .from(agent)
    .where(eq(agent.workspaceId, workspaceId));
  return rows;
}

/** Walks reportsTo from `agentId` up to the root (the agent with
 * reportsTo = null), returning the chain of managers (NOT including
 * `agentId` itself), closest manager first. Used for escalation. Bounded
 * by the workspace's total agent count so a data-integrity bug (a cycle
 * that somehow got past updateAgent's guard) can't loop forever. */
export async function getChainOfCommand(db: Database, agentId: string, workspaceId: string): Promise<OrgChartNode[]> {
  const chart = await getOrgChart(db, workspaceId);
  const byId = new Map(chart.map((a) => [a.id, a]));
  const chain: OrgChartNode[] = [];
  const visited = new Set<string>([agentId]);
  let current = byId.get(agentId)?.reportsTo ?? null;
  while (current && !visited.has(current) && chain.length < chart.length) {
    const manager = byId.get(current);
    if (!manager) break;
    chain.push(manager);
    visited.add(manager.id);
    current = manager.reportsTo;
  }
  return chain;
}

/** True if setting `agentId`'s manager to `candidateManagerId` would
 * create a cycle (i.e. `agentId` is already an ancestor of
 * `candidateManagerId`, or they're the same agent). Call BEFORE
 * persisting a reportsTo change — see PATCH /api/agents/{id}. */
export async function wouldCreateCycle(
  db: Database,
  agentId: string,
  candidateManagerId: string,
  workspaceId: string
): Promise<boolean> {
  if (agentId === candidateManagerId) return true;
  const chainOfCandidate = await getChainOfCommand(db, candidateManagerId, workspaceId);
  return chainOfCandidate.some((a) => a.id === agentId);
}
