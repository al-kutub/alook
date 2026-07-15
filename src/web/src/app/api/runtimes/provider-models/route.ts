import { NextRequest } from "next/server";
import { withAuth } from "@/lib/middleware/auth";
import { writeJSON } from "@/lib/middleware/helpers";
import { log } from "@/lib/logger";
import {
  getCursorModels,
  getCloudflareWorkersAiModels,
  getOpenRouterModels,
} from "@/lib/provider-model-catalog";

/**
 * Real, currently-usable model ids for the Provider picker's datalist (see
 * agent-form-fields.tsx). `provider` matches the ProviderKind values the UI
 * already uses: "default" | "openrouter" | "cloudflare-workers-ai".
 */
export const GET = withAuth(async (req: NextRequest) => {
  const provider = req.nextUrl.searchParams.get("provider") ?? "default";

  if (provider === "openrouter") {
    try {
      return writeJSON({ provider, models: await getOpenRouterModels() });
    } catch (e) {
      log.error("Failed to fetch OpenRouter models", { err: e });
      return writeJSON({ provider, models: [] });
    }
  }

  if (provider === "cloudflare-workers-ai") {
    return writeJSON({ provider, models: getCloudflareWorkersAiModels() });
  }

  // "default" — the fixed cursor-agent whitelist. Agents on the opencode
  // runtime with no provider override have no fixed catalog to offer here.
  return writeJSON({ provider: "default", models: getCursorModels() });
});
