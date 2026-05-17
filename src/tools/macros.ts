import { GorgiasClient } from "../gorgias-client.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MacroAction {
  type: string;         // "assign-team", "assign-agent", "add-tag", "remove-tag", "send-message", "close-ticket", etc.
  value?: unknown;
}

interface GorgiasMacro {
  id: number;
  name: string;
  created_datetime: string;
  updated_datetime: string;
  actions: MacroAction[];
  visibility: "private" | "team" | "all";
}

// ─── Gorgias macro action types ───────────────────────────────────────────────

const ACTION_TYPES = [
  "add-tag",
  "remove-tag",
  "assign-agent",
  "assign-team",
  "send-message",
  "close-ticket",
  "reopen-ticket",
  "set-priority",
  "add-note",
  "move-to-spam",
  "snooze",
] as const;

// ─── NL Spec Parser ───────────────────────────────────────────────────────────

function parseSpec(spec: string): { actions: MacroAction[]; warnings: string[] } {
  const actions: MacroAction[] = [];
  const warnings: string[] = [];
  const lower = spec.toLowerCase();

  // Close ticket
  if (lower.includes("close ticket") || lower.includes("mark as closed") || lower.includes("resolve")) {
    actions.push({ type: "close-ticket" });
  }

  // Reopen
  if (lower.includes("reopen") || lower.includes("re-open")) {
    actions.push({ type: "reopen-ticket" });
  }

  // Add tags
  const addTagMatch = spec.match(/add\s+tags?[:\s]+([^\n.;]+)/i);
  if (addTagMatch) {
    const tags = addTagMatch[1].split(/[,\s]+/).map(t => t.trim().toLowerCase()).filter(Boolean);
    tags.forEach(tag => actions.push({ type: "add-tag", value: tag }));
  }

  // Remove tags
  const removeTagMatch = spec.match(/remove\s+tags?[:\s]+([^\n.;]+)/i);
  if (removeTagMatch) {
    const tags = removeTagMatch[1].split(/[,\s]+/).map(t => t.trim().toLowerCase()).filter(Boolean);
    tags.forEach(tag => actions.push({ type: "remove-tag", value: tag }));
  }

  // Send message / reply
  const msgMatch = spec.match(/(?:send|reply|respond)\s+(?:with\s+)?(?:message\s+)?(?:"|')?([^"'\n]{10,}?)(?:"|')?(?:\.|$)/im);
  if (msgMatch) {
    actions.push({
      type: "send-message",
      value: {
        channel: "email",
        public: true,
        body_html: `<p>${msgMatch[1].trim()}</p>`,
        body_text: msgMatch[1].trim(),
      },
    });
  }

  // Add internal note
  const noteMatch = spec.match(/(?:add|post)\s+(?:internal\s+)?note[:\s]+(?:"|')?([^"'\n]{5,}?)(?:"|')?(?:\.|$)/im);
  if (noteMatch) {
    actions.push({
      type: "add-note",
      value: {
        body_html: `<p>${noteMatch[1].trim()}</p>`,
        body_text: noteMatch[1].trim(),
      },
    });
  }

  if (actions.length === 0) {
    warnings.push(
      "Could not parse any actions from spec. Try explicit format like:\n" +
      '  "Add tags: billing-query. Send message: We are looking into your issue. Close ticket."'
    );
  }

  return { actions, warnings };
}

// ─── List Macros ──────────────────────────────────────────────────────────────

export async function listMacros(
  client: GorgiasClient,
  args: { query?: string; limit?: number }
): Promise<string> {
  const limit = Math.min(args.limit ?? 50, 100);
  let url = `/macros?limit=${limit}&order_by=updated_datetime&order_direction=desc`;
  if (args.query) url += `&search=${encodeURIComponent(args.query)}`;

  const data = await client.get<{ data: GorgiasMacro[]; meta: { total_count: number } }>(url);

  if (!data.data.length) {
    return `No macros found${args.query ? ` matching "${args.query}"` : ""}.`;
  }

  const lines = [
    `## Macros (${data.data.length} of ${data.meta.total_count} total)`,
    ``,
  ];

  for (const m of data.data) {
    lines.push(
      `**#${m.id}** — ${m.name}`,
      `  Actions: ${m.actions.length} | Visibility: ${m.visibility}`,
      ``
    );
  }

  return lines.join("\n");
}

// ─── Get Macro ────────────────────────────────────────────────────────────────

export async function getMacro(
  client: GorgiasClient,
  args: { macro_id: number }
): Promise<string> {
  const m = await client.get<GorgiasMacro>(`/macros/${args.macro_id}`);

  return [
    `## Macro #${m.id}: ${m.name}`,
    `- **Visibility**: ${m.visibility}`,
    `- **Actions**: ${m.actions.length}`,
    ``,
    `### Actions:`,
    "```json",
    JSON.stringify(m.actions, null, 2),
    "```",
  ].join("\n");
}

// ─── Create Macro From Spec ───────────────────────────────────────────────────

export async function createMacroFromSpec(
  client: GorgiasClient,
  args: {
    name: string;
    spec: string;
    visibility?: "private" | "team" | "all";
    dry_run?: boolean;
  }
): Promise<string> {
  const dryRun = args.dry_run !== false;
  const visibility = args.visibility ?? "team";

  let actions: MacroAction[];
  let warnings: string[] = [];

  // Try JSON first
  try {
    const parsed = JSON.parse(args.spec) as MacroAction[];
    if (Array.isArray(parsed)) {
      actions = parsed;
      // Validate action types
      for (const a of actions) {
        if (!ACTION_TYPES.includes(a.type as typeof ACTION_TYPES[number])) {
          warnings.push(`Unknown action type: "${a.type}". Valid types: ${ACTION_TYPES.join(", ")}`);
        }
      }
    } else throw new Error("not array");
  } catch {
    // Parse as NL
    const parsed = parseSpec(args.spec);
    actions = parsed.actions;
    warnings = parsed.warnings;
  }

  if (dryRun) {
    return [
      `## 🔍 Dry-Run — Macro Preview`,
      `**Name**: ${args.name}`,
      `**Visibility**: ${visibility}`,
      `**Mode**: Preview only — NOT created`,
      ``,
      `### Actions to create:`,
      "```json",
      JSON.stringify(actions, null, 2),
      "```",
      ``,
      warnings.length ? `### ⚠️ Warnings\n${warnings.map(w => `- ${w}`).join("\n")}` : "",
      `---`,
      `To create: call \`create_macro_from_spec\` with \`dry_run: false\`.`,
    ].filter(Boolean).join("\n");
  }

  if (actions.length === 0) {
    return `❌ Cannot create macro with 0 actions.\n\n${warnings.join("\n")}`;
  }

  const result = await client.post<GorgiasMacro>("/macros", {
    name: args.name,
    actions,
    visibility,
  });

  return [
    `## ✅ Macro Created — #${result.id}`,
    `**Name**: ${result.name}`,
    `**Visibility**: ${result.visibility}`,
    `**Actions**: ${result.actions.length}`,
    ``,
    warnings.length ? `### ⚠️ Notes\n${warnings.map(w => `- ${w}`).join("\n")}` : "",
    ``,
    `Use \`list_macros\` to verify it appears in the library.`,
  ].filter(Boolean).join("\n");
}
