import { eq, and, desc, inArray, count, countDistinct, max, notInArray } from "drizzle-orm";
import { product, issue } from "../schema";
import type { Database } from "../index";
import { TERMINAL_ISSUE_STATUSES } from "../../constants";

const UNSORTED_PRODUCT_NAME = "Unsorted";

export async function createProduct(
  db: Database,
  data: {
    workspaceId: string;
    name: string;
    description?: string;
    status?: string;
    createdByUserId?: string;
    createdByAgentId?: string;
  }
) {
  const rows = await db
    .insert(product)
    .values({
      workspaceId: data.workspaceId,
      name: data.name,
      description: data.description ?? "",
      status: data.status ?? "active",
      createdByUserId: data.createdByUserId ?? null,
      createdByAgentId: data.createdByAgentId ?? null,
    })
    .returning();
  return rows[0]!;
}

export async function listProducts(db: Database, workspaceId: string, status?: string) {
  const conditions = [eq(product.workspaceId, workspaceId)];
  if (status) conditions.push(eq(product.status, status));
  return db
    .select()
    .from(product)
    .where(and(...conditions))
    .orderBy(desc(product.updatedAt));
}

export async function getProduct(db: Database, id: string, workspaceId: string) {
  const rows = await db
    .select()
    .from(product)
    .where(and(eq(product.id, id), eq(product.workspaceId, workspaceId)));
  return rows[0] ?? null;
}

export async function updateProduct(
  db: Database,
  id: string,
  workspaceId: string,
  data: { name?: string; description?: string; status?: string }
) {
  const rows = await db
    .update(product)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(and(eq(product.id, id), eq(product.workspaceId, workspaceId)))
    .returning();
  return rows[0] ?? null;
}

/** Looks up the workspace's fallback "Unsorted" product, creating it if it
 * doesn't exist yet. Safe to call concurrently/repeatedly: a second racing
 * insert just produces a duplicate row (no unique constraint on name), which
 * a re-check-then-use pattern here tolerates by always re-querying and
 * preferring the earliest-created row rather than trusting the local insert
 * result blindly. */
export async function getOrCreateUnsortedProduct(db: Database, workspaceId: string) {
  const existing = await db
    .select()
    .from(product)
    .where(and(eq(product.workspaceId, workspaceId), eq(product.name, UNSORTED_PRODUCT_NAME)))
    .orderBy(product.createdAt)
    .limit(1);
  if (existing[0]) return existing[0];

  await createProduct(db, {
    workspaceId,
    name: UNSORTED_PRODUCT_NAME,
    description: "Auto-created fallback for untagged work",
  });

  const rows = await db
    .select()
    .from(product)
    .where(and(eq(product.workspaceId, workspaceId), eq(product.name, UNSORTED_PRODUCT_NAME)))
    .orderBy(product.createdAt)
    .limit(1);
  return rows[0]!;
}

export interface ProductDashboardStats {
  product: typeof product.$inferSelect;
  issueCountsByStatus: Record<string, number>;
  activeAgentCount: number;
  lastActivityAt: string | null;
}

/** Per-product dashboard stats for every product in a workspace: issue
 * counts by status, count of distinct agents with non-terminal issues, and
 * the most recent issue activity. Four queries total (products, status
 * counts, active-agent counts, last-activity), assembled in JS by
 * productId — mirrors listActiveTaskCountsByWorkspace's GROUP BY style
 * (queries/task.ts). */
export async function getProductDashboardStats(
  db: Database,
  workspaceId: string
): Promise<ProductDashboardStats[]> {
  const products = await db
    .select()
    .from(product)
    .where(eq(product.workspaceId, workspaceId))
    .orderBy(desc(product.updatedAt));

  if (products.length === 0) return [];

  const productIds = products.map((p) => p.id);

  const statusCountRows = await db
    .select({
      productId: issue.productId,
      status: issue.status,
      count: count(),
    })
    .from(issue)
    .where(and(eq(issue.workspaceId, workspaceId), inArray(issue.productId, productIds)))
    .groupBy(issue.productId, issue.status);

  const activeAgentRows = await db
    .select({
      productId: issue.productId,
      count: countDistinct(issue.agentId),
    })
    .from(issue)
    .where(
      and(
        eq(issue.workspaceId, workspaceId),
        inArray(issue.productId, productIds),
        notInArray(issue.status, [...TERMINAL_ISSUE_STATUSES])
      )
    )
    .groupBy(issue.productId);

  const lastActivityRows = await db
    .select({
      productId: issue.productId,
      lastActivityAt: max(issue.updatedAt),
    })
    .from(issue)
    .where(and(eq(issue.workspaceId, workspaceId), inArray(issue.productId, productIds)))
    .groupBy(issue.productId);

  const statusByProduct = new Map<string, Record<string, number>>();
  for (const row of statusCountRows) {
    if (!row.productId) continue;
    const entry = statusByProduct.get(row.productId) ?? {};
    entry[row.status] = Number(row.count);
    statusByProduct.set(row.productId, entry);
  }

  const activeAgentByProduct = new Map<string, number>();
  for (const row of activeAgentRows) {
    if (!row.productId) continue;
    activeAgentByProduct.set(row.productId, Number(row.count));
  }

  const lastActivityByProduct = new Map<string, string | null>();
  for (const row of lastActivityRows) {
    if (!row.productId) continue;
    lastActivityByProduct.set(row.productId, row.lastActivityAt ?? null);
  }

  return products.map((p) => ({
    product: p,
    issueCountsByStatus: statusByProduct.get(p.id) ?? {},
    activeAgentCount: activeAgentByProduct.get(p.id) ?? 0,
    lastActivityAt: lastActivityByProduct.get(p.id) ?? null,
  }));
}
