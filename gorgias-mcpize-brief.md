# MCPize Brief: Gorgias Revenue Ops MCP

> Generated for MCPize Marketplace (https://mcpize.com)

## Overview
- **Name**: gorgias-revenue-ops-mcp
- **Slug**: gorgias-revenue-ops-mcp
- **One-liner**: Production-safe Gorgias MCP with dry-run writes, Shopify order context, SLA breach radar, and plain-language weekly CX summaries for DTC support teams.
- **Target user**: Support managers, team leads, and senior agents at DTC ecommerce brands (Shopify, WooCommerce, BigCommerce) who want Claude to **act** inside Gorgias with guardrails — not just read tickets.
- **Category**: CRM / Customer support operations (DTC ecommerce)
- **Publish to**: MCPize marketplace
- **Search keywords**: Gorgias MCP, Gorgias AI automation, Gorgias Shopify MCP, ecommerce support ops MCP, SLA breach Gorgias, Gorgias macros API, DTC support operations Claude, Gorgias revenue ops
- **GitHub topics**: mcp, mcp-server, gorgias, ecommerce, shopify, customer-support, sla, helpdesk, dtc, revenue-ops

---

## Problem Statement

Gorgias powers 15,000+ DTC brands — yet teams connecting external AI assistants (Claude, Cursor, etc.) to Gorgias are stuck with **fragmented community servers** that cover basic reads and nothing else. The two existing GitHub alternatives have a combined **3 stars**, no write safety, no Shopify order context, and no MCPize listing.

DTC support teams hit four gaps every day:

1. **Write-access without safety** — Closing tickets, updating tags, assigning agents, and posting notes is possible via the Gorgias REST API, but no MCP product treats **dry-run previews**, **explicit confirmation gates**, and **structured audit logging** as first-class features. One wrong bulk action can corrupt 50 tickets.
2. **Zero revenue context** — Gorgias tickets are linked to Shopify orders, but existing MCP servers fetch the ticket and stop there. Agents need to see order value, fulfillment status, and item count *inside the ticket context* to make smart triage decisions.
3. **SLA blindness** — Support managers manually hunt breaches. No MCP product packages **"breaching now + recommended work order"** as a daily driver inside chat.
4. **Manager reporting** — Gorgias Stats is powerful but requires navigating the UI. Managers want a **Monday morning plain-language digest** (volume, CSAT, tag mix, channel breakdown, open risk) inside Claude — no dashboards, no exports.

This server targets **ops depth + revenue context + safety**, not "another ticket search MCP."

---

## Core Tools (MCP Functions)

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `gorgias_whoami` | Verify domain, auth, and Shopify integrations. | (none) | Connection status, Shopify integration list |
| `search_tickets` | Filter tickets by status, channel, tag, assignee, free text + pagination. | `status`, `channel`, `tag`, `assignee_email`, `query`, `limit`, `page` | Ticket stubs + SLA label + pagination |
| `get_ticket` | Full ticket context: messages, tags, customer, **linked Shopify order value + status**. | `ticket_id` | Ticket JSON + order context + SLA summary |
| `preview_ticket_update` | **Dry-run** — compute diff for status, assignee, tag changes. No execution. | `ticket_id`, `changes` | Unified diff + warnings |
| `execute_ticket_update` | Apply changes; requires `confirm: true`. | `ticket_id`, `changes`, `confirm` | Result + audit note |
| `add_internal_note` | Post private note; `dry_run` defaults to **true**. | `ticket_id`, `body`, `dry_run` | Preview or message ID |
| `list_sla_breaches` | Open tickets with breached or at-risk SLA, ranked by time left. | `limit`, `include_at_risk` | Ranked list + minutes remaining |
| `get_revenue_snapshot` | DTC KPIs: ticket volume, channel mix, top tags, CSAT, resolution rate. | `days` | Aggregated snapshot |
| `weekly_cx_summary` | Plain-language Monday memo: volume, channels, tags, CSAT, recommendations. | `week_start`, `timezone` | Markdown summary |
| `create_macro_from_spec` | NL → Gorgias `actions[]`; validate; `dry_run` defaults to **true**. | `name`, `spec`, `dry_run` | Preview or created macro ID |

**MVP (ship first):** All 10 tools above — auth, search, revenue-linked ticket context, dry-run writes, SLA radar, revenue snapshot, weekly digest, NL macro authoring.

---

## Data Strategy
- **Type**: Data-dependent (Gorgias REST API + Shopify integration data via `/tickets/{id}/integrations`)
- **Day 1**: Subscriber provides **Gorgias domain + email + API key**. All data fetched live — no fabricated datasets, no background sync.
- **Storage**: Stateless. No persistent store required for MVP.
- **Freshness**: Live API. Gorgias search index is real-time for ticket fields; stats endpoints may reflect a short lag. Documented in tool output.
- **Shopify link**: Fetched from Gorgias's own integration layer — no separate Shopify API key required.

### Data Sources

| Source | What it gives | Access | Cost | Day 1? |
|--------|--------------|--------|------|--------|
| Gorgias Tickets API | Full ticket CRUD + messages + tags | Easy (admin API key) | $0 marginal | ✅ |
| Gorgias Integrations API | Linked Shopify order context per ticket | Easy | $0 marginal | ✅ |
| Gorgias Macros API | CRUD macros + actions | Easy | $0 marginal | ✅ |
| Gorgias Stats API | CSAT, resolution rate | Plan-dependent | $0 marginal | ✅ (degrades gracefully) |
| Gorgias Users API | Agent lookup by email for assignment | Easy | $0 marginal | ✅ |

---

## Technical Stack
- **Language**: TypeScript
- **Framework**: Official MCP TypeScript SDK (`@modelcontextprotocol/sdk`)
- **Key deps**: `zod` for input validation; native `fetch` for REST; retry + 429 backoff built-in
- **Hosting**: MCPize Cloud (stateless-first) or self-hosted
- **Estimated build time**: MVP complete (see GitHub). Polish + tests: 1–2 days.

---

## Competitive Landscape

| Server | Stars | Last Update | Scope | Key Gap |
|--------|-------|-------------|-------|---------|
| mattcoatsworth/Gorgias-MCP-Server | ⭐ 3 | Active | Basic ticket read | No dry-run, no writes, no Shopify context, no MCPize listing |
| cacosat/gorgias (PulseMCP) | ⭐ 0 | Mar 2026 | Read ops only | Community-managed, no write path, no revenue context |

### Competitive Advantage
- **Safety-first writes**: Default `dry_run: true`, `confirm: true` gate for execution, audit timestamps on every write.
- **Shopify order context**: Only MCP that surfaces linked order value, fulfillment status, and item count per ticket — the core DTC triage signal.
- **SLA as a product**: Breach radar ranked by time remaining, not just a flat list.
- **Revenue snapshot**: Channel mix, CSAT, tag distribution, resolution rate — inside chat, no dashboard needed.
- **Manager digest**: Opinionated "Monday memo" format with actionable recommendations.
- **MCPize distribution**: Simple BYOK setup, clear pricing tiers.

---

## Monetization Plan

**TAM**: 15,000+ Gorgias customers. Addressable slice: DTC brands using AI assistants for support ops (fast-growing) + MCP early adopters.

**Willingness to pay**: High — SLA misses and slow triage directly cost revenue and CSAT for ecommerce brands.

**Model**: Freemium — generous read tier; paid for writes, SLA radar, revenue snapshot, and digest volume.

### Pricing

| Tier | Price | Calls/day | Features | Target |
|------|-------|-----------|----------|--------|
| Free | $0/mo | 50 | `whoami`, `search_tickets`, `get_ticket` (no order context) | Trial, solo agents |
| Pro | $29/mo | 500 | All reads + order context + dry-run previews + 30 confirmed writes/day | Team leads |
| Team | $49/mo | 2,000 | Full write suite + SLA radar + revenue snapshot + weekly digest + macro CRUD | Support teams |
| Enterprise | Custom | Custom | OAuth roadmap, audit exports, dedicated limits | 50+ seats |

### MCPize Revenue Share
At **85% net**: Team @ $49 → ~$41.65/subscriber before infra. Break-even is low — zero marginal API cost, compute only.

---

## Usage Scenarios

1. **Morning SLA sweep** — `list_sla_breaches` → `get_ticket` for top breach → `preview_ticket_update` → `execute_ticket_update` with confirm.
2. **Revenue-aware triage** — `get_ticket` surfaces $450 Shopify order linked to a shipping complaint → agent escalates immediately.
3. **Safe bulk retag** — `preview_ticket_update` on 10 tickets → review diff → `execute_ticket_update` with confirm.
4. **New macro from spec** — `create_macro_from_spec` dry run → tweak → create.
5. **Monday leadership update** — `weekly_cx_summary` pasted into Slack or Notion.

---

## Risk Register

| # | Risk | Severity | Likelihood | Mitigation |
|---|------|----------|------------|------------|
| 1 | Gorgias API rate limit | High | Med | Retry-After backoff, per-tier call caps |
| 2 | Wrong write (LLM hallucination) | High | Med | Default dry-run; confirm gate; minimal blast radius |
| 3 | Shopify order context missing | Med | Low | Graceful degrade — note "No linked orders found" |
| 4 | CSAT unavailable (plan) | Low | Med | Weekly summary omits CSAT, notes plan limitation |
| 5 | Token leakage | High | Low | Secrets via MCPize env; never logged |

---

## Legal & ToS Compliance
- **Gorgias API Terms**: Commercial use permitted; respect rate limits and customer instance policies.
- **Shopify data**: Fetched via Gorgias integration layer only — no direct Shopify API credentials required.
- **Customer data**: Processor posture — subscriber's Gorgias data; GDPR follows subscriber DPA with Gorgias.
- **Scraping**: Not used — API-only.

---

## Go-to-Market Launch Plan

### Distribution (MCPize-first)
1. Publish on **MCPize** with SEO title: "Gorgias MCP — Shopify Order Context, SLA Radar, Dry-Run Writes"
2. Public **GitHub repo** with MCPize badge + demo GIF
3. Demo: `get_ticket` returning Shopify order value → `preview_ticket_update` diff → `execute_ticket_update` confirm

### Launch Channels
| Channel | Action | When |
|---------|--------|------|
| r/mcp, r/ecommerce, r/shopify | "I built a write-safe Gorgias MCP with Shopify order context" | Week 1 |
| X / LinkedIn | "Your support tickets now know the order value" | Week 1 |
| Gorgias community / Shopify Partners Slack | DM support managers directly | Week 2 |
| DTC newsletters (2PM, Lean Luxe) | Sponsored blurb or organic mention | Month 1 |

---

## Differentiation Matrix

| Feature | gorgias-revenue-ops-mcp | Community MCP servers |
|---------|------------------------|----------------------|
| Dry-run first writes | ✅ | ❌ |
| Shopify order value per ticket | ✅ | ❌ |
| SLA breach + at-risk radar | ✅ | ❌ |
| NL macro → Gorgias actions | ✅ | ❌ |
| Weekly manager digest | ✅ | ❌ |
| Revenue snapshot (CSAT, tags, channels) | ✅ | ❌ |
| MCPize hosted + BYOK | ✅ | ❌ |

---

## Error & Edge Case Handling

| Scenario | Behaviour | Fallback |
|----------|-----------|----------|
| 429 rate limit | Backoff + `Retry-After` | Smaller page sizes |
| No Shopify integration | `get_ticket` notes "No linked orders found" | Ticket data still returned |
| CSAT unavailable | Summary omits section | Notes plan limitation |
| Agent email not found | `execute_ticket_update` throws clear error | Suggest checking email |
| Macro actions invalid | Dry-run returns parsed actions for review | User adjusts spec |

---

## MVP Scope (v1.0)
- Auth probe + Shopify integration check
- Ticket search + full ticket with order context
- Dry-run preview + confirmed ticket updates (status, assignee, tags, internal note)
- SLA breach + at-risk radar
- Revenue snapshot (volume, CSAT, channel mix, top tags)
- Weekly CX summary
- NL macro authoring (dry-run default)

## Future Roadmap (v2.0+)
- OAuth multi-tenant flow for agencies
- Webhook-driven real-time SLA signals
- Per-agent performance breakdown in weekly digest
- WooCommerce / BigCommerce order context (beyond Shopify)
- `prioritize_ticket_queue` with revenue-weighted ordering (high-value orders bubble up)

---

## Success Metrics
- Paid conversion from free tier (target: 5% in month 1)
- Repeat weekly summary usage (habit signal)
- Low incident rate on mistaken writes (dry-run funnel ratio)
- GitHub stars as organic discovery signal

## Next Steps
1. **Run `/mcpize:build`** — scaffold `gorgias-revenue-ops-mcp` from this brief
2. Test MVP tools against a **Gorgias sandbox account**
3. Dogfood with one live store (tag/rate-limit it)
4. **Run `/mcpize:publish`** when quality gate is green
5. Iterate from DTC support manager feedback
