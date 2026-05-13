import { NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { nanoid } from "nanoid";
import { withAuth } from "@/lib/middleware/auth";
import { withWorkspaceMember } from "@/lib/middleware/workspace";
import { writeJSON, writeError } from "@/lib/middleware/helpers";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const ws = await withWorkspaceMember(req, ctx);
  if (ws instanceof Response) return ws;

  const { env } = getCloudflareContext();
  const bucket = (env as Env).EMAIL_BUCKET;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return writeError("invalid form data", 400);
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return writeError("file is required", 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return writeError("file exceeds 10 MB limit", 413);
  }

  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.has(contentType)) {
    return writeError("only image files are allowed", 400);
  }

  const id = "img_" + nanoid();
  const r2Key = `issue-images/${ws.workspaceId}/${id}`;

  await bucket.put(r2Key, await file.arrayBuffer(), {
    httpMetadata: { contentType },
  });

  const url = `/api/issues/image?workspace_id=${ws.workspaceId}&id=${id}`;

  return writeJSON({ id, url });
});
