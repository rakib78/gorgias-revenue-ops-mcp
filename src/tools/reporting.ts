import { GorgiasClient } from "../gorgias-client.js";
import { formatDate, daysSince, hoursSince } from "./tickets.js";

interface GorgiasTicketStub {
  id: number;
  status: string;
  channel: string;
  created_datetime: string;
  updated_datetime: string;
  tags: Array<{ name: string }>;
  customer?: { data?: Record<string, unknown> };
  meta?: { satisfaction?: { score?: string } };
}

interface GorgiasSatisfaction {
  id: number;
  scored_at: string;
  score: "good" | "bad";
  ticket_id: number;
}

export async function weeklySupportSummary(
  client: GorgiasClient,
  args: {
    week_start?: string; // ISO date YYYY-MM-DD
    include_revenue?: boolean;
  }
): Promise<string> {
  const weekStart = args.week_start ?? getPastMonday();
  const weekEnd = getDatePlusDays(weekStart, 7);
  const includeRevenue = args.include_revenue !== false;

  const lines: string[] = [
    `## 📋 Weekly Support Summary`,
    `**Period**: ${weekStart} → ${weekEnd}`,
    `*(Gorgias data — may lag a few minutes)*`,
    ``,
  ];

  // ── Volume ────────────────────────────────────────────────────────────────

  const [openData, createdData, closedData] = await Promise.allSettled([
    client.get<{ meta: { total_count: number } }>(`/tickets?status=open&limit=1`),
    client.get<{ data: GorgiasTicketStub[]; meta: { total_count: number } }>(
      `/tickets?limit=100&created_datetime_start=${weekStart}&created_datetime_end=${weekEnd}`
    ),
    client.get<{ meta: { total_count: number } }>(
      `/tickets?status=closed&limit=1&closed_datetime_start=${weekStart}&closed_datetime_end=${weekEnd}`
    ),
  ]);

  const openCount = openData.status === "fulfilled" ? openData.value.meta.total_count : 0;
  const createdCount = createdData.status === "fulfilled" ? createdData.value.meta.total_count : 0;
  const closedCount = closedData.status === "fulfilled" ? closedData.value.meta.total_count : 0;
  const resolutionRate = createdCount > 0 ? Math.round((closedCount / createdCount) * 100) : 0;

  lines.push(`### 📊 Volume`);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Created this week | **${createdCount}** |`);
  lines.push(`| Closed this week | **${closedCount}** |`);
  lines.push(`| Resolution rate | **${resolutionRate}%** |`);
  lines.push(`| Currently open | **${openCount}** |`);
  lines.push(``);

  // ── Channel breakdown (from created tickets sample) ───────────────────────

  if (createdData.status === "fulfilled" && createdData.value.data.length > 0) {
    const tickets = createdData.value.data;
    const channelCounts: Record<string, number> = {};
    tickets.forEach(t => {
      channelCounts[t.channel] = (channelCounts[t.channel] ?? 0) + 1;
    });

    const topChannels = Object.entries(channelCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    lines.push(`### 📡 Channels (This Week Sample)`);
    lines.push(`| Channel | Tickets |`);
    lines.push(`|---------|---------|`);
    for (const [channel, count] of topChannels) {
      lines.push(`| ${channel} | ${count} |`);
    }
    lines.push(``);

    // ── Tag breakdown ─────────────────────────────────────────────────────
    const tagCounts: Record<string, number> = {};
    tickets.forEach(t => t.tags.forEach(tg => {
      tagCounts[tg.name] = (tagCounts[tg.name] ?? 0) + 1;
    }));
    const topTags = Object.entries(tagCounts).sort(([, a], [, b]) => b - a).slice(0, 8);

    if (topTags.length) {
      lines.push(`### 🏷 Top Tags (Sample of ${tickets.length} tickets)`);
      lines.push(`| Tag | Count |`);
      lines.push(`|-----|-------|`);
      for (const [tag, count] of topTags) {
        lines.push(`| ${tag} | ${count} |`);
      }
      if (createdCount > 100) lines.push(`*(Based on first 100 of ${createdCount} tickets)*`);
      lines.push(``);
    }

    // ── Revenue at stake (from Shopify data) ──────────────────────────────
    if (includeRevenue) {
      const ticketsWithLtv = tickets.filter(t => t.customer?.data?.total_spent);
      if (ticketsWithLtv.length > 0) {
        const totalLtv = ticketsWithLtv.reduce(
          (sum, t) => sum + Number(t.customer?.data?.total_spent ?? 0), 0
        );
        const avgLtv = totalLtv / ticketsWithLtv.length;
        const highValueCount = ticketsWithLtv.filter(
          t => Number(t.customer?.data?.total_spent ?? 0) >= 1000
        ).length;

        lines.push(`### 💰 Revenue Intelligence (Shopify-linked tickets)`);
        lines.push(`| Metric | Value |`);
        lines.push(`|--------|-------|`);
        lines.push(`| Tickets with Shopify data | ${ticketsWithLtv.length} / ${tickets.length} |`);
        lines.push(`| Total customer LTV at stake | $${totalLtv.toFixed(0)} |`);
        lines.push(`| Avg LTV per ticket | $${avgLtv.toFixed(0)} |`);
        lines.push(`| High-value tickets (LTV ≥ $1K) | **${highValueCount}** |`);
        lines.push(``);
      }
    }
  }

  // ── SLA health (stale open tickets) ──────────────────────────────────────
  try {
    const staleData = await client.get<{ data: GorgiasTicketStub[]; meta: { total_count: number } }>(
      `/tickets?status=open&limit=1&order_by=updated_datetime&order_direction=asc`
    );
    const staleOpenCount = staleData.meta.total_count;
    // Sample oldest 20 to see how many are truly stale (>24h)
    const staleSample = await client.get<{ data: GorgiasTicketStub[] }>(
      `/tickets?status=open&limit=20&order_by=updated_datetime&order_direction=asc`
    );
    const trulyStale = staleSample.data.filter(t => hoursSince(t.updated_datetime) >= 24);
    const staleEmoji = trulyStale.length === 0 ? "✅" : trulyStale.length < 5 ? "🟡" : "🔴";

    lines.push(`### ⏱ SLA Health`);
    lines.push(`${staleEmoji} **${trulyStale.length}** tickets in oldest-20 not updated in 24+ hours.`);
    if (trulyStale.length > 0) {
      lines.push(`> Run \`list_sla_breaches\` for the full ranked breach list.`);
    }
    lines.push(``);
  } catch {
    lines.push(`*SLA health check unavailable.*\n`);
  }

  // ── CSAT ─────────────────────────────────────────────────────────────────
  try {
    const csatData = await client.get<{ data: GorgiasSatisfaction[]; meta: { total_count: number } }>(
      `/satisfaction-surveys?limit=100&scored_at_start=${weekStart}&scored_at_end=${weekEnd}`
    );

    const ratings = csatData.data;
    if (ratings.length > 0) {
      const good = ratings.filter(r => r.score === "good").length;
      const bad = ratings.filter(r => r.score === "bad").length;
      const csatPct = Math.round((good / (good + bad)) * 100);
      const csatEmoji = csatPct >= 90 ? "✅" : csatPct >= 75 ? "🟡" : "🔴";

      lines.push(`### ⭐ CSAT`);
      lines.push(`| Metric | Value |`);
      lines.push(`|--------|-------|`);
      lines.push(`| Ratings received | ${ratings.length} |`);
      lines.push(`| Good | ${good} |`);
      lines.push(`| Bad | ${bad} |`);
      lines.push(`| CSAT score | ${csatEmoji} **${csatPct}%** |`);
      lines.push(``);
    } else {
      lines.push(`*CSAT: No ratings received this period.*\n`);
    }
  } catch {
    lines.push(`*CSAT: Could not load satisfaction surveys.*\n`);
  }

  // ── Manager digest ────────────────────────────────────────────────────────
  lines.push(`---`);
  lines.push(`### 📝 Manager Digest`);

  if (resolutionRate >= 100) {
    lines.push(`Team resolved all tickets created this week — healthy throughput.`);
  } else if (resolutionRate >= 80) {
    lines.push(`Team resolved ${resolutionRate}% of this week's tickets. On track.`);
  } else {
    lines.push(`⚠️ Resolution rate is ${resolutionRate}% — backlog may be building. Check open queue and staffing.`);
  }

  lines.push(``);
  lines.push(`> **Note**: Volume data accuracy depends on Gorgias API cursor. For full Explore-level precision, verify in Gorgias Analytics.`);

  return lines.join("\n");
}

function getPastMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

function getDatePlusDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
