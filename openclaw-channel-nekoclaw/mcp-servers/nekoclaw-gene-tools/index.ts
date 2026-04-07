#!/usr/bin/env npx ts-node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const API = process.env.NEKOCLAW_API_URL || "http://localhost:8000/api/v1";
const TOKEN = process.env.NEKOCLAW_TOKEN || "";
const INSTANCE_ID = process.env.NEKOCLAW_INSTANCE_ID || "";

async function apiFetch(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const server = new Server(
  { name: "nekoclaw-gene-tools", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search_genes",
      description: "Search the gene market by keyword or category",
      inputSchema: {
        type: "object",
        properties: {
          keyword: { type: "string" },
          category: { type: "string" },
        },
      },
    },
    {
      name: "get_gene_detail",
      description: "Get detailed information about a specific gene",
      inputSchema: { type: "object", properties: { gene_id: { type: "string" } }, required: ["gene_id"] },
    },
    {
      name: "install_gene",
      description: "Install a gene onto my cat instance",
      inputSchema: {
        type: "object",
        properties: {
          gene_slug: { type: "string", description: "Gene slug to install" },
          instance_id: { type: "string", description: "Instance ID (defaults to NEKOCLAW_INSTANCE_ID env)" },
        },
        required: ["gene_slug"],
      },
    },
    {
      name: "uninstall_gene",
      description: "Uninstall a gene from my cat instance",
      inputSchema: {
        type: "object",
        properties: {
          gene_id: { type: "string" },
          instance_id: { type: "string", description: "Instance ID (defaults to NEKOCLAW_INSTANCE_ID env)" },
        },
        required: ["gene_id"],
      },
    },
    {
      name: "list_my_genes",
      description: "List all installed genes on my cat instance",
      inputSchema: {
        type: "object",
        properties: {
          instance_id: { type: "string", description: "Instance ID (defaults to NEKOCLAW_INSTANCE_ID env)" },
        },
      },
    },
    {
      name: "get_evolution",
      description: "View gene evolution history for my cat instance",
      inputSchema: {
        type: "object",
        properties: {
          instance_id: { type: "string", description: "Instance ID (defaults to NEKOCLAW_INSTANCE_ID env)" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const a = (args || {}) as Record<string, unknown>;
  const instanceId = (a.instance_id as string) || INSTANCE_ID;
  let result: unknown;

  switch (name) {
    case "search_genes": {
      const params = new URLSearchParams();
      if (a.keyword) params.set("keyword", a.keyword as string);
      if (a.category) params.set("category", a.category as string);
      result = await apiFetch(`/genes?${params.toString()}`);
      break;
    }
    case "get_gene_detail":
      result = await apiFetch(`/genes/${a.gene_id}`);
      break;
    case "install_gene":
      result = await apiFetch(`/genes/instances/${instanceId}/install`, "POST", {
        gene_slug: a.gene_slug,
      });
      break;
    case "uninstall_gene":
      result = await apiFetch(`/genes/instances/${instanceId}/uninstall`, "POST", {
        gene_id: a.gene_id,
      });
      break;
    case "list_my_genes":
      result = await apiFetch(`/genes/instances/${instanceId}/genes`);
      break;
    case "get_evolution":
      result = await apiFetch(`/genes/instances/${instanceId}/evolution`);
      break;
    default:
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
  }
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});

const transport = new StdioServerTransport();
server.connect(transport);
