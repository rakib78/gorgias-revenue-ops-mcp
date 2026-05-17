#!/usr/bin/env node

/**
 * Gorgias Ecommerce Support Ops MCP Server
 *
 * Production-safe Gorgias MCP with:
 *  - Shopify order context on every ticket
 *  - Dry-run ticket writes with explicit confirm gate
 *  - SLA breach radar with revenue-weighted risk
 *  - NL macro authoring
 *  - Weekly ops + revenue digest
 *
 * Required env:
 *   GORGIAS_DOMAIN     — subdomain (e.g. "mystore" for mystore.gorgias.com)
 *   GORGIAS_EMAIL      — agent/admin email
 *   GORGIAS_API_TOKEN  — API token from Gorgias Settings → REST API
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { clientFromEnv, GorgiasApiError } from "./gorgias-client.js";

import { gorgiasWhoami } from "./tools/auth.js";
import {
  searchTickets,
  getTicket,
  previewTicketUpdate,
  executeTicketUpdate,
  addInternalNote,
} from "./tools/tickets.js";
import { getCustomer, searchCustomers } from "./tools/customers.js";
import { listSlaBreaches, explainTicketSla } from "./tools/sla.js";
import { listMacros, getMacro, createMacroFromSpec } from "./tools/macros.js";
import { weeklySupportSummary } from "./tools/reporting.js";

// ─── Input Schemas ────────────────────────────────────────────────────────────

const TicketChangesSchema = z.object({
  status: z.enum(["open", "closed"]).optional(),
  tags_add: z.array(z.string()).optional(),
  tags_remove: z.array(z.string()).optional(),
  assignee_user_id: z.number().optional(),
  assignee_team_id: z.number().optional(),
  spam: z.boolean().optional(),
  trashed: z.boolean().optional(),
});

const Schemas = {
  gorgias_whoami: z.object({}),

  search_tickets: z.object({
    query: z.string().optional().describe("Search text (keyword search)"),
    status: z.enum(["open", "closed", "all"]).optional().describe("Ticket status filter (default: all)"),
    channel: z.string().optional().describe("Filter by channel: email, chat, sms, instagram, etc."),
    assignee_user_id: z.number().optional().describe("Filter by assignee user ID"),
    assignee_team_id: z.number().optional().describe("Filter by assignee team ID"),
    tags: z.string().optional().describe("Filter by tag name (exact match)"),
    limit: z.number().min(1).max(100).optional().describe("Results per page (default 25)"),
    cursor: z.string().optional().describe("Pagination cursor from previous result"),
  }),

  get_ticket: z.object({
    ticket_id: z.number().describe("Gorgias ticket ID"),
    include_messages: z.boolean().optional().describe("Include last 3 messages (default true)"),
  }),

  preview_ticket_update: z.object({
    ticket_id: z.number().describe("Gorgias ticket ID"),
    changes: TicketChangesSchema.describe("Changes to preview — NOT applied"),
  }),

  execute_ticket_update: z.object({
    ticket_id: z.number().describe("Gorgias ticket ID"),
    changes: TicketChangesSchema.describe("Changes to apply"),
    confirm: z.boolean().describe("Must be true to apply. Run preview_ticket_update first."),
  }),

  add_internal_note: z.object({
    ticket_id: z.number().describe("Gorgias ticket ID"),
    body: z.string().describe("Note text content"),
    dry_run: z.boolean().optional().describe("Preview without posting (default: true)"),
  }),

  get_customer: z.object({
    customer_id: z.number().optional().describe("Gorgias customer ID"),
    email: z.string().optional().describe("Customer email address"),
  }),

  search_customers: z.object({
    query: z.string().describe("Name or email to search"),
    limit: z.number().min(1).max(50).optional().describe("Max results (default 10)"),
  }),

  list_sla_breaches: z.object({
    hours_without_update: z.number().optional().describe("Flag tickets with no update for this many hours (default 24)"),
    limit: z.number().min(1).max(100).optional().describe("Max tickets to check (default 20)"),
    assignee_team_id: z.number().optional().describe("Filter by team ID"),
    channel: z.string().optional().describe("Filter by channel"),
  }),

  explain_ticket_sla: z.object({
    ticket_id: z.number().describe("Gorgias ticket ID"),
  }),

  weekly_support_summary: z.object({
    week_start: z.string().optional().describe("ISO date YYYY-MM-DD for start of week (default: current Monday)"),
    include_revenue: z.boolean().optional().describe("Include Shopify revenue intelligence (default true)"),
  }),

  create_macro_from_spec: z.object({
    name: z.string().describe("Macro name"),
    spec: z.string().describe(
      "Natural language or JSON array of Gorgias macro actions. " +
      'NL: "Add tags: billing-query. Send message: We will follow up shortly. Close ticket." ' +
      'JSON: [{"type":"add-tag","value":"billing-query"},{"type":"close-ticket"}]'
    ),
    visibility: z.enum(["private", "team", "all"]).optional().describe("Macro visibility (default: team)"),
    dry_run: z.boolean().optional().describe("Preview without creating (default: TRUE)"),
  }),

  list_macros: z.object({
    query: z.string().optional().describe("Filter by name keyword"),
    limit: z.number().optional().describe("Max results (default 50)"),
  }),

  get_macro: z.object({
    macro_id: z.number().describe("Gorgias macro ID"),
  }),
};

// ─── Tool Definitions ─────────────────────────────────────────────────────────

// Tool[] typing relaxed to avoid MCP SDK inputSchema property type conflicts
const TOOLS: any[] = [
  {
    name: "gorgias_whoami",
    description: "Verify Gorgias connection, auth, user details, and Shopify integration status. Run this first.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "search_tickets",
    description: "Search Gorgias tickets by keyword, status, channel, assignee, or tag. Returns paginated results with customer and tag context.",
    inputSchema: toJsonSchema(Schemas.search_tickets),
  },
  {
    name: "get_ticket",
    description: "Get full ticket context: status, tags, assignee, channel, CSAT, Shopify order data, and last messages.",
    inputSchema: toJsonSchema(Schemas.get_ticket),
  },
  {
    name: "preview_ticket_update",
    description: "DRY-RUN: Show exact diff of proposed ticket changes (status, tags, assignee) WITHOUT applying them. Always run before execute.",
    inputSchema: toJsonSchema(Schemas.preview_ticket_update),
  },
  {
    name: "execute_ticket_update",
    description: "Apply changes to a ticket (status, tags, assignee, spam, trash). Requires confirm:true. Run preview_ticket_update first.",
    inputSchema: toJsonSchema(Schemas.execute_ticket_update),
  },
  {
    name: "add_internal_note",
    description: "Add a private internal note to a ticket. Defaults to dry_run:true preview — set dry_run:false to post.",
    inputSchema: toJsonSchema(Schemas.add_internal_note),
  },
  {
    name: "get_customer",
    description: "Get customer profile with Shopify context: LTV, order count, last order, tier assessment. Lookup by ID or email.",
    inputSchema: toJsonSchema(Schemas.get_customer),
  },
  {
    name: "search_customers",
    description: "Search customers by name or email. Returns Shopify LTV and ticket counts.",
    inputSchema: toJsonSchema(Schemas.search_customers),
  },
  {
    name: "list_sla_breaches",
    description: "Find open tickets at SLA breach risk — ranked by longest wait time with revenue-weighted context.",
    inputSchema: toJsonSchema(Schemas.list_sla_breaches),
  },
  {
    name: "explain_ticket_sla",
    description: "Full SLA story for a single ticket: first reply time, wait time, message history, CSAT, Shopify LTV, and plain-language risk verdict.",
    inputSchema: toJsonSchema(Schemas.explain_ticket_sla),
  },
  {
    name: "weekly_support_summary",
    description: "Monday ops digest: volume, resolution rate, channel breakdown, top tags, SLA health, revenue at stake, and CSAT.",
    inputSchema: toJsonSchema(Schemas.weekly_support_summary),
  },
  {
    name: "create_macro_from_spec",
    description: "Create a Gorgias macro from natural language or JSON spec. Dry-run TRUE by default. Supports: tags, send-message, close-ticket, add-note, assign-team, assign-agent.",
    inputSchema: toJsonSchema(Schemas.create_macro_from_spec),
  },
  {
    name: "list_macros",
    description: "Browse Gorgias macro library, optionally filtered by name.",
    inputSchema: toJsonSchema(Schemas.list_macros),
  },
  {
    name: "get_macro",
    description: "Fetch full macro definition (actions[]) for review or editing.",
    inputSchema: toJsonSchema(Schemas.get_macro),
  },
];

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "gorgias-ecom-support-ops-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const client = clientFromEnv();
    let result: string;

    switch (name) {
      case "gorgias_whoami":
        result = await gorgiasWhoami(client); break;

      case "search_tickets":
        result = await searchTickets(client, Schemas.search_tickets.parse(args)); break;

      case "get_ticket": {
        const p = Schemas.get_ticket.parse(args);
        result = await getTicket(client, p); break;
      }

      case "preview_ticket_update": {
        const p = Schemas.preview_ticket_update.parse(args);
        result = await previewTicketUpdate(client, { ticket_id: p.ticket_id, changes: p.changes }); break;
      }

      case "execute_ticket_update": {
        const p = Schemas.execute_ticket_update.parse(args);
        result = await executeTicketUpdate(client, { ticket_id: p.ticket_id, changes: p.changes, confirm: p.confirm }); break;
      }

      case "add_internal_note": {
        const p = Schemas.add_internal_note.parse(args);
        result = await addInternalNote(client, { ticket_id: p.ticket_id, body: p.body, dry_run: p.dry_run ?? true }); break;
      }

      case "get_customer": {
        const p = Schemas.get_customer.parse(args);
        result = await getCustomer(client, p); break;
      }

      case "search_customers": {
        const p = Schemas.search_customers.parse(args);
        result = await searchCustomers(client, p); break;
      }

      case "list_sla_breaches": {
        const p = Schemas.list_sla_breaches.parse(args);
        result = await listSlaBreaches(client, p); break;
      }

      case "explain_ticket_sla": {
        const p = Schemas.explain_ticket_sla.parse(args);
        result = await explainTicketSla(client, p); break;
      }

      case "weekly_support_summary": {
        const p = Schemas.weekly_support_summary.parse(args);
        result = await weeklySupportSummary(client, p); break;
      }

      case "create_macro_from_spec": {
        const p = Schemas.create_macro_from_spec.parse(args);
        result = await createMacroFromSpec(client, { name: p.name, spec: p.spec, visibility: p.visibility, dry_run: p.dry_run ?? true }); break;
      }

      case "list_macros": {
        const p = Schemas.list_macros.parse(args);
        result = await listMacros(client, p); break;
      }

      case "get_macro": {
        const p = Schemas.get_macro.parse(args);
        result = await getMacro(client, p); break;
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return { content: [{ type: "text", text: result }] };

  } catch (err) {
    if (err instanceof GorgiasApiError) {
      return {
        content: [{ type: "text", text: `**Gorgias API Error** (${err.statusCode})\n\n${err.message}` }],
        isError: true,
      };
    }
    if (err instanceof z.ZodError) {
      return {
        content: [{ type: "text", text: `**Invalid input**\n\n${err.errors.map(e => `- ${e.path.join(".")}: ${e.message}`).join("\n")}` }],
        isError: true,
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `**Error**: ${msg}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Gorgias Ecommerce Support Ops MCP running on stdio");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });

// ─── Minimal Zod → JSON Schema ────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toJsonSchema(schema: z.ZodTypeAny): any {
  return zodToSchema(schema);
}

function zodToSchema(s: z.ZodTypeAny): unknown {
  if (s instanceof z.ZodObject) {
    const shape = s.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(shape)) {
      properties[k] = zodToSchema(v);
      if (!(v instanceof z.ZodOptional)) required.push(k);
    }
    return { type: "object", properties, required };
  }
  if (s instanceof z.ZodOptional) return zodToSchema(s.unwrap());
  if (s instanceof z.ZodString) {
    const r: Record<string, unknown> = { type: "string" };
    if (s.description) r.description = s.description;
    return r;
  }
  if (s instanceof z.ZodNumber) {
    const r: Record<string, unknown> = { type: "number" };
    if (s.description) r.description = s.description;
    return r;
  }
  if (s instanceof z.ZodBoolean) {
    const r: Record<string, unknown> = { type: "boolean" };
    if (s.description) r.description = s.description;
    return r;
  }
  if (s instanceof z.ZodEnum) return { type: "string", enum: s.options };
  if (s instanceof z.ZodArray) return { type: "array", items: zodToSchema(s.element) };
  return {};
}
