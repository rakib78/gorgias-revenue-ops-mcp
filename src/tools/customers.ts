import { GorgiasClient } from "../gorgias-client.js";
import { formatDate } from "./tickets.js";

interface GorgiasCustomerFull {
  id: number;
  name: string;
  email: string;
  active_count?: number;
  closed_count?: number;
  data?: Record<string, unknown>;
  created_datetime: string;
  updated_datetime: string;
  channels?: Array<{ type: string; address: string }>;
}

export async function getCustomer(
  client: GorgiasClient,
  args: { customer_id?: number; email?: string }
): Promise<string> {
  let customer: GorgiasCustomerFull;

  if (args.email) {
    const results = await client.get<{ data: GorgiasCustomerFull[] }>(
      `/customers?email=${encodeURIComponent(args.email)}&limit=1`
    );
    if (!results.data.length) {
      return `No customer found with email "${args.email}".`;
    }
    customer = results.data[0];
  } else if (args.customer_id) {
    customer = await client.get<GorgiasCustomerFull>(`/customers/${args.customer_id}`);
  } else {
    return `Provide either \`customer_id\` or \`email\`.`;
  }

  const lines = [
    `## Customer: ${customer.name}`,
    ``,
    `- **Email**: ${customer.email}`,
    `- **Gorgias ID**: ${customer.id}`,
    `- **Open tickets**: ${customer.active_count ?? "—"}`,
    `- **Closed tickets**: ${customer.closed_count ?? "—"}`,
    `- **Created**: ${formatDate(customer.created_datetime)}`,
  ];

  // Channels (email, phone, etc.)
  if (customer.channels?.length) {
    lines.push(`- **Contact channels**: ${customer.channels.map(c => `${c.type}: ${c.address}`).join(" | ")}`);
  }

  // Shopify data
  const d = customer.data ?? {};
  const shopifyLines: string[] = [];

  if (d.shopify_customer_id) shopifyLines.push(`- **Shopify ID**: ${d.shopify_customer_id}`);
  if (d.total_spent) {
    shopifyLines.push(`- **Total spent**: $${Number(d.total_spent).toFixed(2)}`);
  }
  if (d.orders_count) shopifyLines.push(`- **Total orders**: ${d.orders_count}`);
  if (d.state) shopifyLines.push(`- **Shopify state**: ${d.state}`);
  if (d.tags) shopifyLines.push(`- **Shopify tags**: ${d.tags}`);
  if (d.last_order_name) shopifyLines.push(`- **Last order**: ${d.last_order_name}`);
  if (d.accepts_marketing) shopifyLines.push(`- **Marketing opted in**: Yes`);

  if (shopifyLines.length) {
    lines.push(``, `### 🛍 Shopify Data`, ...shopifyLines);

    // Revenue tier assessment
    const spent = Number(d.total_spent ?? 0);
    const orders = Number(d.orders_count ?? 0);
    let tier = "";
    if (spent >= 5000 || orders >= 20) tier = "🏆 High-value customer — handle with care";
    else if (spent >= 1000 || orders >= 5) tier = "⭐ Repeat customer — retention priority";
    else if (orders >= 1) tier = "🔰 Active customer";
    else tier = "🆕 Prospect / no orders yet";

    lines.push(``, `### Customer Tier`, `> ${tier}`);
  } else {
    lines.push(``, `*No Shopify data found. Ensure Shopify integration is connected in Gorgias.*`);
  }

  return lines.join("\n");
}

export async function searchCustomers(
  client: GorgiasClient,
  args: { query: string; limit?: number }
): Promise<string> {
  const limit = Math.min(args.limit ?? 10, 50);
  const data = await client.get<{ data: GorgiasCustomerFull[] }>(
    `/customers?search=${encodeURIComponent(args.query)}&limit=${limit}`
  );

  if (!data.data.length) return `No customers found for "${args.query}".`;

  const lines = [`## Customer Search — "${args.query}"`, ``];
  for (const c of data.data) {
    const spent = c.data?.total_spent ? `$${Number(c.data.total_spent).toFixed(0)} spent` : "";
    const orders = c.data?.orders_count ? `${c.data.orders_count} orders` : "";
    const meta = [spent, orders].filter(Boolean).join(" | ");
    lines.push(
      `**ID ${c.id}** — ${c.name} (${c.email})`,
      meta ? `  ${meta} | Open: ${c.active_count ?? 0} tickets` : `  Open: ${c.active_count ?? 0} tickets`,
      ``
    );
  }

  return lines.join("\n");
}
