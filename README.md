# Gorgias Ecommerce Support Ops MCP

> Production-safe Gorgias MCP for Claude, Cursor, and any MCP-compatible AI assistant.
> Shopify order context · Dry-run ticket writes · SLA breach radar · Revenue intelligence · NL macro authoring

[![MCPize](https://img.shields.io/badge/MCPize-Marketplace-blue)](https://mcpize.com/mcp/gorgias-ecom-support-ops-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## Why this server exists

Every Gorgias MCP that exists today is basic ticket CRUD — no Shopify context, no safety gates, no SLA intelligence, no macro authoring. This server is built for D2C ecommerce teams where a $2,400 LTV customer sending a $30 refund request needs a different response than a first-time buyer, and where an AI making an unreviewed change to a live ticket is a real problem.

**What makes this different:**

| Gap in existing tools | What this server does |
|-----------------------|-----------------------|
| No Shopify context on tickets | Order history, LTV, tier assessment on every ticket |
| Write access without guardrails | Every write defaults to dry-run + explicit `confirm: true` gate |
| No SLA intelligence | Breach radar ranked by wait time with revenue weighting |
| Macro authoring requires UI | Natural language → validated actions[] → preview → create |
| No revenue reporting | Weekly digest includes customer LTV at stake per ticket cohort |

---

## Tools (14 total)

### Connection
| Tool | Description |
|------|-------------|
| `gorgias_whoami` | Verify auth, user role, and Shopify integration status |

### Tickets
| Tool | Description |
|------|-------------|
| `search_tickets` | Search by keyword, status, channel, assignee, or tag |
| `get_ticket` | Full ticket with Shopify order context and last messages |
| `preview_ticket_update` | **Dry-run** diff of proposed changes — nothing applied |
| `execute_ticket_update` | Apply changes (requires `confirm: true`) |
| `add_internal_note` | Add private note (dry-run default) |

### Customers
| Tool | Description |
|------|-------------|
| `get_customer` | Profile + Shopify LTV, order count, tier assessment |
| `search_customers` | Find customers by name or email |

### SLA
| Tool | Description |
|------|-------------|
| `list_sla_breaches` | Open tickets ranked by breach risk with customer LTV context |
| `explain_ticket_sla` | Per-ticket SLA story: FRT, wait, CSAT, risk verdict |

### Reporting
| Tool | Description |
|------|-------------|
| `weekly_support_summary` | Volume, resolution rate, channels, top tags, SLA health, CSAT, revenue at stake |

### Macros
| Tool | Description |
|------|-------------|
| `create_macro_from_spec` | NL or JSON spec → validated actions[] → dry-run → create |
| `list_macros` | Browse macro library |
| `get_macro` | Fetch macro definition |

---

## Quick Start

### 1. Get a Gorgias API token

In Gorgias: **Settings → REST API → Create API Key**

Keep your subdomain handy — it's the part before `.gorgias.com`.

### 2. Add to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gorgias-support-ops": {
      "command": "npx",
      "args": ["-y", "gorgias-ecom-support-ops-mcp"],
      "env": {
        "GORGIAS_DOMAIN": "your-subdomain",
        "GORGIAS_EMAIL": "you@yourstore.com",
        "GORGIAS_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

Restart Claude Desktop. Run `gorgias_whoami` to confirm the connection.

### 3. Or use via MCPize

Subscribe at [mcpize.com/mcp/gorgias-ecom-support-ops-mcp](https://mcpize.com/mcp/gorgias-ecom-support-ops-mcp) — enter your credentials once and get a hosted MCP endpoint.

---

## Example Conversations

**Morning triage:**
```
"Show me all open tickets that haven't been updated in 24 hours"
→ list_sla_breaches hours_without_update:24

"Tell me the full SLA story on ticket 55123"
→ explain_ticket_sla ticket_id:55123
```

**High-value customer handling:**
```
"Look up customer jane@brandx.com"
→ get_customer email:jane@brandx.com
→ Returns: $4,200 LTV, 12 orders, 🏆 High-value

"Get ticket 55123 with her order context"
→ get_ticket ticket_id:55123
```

**Safe ticket update:**
```
"Preview closing ticket 55123 and adding tag resolved-refund"
→ preview_ticket_update ticket_id:55123 changes:{status:"closed", tags_add:["resolved-refund"]}

"Looks good, apply it"
→ execute_ticket_update ticket_id:55123 changes:{...} confirm:true
```

**Macro from spec:**
```
"Create a macro called 'Refund Approved': add tag refund-approved, send message
 'Your refund has been processed and will appear in 3-5 business days.', close ticket"
→ create_macro_from_spec name:"Refund Approved" spec:"..." dry_run:true
→ [review actions]
→ create_macro_from_spec ... dry_run:false
```

**Weekly report:**
```
"Give me the weekly summary for the week starting 2025-01-13"
→ weekly_support_summary week_start:2025-01-13
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GORGIAS_DOMAIN` | ✅ | Subdomain only — e.g. `acme` for `acme.gorgias.com` |
| `GORGIAS_EMAIL` | ✅ | Agent or admin email |
| `GORGIAS_API_TOKEN` | ✅ | API token from Gorgias Settings → REST API |

---

## Safety Model

- **All writes default to dry-run** — `preview_ticket_update`, `add_internal_note`, and `create_macro_from_spec` preview before applying
- **Explicit confirm gate** — `execute_ticket_update` requires `confirm: true` or it blocks with a clear message
- **Rate limit handling** — 429 responses backed off automatically with `Retry-After` guidance
- **Structured auth errors** — missing scopes explained clearly, not silent failures

---

## Shopify Integration

Shopify context (LTV, order count, tags, last order) appears automatically on `get_ticket`, `get_customer`, `list_sla_breaches`, and `weekly_support_summary` when:

1. Your Gorgias account has the **Shopify integration connected**
2. Tickets are linked to customers with Shopify purchase history

If no Shopify data appears, verify the integration in **Gorgias Settings → Integrations → Shopify**.

---

## Local Development

```bash
git clone https://github.com/rakib78/gorgias-ecom-support-ops-mcp
cd gorgias-ecom-support-ops-mcp
npm install

export GORGIAS_DOMAIN=your-subdomain
export GORGIAS_EMAIL=you@yourstore.com
export GORGIAS_API_TOKEN=your_token

npm run dev
```

Build for production:
```bash
npm run build && npm start
```

Test with MCP Inspector:
```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

---

## License

MIT — Built by [Md Rakibul Islam](https://mdrakibulislam.com)

Zendesk Top Admin · Shopify Expert · Upwork Top Rated Plus · 21,000+ hours · 50+ CRM & ecommerce implementations.
