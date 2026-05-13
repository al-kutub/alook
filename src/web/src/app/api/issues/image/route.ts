import { NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember } from "@/lib/middleware/workspace";
import { writeError } from "@/lib/middleware/helpers";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const id = req.nextUrl.searchParams.get("id");
  if (!id || !/^img_[\w-]+$/.test(id)) {
    return writeError("invalid image id", 400);
  }

  const { env } = getCloudflareContext();
  const bucket = (env as Env).EMAIL_BUCKET;

  const r2Key = `issue-images/${ws.workspaceId}/${id}`;
  const object = await bucket.get(r2Key);
  if (!object) {
    return writeError("image not found", 404);
  }

  const contentType = object.httpMetadata?.contentType ?? "application/octet-stream";

  return new Response(object.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});
