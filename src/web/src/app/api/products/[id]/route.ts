import { NextRequest } from "next/server";
import { UpdateProductRequestSchema, queries } from "@alook/shared";
import { getDb } from "@/lib/db";
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember } from "@/lib/middleware/workspace";
import { parseBody, writeError, writeJSON } from "@/lib/middleware/helpers";
import { productToResponse } from "@/lib/api/responses";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const db = getDb(ctx.env.DB);
  const id = ctx.params?.id;
  if (!id) return writeError("product id is required", 400);

  const productRow = await queries.product.getProduct(db, id, ws.workspaceId);
  if (!productRow) return writeError("product not found", 404);

  return writeJSON(productToResponse(productRow));
});

export const PATCH = withAuth(async (req: NextRequest, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const db = getDb(ctx.env.DB);
  const id = ctx.params?.id;
  if (!id) return writeError("product id is required", 400);

  const existing = await queries.product.getProduct(db, id, ws.workspaceId);
  if (!existing) return writeError("product not found", 404);

  const [body, err] = await parseBody(req, UpdateProductRequestSchema);
  if (err) return err;

  const updated = await queries.product.updateProduct(db, id, ws.workspaceId, {
    name: body.name,
    description: body.description,
    status: body.status,
  });
  if (!updated) return writeError("product not found", 404);

  return writeJSON(productToResponse(updated));
});
