import { GorgiasClient } from "../gorgias-client.js";

interface GorgiasAccount {
  id: number;
  name: string;
  domain: string;
  timezone: string;
}

interface GorgiasUser {
  id: number;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

export async function gorgiasWhoami(client: GorgiasClient): Promise<string> {
  const [userData, accountData] = await Promise.allSettled([
    client.get<{ data: GorgiasUser[] }>("/users/me"),
    client.get<GorgiasAccount>("/account"),
  ]);

  const user = userData.status === "fulfilled"
    ? userData.value?.data?.[0] ?? null
    : null;

  const account = accountData.status === "fulfilled"
    ? accountData.value
    : null;

  if (!user && !account) {
    throw new Error("Could not verify connection. Check your credentials.");
  }

  // Check Shopify integration presence
  let shopifyStatus = "";
  try {
    const integrations = await client.get<{ data: Array<{ type: string; name: string }> }>("/integrations");
    const shopify = integrations.data?.find(i => i.type === "shopify");
    shopifyStatus = shopify
      ? `\n- **Shopify integration**: ✅ Connected (${shopify.name}) — order context tools available`
      : `\n- **Shopify integration**: Not detected — order context tools will show limited data`;
  } catch {
    shopifyStatus = `\n- **Shopify integration**: Could not check`;
  }

  return [
    `## ✅ Gorgias Connection Verified`,
    ``,
    user ? `- **User**: ${user.name} (${user.email})` : "",
    user ? `- **Role**: ${user.role}` : "",
    account ? `- **Account**: ${account.name}` : "",
    account ? `- **Domain**: ${account.domain}.gorgias.com` : "",
    account ? `- **Timezone**: ${account.timezone}` : "",
    shopifyStatus,
    ``,
    `**Auth type**: API Token (Basic)`,
    `**Status**: Connected and authenticated`,
    ``,
    `> Run \`search_tickets\` or \`weekly_support_summary\` to start.`,
  ].filter(Boolean).join("\n");
}
