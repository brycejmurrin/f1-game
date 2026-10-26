// @doc Aggregate counters for digest command (O(1) memory beyond maps).
import { contentBlocks } from "./stream.mjs";

export function createDigest() {
  return {
    files: 0,
    lines: 0,
    bad: 0,
    roles: Object.create(null),
    types: Object.create(null),
    tools: Object.create(null),
  };
}

export function digestRecord(state, record) {
  const role = record && record.role != null ? String(record.role) : "(none)";
  state.roles[role] = (state.roles[role] || 0) + 1;
  for (const block of contentBlocks(record)) {
    const t = block && block.type != null ? String(block.type) : "(none)";
    state.types[t] = (state.types[t] || 0) + 1;
    if ((t === "tool_use" || t === "tool_result") && typeof block.name === "string") {
      state.tools[block.name] = (state.tools[block.name] || 0) + 1;
    }
  }
}

function sortedEntries(map) {
  return Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Human digest text. */
export function formatDigest(state, topN = 10) {
  const lines = [];
  lines.push(`files=${state.files}`);
  lines.push(`lines=${state.lines}`);
  lines.push(`bad_json_lines=${state.bad}`);
  lines.push("roles:");
  for (const [k, v] of sortedEntries(state.roles)) lines.push(`  ${k}=${v}`);
  lines.push("types:");
  for (const [k, v] of sortedEntries(state.types)) lines.push(`  ${k}=${v}`);
  lines.push(`tools (top ${topN}):`);
  for (const [k, v] of sortedEntries(state.tools).slice(0, topN)) {
    lines.push(`  ${k}=${v}`);
  }
  return lines.join("\n") + "\n";
}
