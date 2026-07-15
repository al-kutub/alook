import { NextRequest } from "next/server";
import { CreateProductRequestSchema, queries } from "@alook/shared";
import { getDb } from "@/lib/db";
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember } from "@/lib/middleware/workspace";
import { parseBody, writeJSON } from "@/lib/middleware/helpers";
import { productToResponse } from "@/lib/api/responses";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const db = getDb(ctx.env.DB);
  const status = req.nextUrl.searchParams.get("status") ?? undefined;

  const rows = await queries.product.listProducts(db, ws.workspaceId, status);

  return writeJSON(rows.map(productToResponse));
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const db = getDb(ctx.env.DB);
  const agentId = req.nextUrl.searchParams.get("agentId");

  const [body, err] = await parseBody(req, CreateProductRequestSchema);
  if (err) return err;

  const created = await queries.product.createProduct(db, {
    workspaceId: ws.workspaceId,
    name: body.name,
    description: body.description,
    createdByAgentId: agentId ?? undefined,
    createdByUserId: agentId ? undefined : ctx.userId,
  });

  return writeJSON(productToResponse(created), 201);
});
