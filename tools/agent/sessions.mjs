#!/usr/bin/env node
// sessions.mjs — operator-shell front door: LIST your own sessions per harness,
// read-only, through each vendor's own authenticated CLI (D-030, same status as
// send.mjs: Bryce's own shell only, never an autonomous dispatched agent session).
// @doc Operator-shell session roll-up: lists the operator's own sessions per harness via each vendor's own read CLI.
//
// Read-only. Front-door CLIs only — no network proxy work, no bot-check bypass,
// no undocumented endpoint, no token in argv/env. Pairs with send.mjs (the write
// side). Prints one typed line per session so send.mjs can take the id next.
//
//   node tools/agent/sessions.mjs [grok|cursor|all]
//
// Coverage (only harnesses with a real non-interactive list verb):
//   grok    grok sessions list           (CLI sessions on this host)
//   cursor  cursor-agents.mjs list       (the account's cloud agents, via CURSOR_API_KEY)
// Not listed here, by design:
//   claude  no non-interactive cloud list in the CLI; this account's cloud sessions
//           are read through the claude-code-remote MCP (list_sessions), and local
//           background sessions through `claude agents --json`.
//   codex   `codex cloud list` needs an environment id; history via tools/env/codex-cloud-history.py.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HOME = process.env.HOME;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const LISTERS = {
  grok: () => ({ bin: `${HOME}/.grok/bin/grok`, args: ["sessions", "list"] }),
  cursor: () => ({ bin: "node", args: [`${ROOT}/tools/ci/cursor-agents.mjs`, "list", "--limit", "100"] }),
};

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "");

function list(vendor) {
  const spec = LISTERS[vendor]();
  const r = spawnSync(spec.bin, spec.args, { encoding: "utf8", timeout: 90000 });
  const out = stripAnsi((r.stdout || "").trim());
  const lines = out ? out.split("\n").filter((l) => l.trim()) : [];
  console.log(`# ${vendor}: ${lines.length} line(s)${r.status ? ` (exit ${r.status})` : ""}`);
  for (const l of lines) console.log(`${vendor}\t${l}`);
  if (r.status && r.stderr) console.error(`[${vendor} stderr] ${stripAnsi(r.stderr).split("\n").slice(-2).join(" ")}`);
  return r.status || 0;
}

const which = process.argv[2] || "all";
const vendors = which === "all" ? Object.keys(LISTERS) : [which];
if (vendors.some((v) => !LISTERS[v])) {
  console.error(`usage: node tools/agent/sessions.mjs [${Object.keys(LISTERS).join("|")}|all]`);
  console.error("claude cloud sessions: use the claude-code-remote MCP list_sessions; codex: see the file header.");
  process.exit(2);
}
let worst = 0;
for (const v of vendors) worst = list(v) || worst;
process.exit(worst ? 1 : 0);
