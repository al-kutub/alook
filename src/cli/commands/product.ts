import { Command } from "commander";
import { APIClient } from "../lib/client.js";
import { printJSON } from "../lib/output.js";
import { resolveAgentId } from "../lib/flags.js";
import { resolveClientOpts } from "../lib/resolve-client.js";

interface ProductResponse {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  status: string;
  created_by_user_id: string | null;
  created_by_agent_id: string | null;
  created_at: string;
  updated_at: string;
}

function printProductSummary(product: ProductResponse): void {
  console.log(`${product.id}  ${product.status.padEnd(9)}  ${product.name}`);
}

export function productCommand(): Command {
  const cmd = new Command("product").description("Manage products (tags for work items)");

  cmd
    .command("list")
    .description("List products in the workspace")
    .option("--agent_id <id>", "Agent ID")
    .option("--json", "Output as JSON")
    .action(async (opts, command) => {
      const agentId = resolveAgentId(opts);
      const { serverUrl, token, workspaceId } = resolveClientOpts(command, { agentId });
      const client = new APIClient(serverUrl, token, workspaceId);
      try {
        const products = await client.getJSON<ProductResponse[]>("/api/products");
        if (opts.json) return printJSON(products);
        if (products.length === 0) {
          console.log("No products found.");
          return;
        }
        for (const product of products) printProductSummary(product);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  cmd
    .command("create")
    .description("Create a new product")
    .requiredOption("--name <name>", "Product name")
    .option("--description <text>", "Product description")
    .option("--agent_id <id>", "Agent ID")
    .option("--json", "Output as JSON")
    .action(async (opts, command) => {
      const agentId = resolveAgentId(opts);
      const { serverUrl, token, workspaceId } = resolveClientOpts(command, { agentId });
      const client = new APIClient(serverUrl, token, workspaceId);
      try {
        const product = await client.postJSON<ProductResponse>(`/api/products?agentId=${encodeURIComponent(agentId)}`, {
          name: opts.name,
          description: opts.description ?? "",
        });
        if (opts.json) return printJSON(product);
        console.log(`Created ${product.id} — ${product.name}`);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  cmd
    .command("show")
    .description("Show product details")
    .argument("<id>", "Product ID")
    .option("--agent_id <id>", "Agent ID")
    .option("--json", "Output as JSON")
    .action(async (id, opts, command) => {
      const agentId = resolveAgentId(opts);
      const { serverUrl, token, workspaceId } = resolveClientOpts(command, { agentId });
      const client = new APIClient(serverUrl, token, workspaceId);
      try {
        const product = await client.getJSON<ProductResponse>(`/api/products/${id}`);
        if (opts.json) return printJSON(product);
        console.log(`id:          ${product.id}`);
        console.log(`name:        ${product.name}`);
        console.log(`status:      ${product.status}`);
        console.log(`description: ${product.description || "(none)"}`);
        console.log(`created_at:  ${product.created_at}`);
        console.log(`updated_at:  ${product.updated_at}`);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  return cmd;
}
