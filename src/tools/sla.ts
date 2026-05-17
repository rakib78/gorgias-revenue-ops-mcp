import { GorgiasClient } from "../gorgias-client.js";
import { formatDate, hoursSince, daysSince, formatHours } from "./tickets.js";

interface GorgiasTicketStub {
  id: number;
  subject?: string;
  status: string;
  channel: string;
  created_datetime: string;
  updated_datetime: string;
  last_message_datetime?: string;
  tags: Array<{ id: number; name: string }>;
  assignee_user?: { id: number; name: string };
  assignee_team?: { id: number; name: string };
  customer?: { id: number; name: string; email: string; data?: Record<string, unknown> };
  meta?: { satisfaction?: { score?: string } };
}

// ─── List SLA Breaches ────────────────────────────────────────────────────────

export async function listSlaBreaches(
  client: GorgiasClient,
  args: {
    hours_without_update?: number; // default: 24
    limit?: number;
    assignee_team_id?: number;
    channel?: string;
  }
): Promise<string> {
  const threshold = args.hours_without_update ?? 24;
  const limit = Math.min(args.limit ?? 20, 100);

  // Fetch open tickets sorted by oldest update first
  const params = new URLSearchParams({
    status: "open",
    limit: String(limit),
    order_by: "updated_datetime",
    order_direction: "asc",
  });
  if (args.assignee_team_id) params.set("assignee_team_id", String(args.assignee_team_id));
  if (args.channel) params.set("channel", args.channel);

  const data = await client.get<{
    data: GorgiasTicketStub[];
    meta: { total_count: number };
  }>(`/tickets?${params.toString()}`);

  // Filter to tickets that haven't been updated in threshold hours
  const breached = data.data.filter(t => hoursSince(t.updated_datetime) >= threshold);

  if (!breached.length) {
    return [
      `## ✅ No SLA Breaches Detected`,
      ``,
      `No open tickets found waiting longer than **${threshold} hours** without an update.`,
      ``,
      `> Checked ${data.data.length} most-stale open tickets (of ${data.meta.total_count} total open).`,
    ].join("\n");
  }

  const lines = [
    `## 🔴 SLA Breach Radar`,
    `**${breached.length} open tickets** waiting > ${threshold}h without update`,
    `*(Oldest first — highest breach risk at top)*`,
    ``,
  ];

  let rank = 1;
  for (const t of breached) {
    const wait = hoursSince(t.updated_datetime);
    const age = daysSince(t.created_datetime);
    const tags = t.tags.map(tg => tg.name).join(", ") || "—";
    const assignee = t.assignee_user?.name ?? t.assignee_team?.name ?? "unassigned";
    const spent = t.customer?.data?.total_spent
      ? ` | Customer LTV: $${Number(t.customer.data.total_spent).toFixed(0)}`
      : "";
    const riskEmoji = wait > 72 ? "🔴" : wait > 48 ? "🟠" : "🟡";

    lines.push(
      `${riskEmoji} **${rank}. #${t.id}** — ${t.subject ?? "(no subject)"}`,
      `   Channel: ${t.channel} | Assignee: ${assignee} | Age: ${age}d`,
      `   ⏱ No update for **${formatHours(wait)}**${spent}`,
      `   Tags: ${tags}`,
      ``
    );
    rank++;
  }

  lines.push(`---`);
  lines.push(`> Use \`explain_ticket_sla\` for a full SLA story on any ticket.`);
  lines.push(`> Use \`execute_ticket_update\` to reassign or escalate.`);

  return lines.join("\n");
}

// ─── Explain Ticket SLA ───────────────────────────────────────────────────────

export async function explainTicketSla(
  client: GorgiasClient,
  args: { ticket_id: number }
): Promise<string> {
  const [ticketData, messagesData] = await Promise.allSettled([
    client.get<GorgiasTicketStub>(`/tickets/${args.ticket_id}`),
    client.get<{ data: Array<{ from_agent: boolean; created_datetime: string }> }>(
      `/tickets/${args.ticket_id}/messages`
    ),
  ]);

  if (ticketData.status === "rejected") throw ticketData.reason;
  const t = ticketData.value;
  const messages = messagesData.status === "fulfilled" ? messagesData.value.data : [];

  // Compute first reply time
  const customerMessages = messages.filter(m => !m.from_agent);
  const agentMessages = messages.filter(m => m.from_agent);

  let frtHours: number | null = null;
  if (customerMessages.length && agentMessages.length) {
    const firstCustomer = new Date(customerMessages[0].created_datetime).getTime();
    const firstAgent = new Date(agentMessages[0].created_datetime).getTime();
    if (firstAgent > firstCustomer) {
      frtHours = Math.round((firstAgent - firstCustomer) / (1000 * 60 * 60) * 10) / 10;
    }
  }

  const ageHours = hoursSince(t.created_datetime);
  const waitHours = hoursSince(t.updated_datetime);

  const lines = [
    `## 📊 SLA Story — Ticket #${t.id}`,
    `**${t.subject ?? "(no subject)"}**`,
    ``,
    `### Ticket Timeline`,
    `- **Created**: ${formatDate(t.created_datetime)} (${formatHours(ageHours)} ago)`,
    `- **Last updated**: ${formatDate(t.updated_datetime)} (${formatHours(waitHours)} ago)`,
    t.last_message_datetime
      ? `- **Last message**: ${formatDate(t.last_message_datetime)}`
      : "",
    t.closed_datetime
      ? `- **Closed**: ${formatDate(t.closed_datetime)}`
      : `- **Status**: Open`,
    ``,
    `### Response Metrics`,
    frtHours !== null
      ? `- **First reply time**: ${frtHours}h`
      : `- **First reply time**: Not yet recorded (no agent reply detected)`,
    `- **Total messages**: ${messages.length} (${agentMessages.length} agent, ${customerMessages.length} customer)`,
    ``,
    `### Shopify Context`,
    t.customer?.data?.total_spent
      ? `- **Customer LTV**: $${Number(t.customer.data.total_spent).toFixed(2)} (${t.customer.data.orders_count ?? "?"} orders)`
      : `- No Shopify LTV data available`,
    t.meta?.satisfaction?.score
      ? `- **CSAT**: ${t.meta.satisfaction.score}`
      : `- **CSAT**: Not rated`,
    ``,
    `### Risk Assessment`,
  ];

  if (t.status === "open") {
    const spent = Number(t.customer?.data?.total_spent ?? 0);
    const isHighValue = spent >= 1000;
    if (waitHours > 72) {
      lines.push(`> 🔴 **CRITICAL**: ${formatHours(waitHours)} without update.${isHighValue ? ` High-value customer ($${spent.toFixed(0)} LTV) — escalate immediately.` : " Escalate immediately."}`);
    } else if (waitHours > 48) {
      lines.push(`> 🟠 **HIGH**: ${formatHours(waitHours)} without update.${isHighValue ? ` High-value customer — prioritize.` : " Prioritize."}`);
    } else if (waitHours > 24) {
      lines.push(`> 🟡 **MEDIUM**: ${formatHours(waitHours)} without update. Monitor and respond before 48h.`);
    } else {
      lines.push(`> 🟢 **LOW**: Recently updated. No immediate action needed.`);
    }
  } else {
    lines.push(`> Ticket is **${t.status}**. No active SLA clock.`);
  }

  return lines.filter(l => l !== undefined).join("\n");
}
