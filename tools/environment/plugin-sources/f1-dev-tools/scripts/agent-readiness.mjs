#!/usr/bin/env node
// @doc Agent readiness: canonical F1 environment and plugin support.
// Read host capability names only. Does not launch agents, read credentials or mutate configuration.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { toolNames } from "./readiness.mjs";

export function inspectAgents(names = null) {
  if (names !== null) names = toolNames(names);
  const matched = pattern => names === null ? [] : names.filter(name => pattern.test(name));
  const capability = pattern => {
    const tools = matched(pattern);
    return { exposure: names === null ? "UNKNOWN" : tools.length ? "EXPOSED_UNVERIFIED" : "NOT_EXPOSED", tools };
  };
  const native = {
    spawn: capability(/^collaboration\.spawn_agent$/),
    message: capability(/^collaboration\.send_message$/),
    followup: capability(/^collaboration\.followup_task$/),
    status: capability(/^collaboration\.list_agents$/),
    interrupt: capability(/^collaboration\.interrupt_agent$/),
    wait: capability(/^collaboration\.wait_agent$/),
  };
  const all = object => Object.values(object).every(row => row.exposure === "EXPOSED_UNVERIFIED");
  return {
    schemaVersion: 1, snapshot: names === null ? "UNKNOWN" : "SUPPLIED_UNVERIFIED",
    native,
    routes: {
      nativeTeam: all(native) ? "AVAILABLE_NEEDS_LIVE_TEST" : names === null ? "UNKNOWN" : "INCOMPLETE",
    },
    external: {
      claude: capability(/^mcp__claude[_a-z]*__(?:create_session|send_message|list_sessions)$/),
      cursor: capability(/^mcp__cursor[_a-z]*__(?:create_agent|list_agents|send_message)$/),
      codexCloud: capability(/^mcp__codex_cloud__(?:create_session|create_task|list_sessions|send_message)$/),
      note: "A matching name is a candidate only; discover each provider's full schema and make a harmless service call. No external launch is certified here.",
    },
    serviceChecks: "NOT_RUN",
    limits: ["Native team controls do not address arbitrary chats or external sessions.",
      "Cross-session state lives on GitHub (issues, labels, PR bodies, comments; the repo's docs/WORKERS.md); none of it launches or wakes a worker.",
      "Local MCP declarations and installed skills do not prove host tool exposure."],
  };
}

export function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({ args: argv, options: {
    catalog: { type: "string" }, out: { type: "string" }, help: { type: "boolean" },
  } });
  if (values.help) {
    process.stdout.write("Usage: node scripts/agent-readiness.mjs [--catalog host-tools.json] [--out NEW_FILE]\nRead-only names; no agent launch, credentials, network calls or config changes.\n");
    return;
  }
  let names = null;
  if (values.catalog) {
    if (fs.statSync(values.catalog).size > 2 * 1024 * 1024) throw new Error("Catalog exceeds 2 MiB");
    names = toolNames(JSON.parse(fs.readFileSync(values.catalog, "utf8")));
  }
  const text = JSON.stringify(inspectAgents(names), null, 2) + "\n";
  if (values.out) fs.writeFileSync(values.out, text, { flag: "wx" });
  process.stdout.write(text);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }
}
