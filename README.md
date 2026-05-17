# gorgias-revenue-ops-mcp

> Production-safe Gorgias MCP with dry-run writes, Shopify order context, SLA breach radar, and plain-language weekly CX summaries for DTC support teams.

[![MCPize](https://img.shields.io/badge/MCPize-Listed-blue)](https://mcpize.com/mcp/gorgias-revenue-ops-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## What this does

Connect Claude (or any MCP client) to your Gorgias helpdesk with **enterprise-grade safety**. Every write action shows a dry-run preview first. Every execution requires explicit confirmation. And unlike every other Gorgias MCP, this one surfaces the **linked Shopify order value** directly inside ticket context — so your agents always know what's at stake before they act.

### Tools

| Tool | Type | Description |
|------|------|-------------|
| `gorgias_whoami` | Read | Auth probe + Shopify integration check |
| `search_tickets` | Read | Filter by status, channel, tag, agent, free text |
| `get_ticket` | Read | Full ticket + linked Shopify order value & status |
| `preview_ticket_update` | Dry-run | Compute diff — nothing applied |
| `execute_ticket_update` | Write | Apply changes; `confirm: true` required |
| `add_internal_note` | Write | Private note; dry-run by default |
| `list_sla_breaches` | Read | Breach radar ranked by time remaining |
| `get_revenue_snapshot` | Read | CSAT, channel mix, top tags, resolution rate |
| `weekly_cx_summary` | Read | Plain-language Monday memo for managers |
| `create_macro_from_spec` | Write | Natural language → Gorgias macro; dry-run default |

---

## Quickstart

### 1. Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/gorgias-revenue-ops-mcp.git
cd gorgias-revenue-ops-mcp
npm install
```

### 2. Configure credentials

```bash
cp .env.example .env
```

Edit `.env`:

```env
GORGIAS_DOMAIN=mystore.gorgias.com
GORGIAS_EMAIL=admin@mystore.com
GORGIAS_API_KEY=your_api_key_here
```

**Get your Gorgias API key:** Settings → REST API → Generate API key (admin role recommended).

### 3. Build

```bash
npm run build
```

### 4. Connect to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "gorgias-revenue-ops": {
      "command": "node",
      "args": ["/absolute/path/to/gorgias-revenue-ops-mcp/dist/index.js"],
      "env": {
        "GORGIAS_DOMAIN": "mystore.gorgias.com",
        "GORGIAS_EMAIL": "admin@mystore.com",
        "GORGIAS_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

Restart Claude Desktop. Type `gorgias_whoami` to confirm connection.

### 5. Inspect / test locally

```bash
npm run inspect
```

Opens MCP Inspector in your browser — run any tool interactively before connecting to Claude.

---

## Example prompts

```
Show me all open tickets tagged "refund" assigned to Sarah
```
```
Get ticket 12345 — what Shopify order is linked to it?
```
```
Preview closing ticket 12345 and removing the "urgent" tag
```
```
List all SLA breaches right now, ranked by how overdue they are
```
```
Give me a weekly CX summary for the week of 2025-05-12
```
```
Create a macro called "Refund Approved" that closes the ticket,
tags it refund-resolved, and adds an internal note saying approved
```

---

## Safety model

All write tools follow a **two-step confirm pattern**:

1. Call `preview_ticket_update` (or any tool with `dry_run: true`) → review the diff
2. Call `execute_ticket_update` with `confirm: true` → change applied + audit note logged

`dry_run` defaults to `true` on all write tools. Nothing touches production unless you explicitly confirm.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GORGIAS_DOMAIN` | ✅ | Your Gorgias subdomain e.g. `mystore.gorgias.com` |
| `GORGIAS_EMAIL` | ✅ | Admin email address |
| `GORGIAS_API_KEY` | ✅ | Gorgias REST API key (admin role) |

---

## Development

```bash
npm run dev       # tsx watch — live reload
npm run build     # compile to dist/
npm run inspect   # MCP Inspector UI
```

---

## Roadmap

- [ ] OAuth multi-tenant flow (agency use)
- [ ] Webhook-driven real-time SLA signals
- [ ] WooCommerce / BigCommerce order context
- [ ] Revenue-weighted ticket queue prioritisation
- [ ] Per-agent performance breakdown in weekly digest

---

## License

MIT — see [LICENSE](LICENSE).

---

## MCPize

Available on [MCPize marketplace](https://mcpize.com/mcp/gorgias-revenue-ops-mcp) with hosted deployment, BYOK setup, and tiered pricing.
