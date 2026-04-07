import type { OpenClawConfig, AnyAgentTool } from "openclaw/plugin-sdk";
import { isProtocolDowngraded } from "./tunnel-client.js";

type ToolConfig = {
  apiUrl: string;
  token: string;
  workspaceId: string;
  instanceId: string;
};

function resolveToolConfig(config: OpenClawConfig, sessionWorkspaceId?: string): ToolConfig {
  const section = (config as Record<string, unknown>).channels?.["nekoclaw"] as
    | Record<string, unknown>
    | undefined;
  const accounts = (section?.accounts ?? {}) as Record<string, Record<string, string>>;

  const account =
    (sessionWorkspaceId ? accounts[sessionWorkspaceId] : undefined)
    ?? accounts["default"]
    ?? Object.values(accounts)[0]
    ?? {};

  const rawUrl = account.apiUrl || process.env.NEKOCLAW_API_URL || "http://localhost:8000/api/v1";
  return {
    apiUrl: isProtocolDowngraded() ? rawUrl.replace(/^https:\/\//, "http://") : rawUrl,
    token: account.apiToken || process.env.NEKOCLAW_TOKEN || "",
    workspaceId: account.workspaceId || process.env.NEKOCLAW_WORKSPACE_ID || "",
    instanceId: account.instanceId || "",
  };
}

async function apiFetch(
  cfg: ToolConfig,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${cfg.apiUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function jsonResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

function createWorkspaceTool(cfg: ToolConfig): AnyAgentTool {
  return {
    name: "nekoclaw_workspace",
    description:
      "Workspace collaboration: blackboard content, tasks, OKR objectives, and BBS discussion posts.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "get_blackboard", "update_blackboard", "patch_section",
            "list_tasks", "create_task", "update_task", "archive_task",
            "list_objectives", "create_objective", "update_objective",
            "list_posts", "create_post", "get_post", "reply_post",
            "update_post", "delete_post", "pin_post", "unpin_post",
          ],
          description: "Which workspace operation to perform.",
        },
        title: { type: "string", description: "Task/post/objective title." },
        description: { type: "string", description: "Task/objective description." },
        content: {
          type: "string",
          description: "Markdown content (update_blackboard, create_post, reply_post, update_post, patch_section).",
        },
        section: { type: "string", description: "patch_section: section heading to update." },
        priority: {
          type: "string",
          enum: ["urgent", "high", "medium", "low"],
          description: "create_task / update_task.",
        },
        assignee_id: { type: "string", description: "create_task: assign to agent instance ID." },
        estimated_value: { type: "number", description: "create_task: estimated monetary value." },
        task_id: { type: "string", description: "update_task / archive_task: target task ID." },
        post_id: {
          type: "string",
          description: "get_post / reply_post / update_post / delete_post / pin_post / unpin_post: target post ID.",
        },
        objective_id: { type: "string", description: "update_objective: target objective ID." },
        obj_type: { type: "string", description: "create_objective / update_objective: objective type." },
        parent_id: { type: "string", description: "create_objective / update_objective: parent objective ID." },
        progress: { type: "number", description: "update_objective: progress (0.0 ~ 1.0)." },
        status: {
          type: "string",
          enum: ["pending", "in_progress", "done", "blocked"],
          description: "update_task: new task status.",
        },
        actual_value: { type: "number", description: "update_task: actual output value after completion." },
        token_cost: { type: "number", description: "update_task: tokens consumed for this task." },
        blocker_reason: { type: "string", description: "update_task: reason when status is blocked." },
        filter_status: {
          type: "string",
          description: "list_tasks: filter by status (pending/in_progress/done/blocked).",
        },
        page: { type: "number", description: "list_posts: page number (default 1)." },
      },
      required: ["action"],
    },
    execute: async (_toolCallId, args) => {
      const p = args as Record<string, unknown>;
      const ws = cfg.workspaceId;
      switch (p.action) {
        case "get_blackboard":
          return jsonResult(await apiFetch(cfg, `/workspaces/${ws}/blackboard`));
        case "update_blackboard":
          return jsonResult(
            await apiFetch(cfg, `/workspaces/${ws}/blackboard`, "PUT", { content: p.content }),
          );
        case "patch_section":
          return jsonResult(
            await apiFetch(cfg, `/workspaces/${ws}/blackboard/sections`, "PATCH", {
              section: p.section, content: p.content,
            }),
          );
        case "list_tasks": {
          const statusFilter = p.filter_status ? `?status=${p.filter_status}` : "";
          return jsonResult(await apiFetch(cfg, `/workspaces/${ws}/blackboard/tasks${statusFilter}`));
        }
        case "create_task":
          return jsonResult(
            await apiFetch(cfg, `/workspaces/${ws}/blackboard/tasks`, "POST", {
              title: p.title,
              description: p.description,
              priority: p.priority,
              assignee_id: p.assignee_id,
              estimated_value: p.estimated_value,
            }),
          );
        case "update_task": {
          const body: Record<string, unknown> = {};
          if (p.status !== undefined) body.status = p.status;
          if (p.description !== undefined) body.description = p.description;
          if (p.title !== undefined) body.title = p.title;
          if (p.priority !== undefined) body.priority = p.priority;
          if (p.assignee_id !== undefined) body.assignee_id = p.assignee_id;
          if (p.actual_value !== undefined) body.actual_value = p.actual_value;
          if (p.token_cost !== undefined) body.token_cost = p.token_cost;
          if (p.blocker_reason !== undefined) body.blocker_reason = p.blocker_reason;
          if (p.estimated_value !== undefined) body.estimated_value = p.estimated_value;
          return jsonResult(
            await apiFetch(cfg, `/workspaces/${ws}/blackboard/tasks/${p.task_id}`, "PUT", body),
          );
        }
        case "archive_task":
          return jsonResult(
            await apiFetch(cfg, `/workspaces/${ws}/blackboard/tasks/${p.task_id}/archive`, "POST"),
          );
        case "list_objectives":
          return jsonResult(await apiFetch(cfg, `/workspaces/${ws}/blackboard/objectives`));
        case "create_objective": {
          const body: Record<string, unknown> = { title: p.title };
          if (p.description !== undefined) body.description = p.description;
          if (p.obj_type !== undefined) body.obj_type = p.obj_type;
          if (p.parent_id !== undefined) body.parent_id = p.parent_id;
          return jsonResult(
            await apiFetch(cfg, `/workspaces/${ws}/blackboard/objectives`, "POST", body),
          );
        }
        case "update_objective": {
          const body: Record<string, unknown> = {};
          if (p.title !== undefined) body.title = p.title;
          if (p.description !== undefined) body.description = p.description;
          if (p.progress !== undefined) body.progress = p.progress;
          if (p.obj_type !== undefined) body.obj_type = p.obj_type;
          if (p.parent_id !== undefined) body.parent_id = p.parent_id;
          return jsonResult(
            await apiFetch(cfg, `/workspaces/${ws}/blackboard/objectives/${p.objective_id}`, "PUT", body),
          );
        }
        case "list_posts": {
          const pg = p.page ? `?page=${p.page}` : "";
          return jsonResult(await apiFetch(cfg, `/workspaces/${ws}/blackboard/posts${pg}`));
        }
        case "create_post":
          return jsonResult(
            await apiFetch(cfg, `/workspaces/${ws}/blackboard/posts`, "POST", {
              title: p.title,
              content: p.content,
            }),
          );
        case "get_post":
          return jsonResult(await apiFetch(cfg, `/workspaces/${ws}/blackboard/posts/${p.post_id}`));
        case "reply_post":
          return jsonResult(
            await apiFetch(cfg, `/workspaces/${ws}/blackboard/posts/${p.post_id}/replies`, "POST", {
              content: p.content,
            }),
          );
        case "update_post": {
          const body: Record<string, unknown> = {};
          if (p.title !== undefined) body.title = p.title;
          if (p.content !== undefined) body.content = p.content;
          return jsonResult(
            await apiFetch(cfg, `/workspaces/${ws}/blackboard/posts/${p.post_id}`, "PUT", body),
          );
        }
        case "delete_post":
          return jsonResult(
            await apiFetch(cfg, `/workspaces/${ws}/blackboard/posts/${p.post_id}`, "DELETE"),
          );
        case "pin_post":
          return jsonResult(
            await apiFetch(cfg, `/workspaces/${ws}/blackboard/posts/${p.post_id}/pin`, "POST"),
          );
        case "unpin_post":
          return jsonResult(
            await apiFetch(cfg, `/workspaces/${ws}/blackboard/posts/${p.post_id}/pin`, "DELETE"),
          );
        default:
          return jsonResult({ error: `Unknown action: ${p.action}` });
      }
    },
  };
}

function createTopologyTool(cfg: ToolConfig): AnyAgentTool {
  return {
    name: "nekoclaw_topology",
    description:
      "Query workspace topology: get full topology graph, list members with status, find reachable neighbors via corridor BFS.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["get_topology", "get_members", "get_my_neighbors"],
          description: "Which topology operation to perform.",
        },
        my_instance_id: { type: "string", description: "get_my_neighbors: your instance ID." },
      },
      required: ["action"],
    },
    execute: async (_toolCallId, args) => {
      const p = args as Record<string, unknown>;
      const ws = cfg.workspaceId;
      switch (p.action) {
        case "get_topology":
          return jsonResult(await apiFetch(cfg, `/workspaces/${ws}/topology`));
        case "get_members":
          return jsonResult(await apiFetch(cfg, `/workspaces/${ws}/members`));
        case "get_my_neighbors": {
          const topo = (await apiFetch(cfg, `/workspaces/${ws}/topology`)) as Record<string, unknown>;
          const data = topo.data as Record<string, unknown[]> | undefined;
          const nodes = (data?.nodes ?? []) as Record<string, unknown>[];
          const edges = (data?.edges ?? []) as Record<string, unknown>[];
          const myNode = nodes.find((n) => n.entity_id === p.my_instance_id);
          if (!myNode) return jsonResult({ error: "Node not found for this instance" });

          const adj = new Map<string, string[]>();
          for (const e of edges) {
            const a = `${e.a_q},${e.a_r}`, b = `${e.b_q},${e.b_r}`;
            adj.set(a, [...(adj.get(a) || []), b]);
            adj.set(b, [...(adj.get(b) || []), a]);
          }
          const nodeMap = new Map(nodes.map((n) => [`${n.hex_q},${n.hex_r}`, n]));
          const start = `${myNode.hex_q},${myNode.hex_r}`;
          const visited = new Set([start]);
          const queue = [start];
          const reachable: Record<string, unknown>[] = [];
          while (queue.length > 0) {
            const cur = queue.shift()!;
            for (const nb of adj.get(cur) || []) {
              if (visited.has(nb)) continue;
              visited.add(nb);
              const node = nodeMap.get(nb);
              if (!node) continue;
              if (node.node_type === "agent" || node.node_type === "human") {
                reachable.push(node);
              } else if (node.node_type === "corridor") {
                queue.push(nb);
              } else if (node.node_type === "blackboard") {
                reachable.push(node);
                queue.push(nb);
              }
            }
          }
          return jsonResult(reachable);
        }
        default:
          return jsonResult({ error: `Unknown action: ${p.action}` });
      }
    },
  };
}

function createGeneTool(cfg: ToolConfig): AnyAgentTool {
  return {
    name: "nekoclaw_gene",
    description:
      "Cat gene management: search the gene market, install/uninstall genes, check installed genes, view evolution history.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "search_genes", "get_gene_detail",
            "install_gene", "uninstall_gene",
            "list_my_genes", "get_evolution",
            "rate_gene",
          ],
          description: "Which gene operation to perform.",
        },
        keyword: { type: "string", description: "search_genes: search keyword." },
        category: { type: "string", description: "search_genes: filter by category." },
        gene_id: { type: "string", description: "get_gene_detail / uninstall_gene / rate_gene: target gene ID." },
        gene_slug: { type: "string", description: "install_gene: gene slug to install." },
        instance_id: {
          type: "string",
          description: "install_gene / uninstall_gene / list_my_genes / get_evolution: target instance ID (defaults to self).",
        },
        rating: { type: "number", description: "rate_gene: rating value (1~5)." },
        comment: { type: "string", description: "rate_gene: rating comment." },
      },
      required: ["action"],
    },
    execute: async (_toolCallId, args) => {
      const p = args as Record<string, unknown>;
      const instanceId = (p.instance_id as string) || cfg.instanceId;
      switch (p.action) {
        case "search_genes": {
          const params = new URLSearchParams();
          if (p.keyword) params.set("keyword", p.keyword as string);
          if (p.category) params.set("category", p.category as string);
          return jsonResult(await apiFetch(cfg, `/genes?${params.toString()}`));
        }
        case "get_gene_detail":
          return jsonResult(await apiFetch(cfg, `/genes/${p.gene_id}`));
        case "install_gene":
          return jsonResult(
            await apiFetch(cfg, `/genes/instances/${instanceId}/install`, "POST", {
              gene_slug: p.gene_slug,
            }),
          );
        case "uninstall_gene":
          return jsonResult(
            await apiFetch(cfg, `/genes/instances/${instanceId}/uninstall`, "POST", {
              gene_id: p.gene_id,
            }),
          );
        case "list_my_genes":
          return jsonResult(await apiFetch(cfg, `/genes/instances/${instanceId}/genes`));
        case "get_evolution":
          return jsonResult(await apiFetch(cfg, `/genes/instances/${instanceId}/evolution`));
        case "rate_gene":
          return jsonResult(
            await apiFetch(cfg, `/genes/${p.gene_id}/ratings`, "POST", {
              rating: p.rating,
              comment: p.comment,
            }),
          );
        default:
          return jsonResult({ error: `Unknown action: ${p.action}` });
      }
    },
  };
}

function createInstanceTool(cfg: ToolConfig): AnyAgentTool {
  return {
    name: "nekoclaw_instance",
    description:
      "Manage cat instance info: get own instance details, update display name / config, or query workspace members.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["get_my_instance", "update_my_instance", "list_workspace_agents"],
          description: "Which instance operation to perform.",
        },
        display_name: { type: "string", description: "update_my_instance: new display name." },
        config_patch: { type: "object", description: "update_my_instance: partial config to merge." },
      },
      required: ["action"],
    },
    execute: async (_toolCallId, args) => {
      const p = args as Record<string, unknown>;
      const ws = cfg.workspaceId;
      switch (p.action) {
        case "get_my_instance":
          return jsonResult(await apiFetch(cfg, `/instances/${cfg.instanceId}`));
        case "update_my_instance": {
          const body: Record<string, unknown> = {};
          if (p.display_name !== undefined) body.display_name = p.display_name;
          if (p.config_patch !== undefined) body.config_patch = p.config_patch;
          return jsonResult(
            await apiFetch(cfg, `/instances/${cfg.instanceId}`, "PATCH", body),
          );
        }
        case "list_workspace_agents":
          return jsonResult(await apiFetch(cfg, `/workspaces/${ws}/agents`));
        default:
          return jsonResult({ error: `Unknown action: ${p.action}` });
      }
    },
  };
}

export function createNekoClawyTools(config: OpenClawConfig, sessionWorkspaceId?: string): AnyAgentTool[] {
  const cfg = resolveToolConfig(config, sessionWorkspaceId);
  return [
    createWorkspaceTool(cfg),
    createTopologyTool(cfg),
    createGeneTool(cfg),
    createInstanceTool(cfg),
  ];
}
