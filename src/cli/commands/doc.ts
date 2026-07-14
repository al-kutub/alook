import { Command } from "commander";
import { APIClient } from "../lib/client.js";
import { printJSON } from "../lib/output.js";
import { resolveAgentId, readBody } from "../lib/flags.js";
import { resolveClientOpts } from "../lib/resolve-client.js";

interface CompanyDocResponse {
  id: string;
  workspace_id: string;
  title: string;
  content: string;
  tags: string;
  author_agent_id: string;
  created_at: string;
  updated_at: string;
}

function printDocSummary(doc: CompanyDocResponse): void {
  const snippet = doc.content.replace(/\s+/g, " ").trim().slice(0, 100);
  console.log(`${doc.id}  ${doc.title}`);
  console.log(`  ${snippet}${doc.content.length > 100 ? "…" : ""}`);
}

export function docCommand(): Command {
  const cmd = new Command("doc").description("Search and write the shared company wiki");

  cmd
    .command("search")
    .description("Full-text search the company wiki")
    .argument("<query>", "Search terms")
    .option("--agent_id <id>", "Agent ID")
    .option("--json", "Output as JSON")
    .action(async (query, opts, command) => {
      const agentId = resolveAgentId(opts);
      const { serverUrl, token, workspaceId } = resolveClientOpts(command, { agentId });
      const client = new APIClient(serverUrl, token, workspaceId);
      try {
        const docs = await client.getJSON<CompanyDocResponse[]>(`/api/wiki?q=${encodeURIComponent(query)}`);
        if (opts.json) return printJSON(docs);
        if (docs.length === 0) {
          console.log("No matching docs. This company hasn't solved this one yet.");
          return;
        }
        for (const doc of docs) printDocSummary(doc);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  cmd
    .command("write")
    .description("Write a new entry to the company wiki")
    .requiredOption("--title <title>", "Doc title")
    .option("--content <text>", "Doc content")
    .option("--body-file <path>", "Read content from a file")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--agent_id <id>", "Agent ID")
    .option("--json", "Output as JSON")
    .action(async (opts, command) => {
      const content = readBody({ body: opts.content, bodyFile: opts.bodyFile }).trim();
      if (!content) {
        console.error("Error: pass --content or --body-file");
        process.exit(1);
      }
      const agentId = resolveAgentId(opts);
      const { serverUrl, token, workspaceId } = resolveClientOpts(command, { agentId });
      const client = new APIClient(serverUrl, token, workspaceId);
      try {
        const doc = await client.postJSON<CompanyDocResponse>(`/api/wiki?agentId=${encodeURIComponent(agentId)}`, {
          title: opts.title,
          content,
          tags: opts.tags ?? "",
        });
        if (opts.json) return printJSON(doc);
        console.log(`Wrote ${doc.id} — ${doc.title}`);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  cmd
    .command("show")
    .description("Show the full content of a wiki doc")
    .argument("<id>", "Doc ID")
    .option("--agent_id <id>", "Agent ID")
    .option("--json", "Output as JSON")
    .action(async (id, opts, command) => {
      const agentId = resolveAgentId(opts);
      const { serverUrl, token, workspaceId } = resolveClientOpts(command, { agentId });
      const client = new APIClient(serverUrl, token, workspaceId);
      try {
        const doc = await client.getJSON<CompanyDocResponse>(`/api/wiki/${id}`);
        if (opts.json) return printJSON(doc);
        console.log(`id:         ${doc.id}`);
        console.log(`title:      ${doc.title}`);
        console.log(`tags:       ${doc.tags || "(none)"}`);
        console.log(`author:     ${doc.author_agent_id}`);
        console.log(`updated_at: ${doc.updated_at}`);
        console.log("");
        console.log(doc.content);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  return cmd;
}
