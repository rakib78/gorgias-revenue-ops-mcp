import { GorgiasClient } from "../gorgias-client.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GorgiasTag { id: number; name: string }

interface GorgiasCustomer {
  id: number;
  name: string;
  email: string;
  data?: Record<string, unknown>;
}

interface GorgiasUser { id: number; name: string; email: string }
interface GorgiasTeam { id: number; name: string }

interface GorgiasTicket {
  id: number;
  external_id?: string;
  subject?: string;
  status: "open" | "closed";
  channel: string;
  via: string;
  created_datetime: string;
  updated_datetime: string;
  opened_datetime?: string;
  closed_datetime?: string;
  last_message_datetime?: string;
  tags: GorgiasTag[];
  customer?: GorgiasCustomer;
  assignee_user?: GorgiasUser;
  assignee_team?: GorgiasTeam;
  is_unread?: boolean;
  spam?: boolean;
  trashed?: boolean;
  meta?: {
    satisfaction?: { scored_at?: string; score?: string };
  };
}

interface GorgiasMessage {
  id: number;
  from_agent: boolean;
  channel: string;
  body_text?: string;
  body_html?: string;
  created_datetime: string;
  sender?: { name?: string; email?: string };
}

interface GorgiasTicketList {
  data: GorgiasTicket[];
  meta: { total_count: number; next_cursor?: string; has_more: boolean };
}

interface TicketChanges {
  status?: "open" | "closed";
  tags_add?: string[];
  tags_remove?: string[];
  assignee_user_id?: number;
  assignee_team_id?: number;
  spam?: boolean;
  trashed?: boolean;
}

// ─── Search Tickets ───────────────────────────────────────────────────────────

export async function searchTickets(
  client: GorgiasClient,
  args: {
    query?: string;
    status?: "open" | "closed" | "all";
    channel?: string;
    assignee_user_id?: number;
    assignee_team_id?: number;
    tags?: string;
    limit?: number;
    cursor?: string;
  }
): Promise<string> {
  const limit = Math.min(args.limit ?? 25, 100);
  const params = new URLSearchParams();

  if (args.query) params.set("search", args.query);
  if (args.status && args.status !== "all") params.set("status", args.status);
  if (args.channel) params.set("channel", args.channel);
  if (args.assignee_user_id) params.set("assignee_user_id", String(args.assignee_user_id));
  if (args.assignee_team_id) params.set("assignee_team_id", String(args.assignee_team_id));
  if (args.tags) params.set("tags", args.tags);
  params.set("limit", String(limit));
  if (args.cursor) params.set("cursor", args.cursor);
  params.set("order_by", "updated_datetime");
  params.set("order_direction", "desc");

  const url = args.cursor ? `/tickets?cursor=${args.cursor}&limit=${limit}` : `/tickets?${params.toString()}`;
  const data = await client.get<GorgiasTicketList>(url);

  if (!data.data.length) {
    return `No tickets found${args.query ? ` for "${args.query}"` : ""}.`;
  }

  const lines = [
    `## Ticket Search Results`,
    `Found ${data.meta.total_count} total | Showing ${data.data.length}`,
    ``,
  ];

  for (const t of data.data) {
    const tags = t.tags.map(tg => tg.name).join(", ") || "—";
    const assignee = t.assignee_user?.name ?? t.assignee_team?.name ?? "unassigned";
    const wait = hoursSince(t.updated_datetime);
    lines.push(
      `**#${t.id}** — ${t.subject ?? "(no subject)"}`,
      `  Status: ${t.status} | Channel: ${t.channel} | Assignee: ${assignee}`,
      `  Tags: ${tags} | Last updated: ${formatHours(wait)} ago`,
      ``
    );
  }

  if (data.meta.has_more && data.meta.next_cursor) {
    lines.push(`---`);
    lines.push(`**Next page cursor**: \`${data.meta.next_cursor}\``);
  }

  return lines.join("\n");
}

// ─── Get Ticket (with Shopify context) ───────────────────────────────────────

export async function getTicket(
  client: GorgiasClient,
  args: { ticket_id: number; include_messages?: boolean }
): Promise<string> {
  const [ticketData, messagesData] = await Promise.allSettled([
    client.get<GorgiasTicket>(`/tickets/${args.ticket_id}`),
    args.include_messages !== false
      ? client.get<{ data: GorgiasMessage[] }>(`/tickets/${args.ticket_id}/messages`)
      : Promise.resolve(null),
  ]);

  if (ticketData.status === "rejected") {
    throw ticketData.reason;
  }

  const t = ticketData.value;
  const messages = messagesData.status === "fulfilled" && messagesData.value
    ? messagesData.value.data ?? []
    : [];

  // Shopify context from customer data
  let shopifySection = "";
  if (t.customer?.data) {
    const d = t.customer.data;
    const lines: string[] = [];

    if (d.shopify_customer_id) lines.push(`- Shopify customer ID: ${d.shopify_customer_id}`);
    if (d.total_spent) lines.push(`- Total spent: $${Number(d.total_spent).toFixed(2)}`);
    if (d.orders_count) lines.push(`- Total orders: ${d.orders_count}`);
    if (d.tags) lines.push(`- Shopify tags: ${d.tags}`);
    if (d.state) lines.push(`- Account state: ${d.state}`);
    if (d.last_order_id) lines.push(`- Last order ID: ${d.last_order_id}`);
    if (d.last_order_name) lines.push(`- Last order name: ${d.last_order_name}`);

    if (lines.length > 0) {
      shopifySection = `\n### 🛍 Shopify Context\n${lines.join("\n")}`;
    }
  }

  // CSAT
  const csat = t.meta?.satisfaction;
  const csatLine = csat?.score ? `\n- **CSAT**: ${csat.score} (rated ${formatDate(csat.scored_at ?? "")})` : "";

  // Last messages (up to 3)
  let messagesSection = "";
  if (messages.length > 0) {
    const recent = messages.slice(-3);
    const msgLines = recent.map(m => {
      const who = m.from_agent ? `Agent (${m.sender?.name ?? "?"})` : `Customer (${m.sender?.name ?? m.sender?.email ?? "?"})`;
      const preview = (m.body_text ?? "").slice(0, 200);
      return `**${who}** — ${formatDate(m.created_datetime)}\n  ${preview}${(m.body_text?.length ?? 0) > 200 ? "..." : ""}`;
    });
    messagesSection = `\n### Messages (last ${recent.length})\n${msgLines.join("\n\n")}`;
  }

  return [
    `## Ticket #${t.id}: ${t.subject ?? "(no subject)"}`,
    ``,
    `- **Status**: ${t.status}`,
    `- **Channel**: ${t.channel} (via ${t.via})`,
    `- **Customer**: ${t.customer?.name ?? "?"} (${t.customer?.email ?? "?"})`,
    `- **Assignee**: ${t.assignee_user?.name ?? "unassigned"} | Team: ${t.assignee_team?.name ?? "none"}`,
    `- **Tags**: ${t.tags.map(tg => tg.name).join(", ") || "none"}`,
    `- **Created**: ${formatDate(t.created_datetime)}`,
    `- **Updated**: ${formatDate(t.updated_datetime)} (${formatHours(hoursSince(t.updated_datetime))} ago)`,
    csatLine,
    shopifySection,
    messagesSection,
    ``,
    `> Use \`preview_ticket_update\` to stage changes before applying.`,
  ].filter(l => l !== undefined).join("\n");
}

// ─── Preview Ticket Update (Dry-run) ─────────────────────────────────────────

export async function previewTicketUpdate(
  client: GorgiasClient,
  args: { ticket_id: number; changes: TicketChanges }
): Promise<string> {
  const t = await client.get<GorgiasTicket>(`/tickets/${args.ticket_id}`);
  const changes = args.changes;
  const diff: string[] = [];
  const warnings: string[] = [];

  // Status
  if (changes.status && changes.status !== t.status) {
    diff.push(`**Status**: ${t.status} → ${changes.status}`);
  } else if (changes.status === t.status) {
    warnings.push(`Status already "${t.status}" (no-op)`);
  }

  // Tags
  if (changes.tags_add?.length || changes.tags_remove?.length) {
    const currentNames = new Set(t.tags.map(tg => tg.name));
    const addTags = changes.tags_add ?? [];
    const removeTags = changes.tags_remove ?? [];

    const alreadyOn = addTags.filter(tag => currentNames.has(tag));
    const notOn = removeTags.filter(tag => !currentNames.has(tag));
    if (alreadyOn.length) warnings.push(`Tags already on ticket (no-op add): ${alreadyOn.join(", ")}`);
    if (notOn.length) warnings.push(`Tags not on ticket (no-op remove): ${notOn.join(", ")}`);

    const resultTags = [...currentNames, ...addTags].filter(n => !removeTags.includes(n));
    diff.push(
      `**Tags**`,
      `  Before: [${[...currentNames].join(", ") || "none"}]`,
      `  After:  [${resultTags.join(", ") || "none"}]`,
    );
  }

  // Assignee
  if (changes.assignee_user_id !== undefined) {
    diff.push(`**Assignee user ID**: ${t.assignee_user?.id ?? "unassigned"} → ${changes.assignee_user_id}`);
  }
  if (changes.assignee_team_id !== undefined) {
    diff.push(`**Assignee team ID**: ${t.assignee_team?.id ?? "none"} → ${changes.assignee_team_id}`);
  }
  if (changes.spam !== undefined) diff.push(`**Spam**: ${t.spam ?? false} → ${changes.spam}`);
  if (changes.trashed !== undefined) diff.push(`**Trashed**: ${t.trashed ?? false} → ${changes.trashed}`);

  if (diff.length === 0 && warnings.length === 0) {
    return `No effective changes detected for ticket #${args.ticket_id}.`;
  }

  return [
    `## 🔍 Dry-Run Preview — Ticket #${args.ticket_id}`,
    `**"${t.subject ?? "(no subject)"}" — No changes applied.**`,
    ``,
    diff.length ? `### Changes\n${diff.join("\n")}` : "",
    warnings.length ? `### ⚠️ Warnings\n${warnings.map(w => `- ${w}`).join("\n")}` : "",
    ``,
    `---`,
    `To apply: call \`execute_ticket_update\` with \`confirm: true\`.`,
  ].filter(Boolean).join("\n");
}

// ─── Execute Ticket Update ────────────────────────────────────────────────────

export async function executeTicketUpdate(
  client: GorgiasClient,
  args: { ticket_id: number; changes: TicketChanges; confirm: boolean }
): Promise<string> {
  if (!args.confirm) {
    return [
      `⛔ Blocked: \`confirm\` must be \`true\` to apply changes.`,
      `Run \`preview_ticket_update\` first to review the diff.`,
    ].join("\n");
  }

  const t = await client.get<GorgiasTicket>(`/tickets/${args.ticket_id}`);
  const changes = args.changes;
  const patch: Record<string, unknown> = {};

  if (changes.status) patch.status = changes.status;
  if (changes.assignee_user_id !== undefined) {
    patch.assignee_user = changes.assignee_user_id === 0 ? null : { id: changes.assignee_user_id };
  }
  if (changes.assignee_team_id !== undefined) {
    patch.assignee_team = changes.assignee_team_id === 0 ? null : { id: changes.assignee_team_id };
  }
  if (changes.spam !== undefined) patch.spam = changes.spam;
  if (changes.trashed !== undefined) patch.trashed = changes.trashed;

  // Tags: compute new full list
  if (changes.tags_add?.length || changes.tags_remove?.length) {
    const currentNames = new Set(t.tags.map(tg => tg.name));
    (changes.tags_add ?? []).forEach(n => currentNames.add(n));
    (changes.tags_remove ?? []).forEach(n => currentNames.delete(n));
    patch.tags = [...currentNames].map(name => ({ name }));
  }

  const updated = await client.patch<GorgiasTicket>(`/tickets/${args.ticket_id}`, patch);

  return [
    `## ✅ Ticket #${updated.id} Updated`,
    ``,
    `- **Status**: ${updated.status}`,
    `- **Tags**: ${updated.tags.map(tg => tg.name).join(", ") || "none"}`,
    `- **Assignee**: ${updated.assignee_user?.name ?? "unassigned"}`,
    `- **Updated**: ${formatDate(updated.updated_datetime)}`,
    ``,
    `Changes applied successfully.`,
  ].join("\n");
}

// ─── Add Internal Note ────────────────────────────────────────────────────────

export async function addInternalNote(
  client: GorgiasClient,
  args: { ticket_id: number; body: string; dry_run?: boolean }
): Promise<string> {
  if (args.dry_run !== false) {
    return [
      `## 🔍 Dry-Run — Internal Note Preview`,
      `**Ticket**: #${args.ticket_id}`,
      `**Type**: Internal note (not visible to customer)`,
      ``,
      `**Content**:`,
      args.body,
      ``,
      `No note has been posted. Set \`dry_run: false\` to post it.`,
    ].join("\n");
  }

  const result = await client.post<GorgiasMessage>(`/tickets/${args.ticket_id}/messages`, {
    channel: "internal-note",
    from_agent: true,
    body_text: args.body,
    via: "api",
  });

  return [
    `## ✅ Internal Note Added — Ticket #${args.ticket_id}`,
    ``,
    `Note posted at ${formatDate(result.created_datetime)}.`,
    `Message ID: ${result.id}`,
  ].join("\n");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-NZ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
}

export function hoursSince(iso: string): number {
  return Math.round((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60));
}

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

export function formatHours(hours: number): string {
  if (hours < 24) return `${hours}h`;
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return h ? `${d}d ${h}h` : `${d}d`;
}
