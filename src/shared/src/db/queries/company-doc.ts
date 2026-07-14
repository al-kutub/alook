import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { companyDoc } from "../schema";
import type { Database } from "../index";
import { sanitizeFtsQuery } from "./community/search";

const DEFAULT_LIMIT = 20;

export async function createDoc(
  db: Database,
  data: {
    workspaceId: string;
    title: string;
    content: string;
    tags?: string;
    authorAgentId: string;
  }
) {
  const rows = await db
    .insert(companyDoc)
    .values({
      workspaceId: data.workspaceId,
      title: data.title,
      content: data.content,
      tags: data.tags ?? "",
      authorAgentId: data.authorAgentId,
    })
    .returning();
  return rows[0]!;
}

export async function getDoc(db: Database, id: string, workspaceId: string) {
  const rows = await db
    .select()
    .from(companyDoc)
    .where(and(eq(companyDoc.id, id), eq(companyDoc.workspaceId, workspaceId)));
  return rows[0] ?? null;
}

export async function updateDoc(
  db: Database,
  id: string,
  workspaceId: string,
  data: { title?: string; content?: string; tags?: string }
) {
  const rows = await db
    .update(companyDoc)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(and(eq(companyDoc.id, id), eq(companyDoc.workspaceId, workspaceId)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteDoc(db: Database, id: string, workspaceId: string) {
  const rows = await db
    .delete(companyDoc)
    .where(and(eq(companyDoc.id, id), eq(companyDoc.workspaceId, workspaceId)))
    .returning();
  return rows[0] ?? null;
}

export async function listRecentDocs(db: Database, workspaceId: string, limit = DEFAULT_LIMIT) {
  return db
    .select()
    .from(companyDoc)
    .where(eq(companyDoc.workspaceId, workspaceId))
    .orderBy(desc(companyDoc.updatedAt))
    .limit(limit);
}

/** FTS5 MATCH search over company_doc_fts (title/content/tags), scoped to
 * workspace. See 0064_company_wiki.sql for the virtual table + sync
 * triggers. Only the matching ids come from raw SQL (fts5 virtual tables
 * aren't Drizzle-modeled) — the actual rows are fetched via a normal
 * Drizzle select so callers get properly camelCase-mapped columns, not raw
 * snake_case driver output. */
export async function searchDocs(
  db: Database,
  workspaceId: string,
  query: string,
  limit = DEFAULT_LIMIT
) {
  const match = sanitizeFtsQuery(query);
  const idRows = await db.all<{ id: string }>(
    sql`SELECT company_doc_fts.id FROM company_doc_fts
        WHERE company_doc_fts MATCH ${match}
          AND company_doc_fts.workspace_id = ${workspaceId}
        ORDER BY rank
        LIMIT ${limit}`
  );
  const ids = idRows.map((r) => r.id);
  if (ids.length === 0) return [];

  const rows = await db.select().from(companyDoc).where(inArray(companyDoc.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is typeof companyDoc.$inferSelect => !!r);
}
