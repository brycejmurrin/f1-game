#!/usr/bin/env node
// send.mjs — operator-shell front door: message ONE existing session on a vendor
// through that vendor's OWN authenticated CLI (D-030). Same status as the
// `cursor-agents.mjs` write verbs under AGENT-SURFACE.md §Per vendor: Bryce's own
// shell only, NOT for autonomous dispatched agent sessions, and GitHub stays the
// inter-agent coordination bus.
// @doc Operator-shell vendor send: routes <vendor> <session-id> "message" to that vendor's own resume/follow-up CLI verb.
//
// Front-door CLIs only — no network proxy work, no bot-check bypass, no undocumented
// internal endpoints. Credentials come from each CLI's own device-auth login, never
// from a token passed in argv or the environment.
//
//   node tools/agent/send.mjs <vendor> <session-id> "message"
//
// Coverage (only what each vendor exposes through a documented front door):
//   grok    grok -r <id> -p <msg>                      (CLI sessions on this host)
//   cursor  cursor-agent -p --resume <id> <msg>        (the account's cloud agents)
//   claude  claude -p <msg> --resume <id>              (second-account local; cloud needs setup)
//   codex   codex exec resume <id> <msg>               (local recorded threads; cloud tasks have NO follow-up door)
//
// Not covered, by design: Codex Cloud task follow-up (no supported verb) and Grok
// grok.com app chats (no API). The tool says so rather than faking them.
import { spawn } from "node:child_process";

const HOME = process.env.HOME;
const ROUTES = {
  grok:   (id, msg) => ({ bin: `${HOME}/.grok/bin/grok`,         args: ["-r", id, "-p", msg] }),
  // --trust: cursor-agent refuses an untrusted cwd otherwise. --mode ask keeps the
  // resumed chat read-only (Q&A, no edits/shell): this is a messaging tool, not a driver.
  cursor: (id, msg) => ({ bin: `${HOME}/.local/bin/cursor-agent`, args: ["-p", "--trust", "--mode", "ask", "--resume", id, "--output-format", "text", msg] }),
  codex:  (id, msg) => ({ bin: "codex",                           args: ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "resume", id, msg] }),
  claude: (id, msg) => ({ bin: "claude",                          args: ["-p", msg, "--resume", id, "--output-format", "text"],
                          env: scrubClaudeEnv({ CLAUDE_CONFIG_DIR: process.env.APEX_CLAUDE_ALT_DIR || "/root/.claude-alt" }) }),
};

// A second-account claude call must not inherit THIS session's account/org env.
function scrubClaudeEnv(extra) {
  const e = { ...process.env, ...extra };
  for (const k of Object.keys(e)) if (/^(ANTHROPIC_|CLAUDE_CODE_|CLAUDE_SESSION_)/.test(k)) delete e[k];
  return e;
}

function run({ bin, args, env }) {
  return new Promise((resolve) => {
    const p = spawn(bin, args, { env: env ?? process.env });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
    p.on("error", (e) => resolve({ code: -1, out: "", err: String(e) }));
  });
}

const [vendor, id, msg] = process.argv.slice(2);
if (!ROUTES[vendor] || !id || !msg) {
  console.error('usage: node tools/agent/send.mjs <grok|cursor|claude|codex> <session-id> "message"');
  process.exit(2);
}
const { out, err, code } = await run(ROUTES[vendor](id, msg));
if (out) console.log(out);
// Surface stderr only on failure: a clean reply is stdout, and some CLIs (e.g.
// codex) write a token-usage footer to stderr that would otherwise bury it.
if (code !== 0 && err) console.error("[stderr] " + err.split("\n").slice(-3).join("\n"));
process.exit(code === 0 ? 0 : 1);
