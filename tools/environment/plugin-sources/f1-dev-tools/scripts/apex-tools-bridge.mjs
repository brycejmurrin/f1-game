#!/usr/bin/env node
// @doc Apex tools bridge: canonical F1 environment and plugin support.
// Start the game's existing stdio MCP server from the active checkout.
// F1_GAME_CHECKOUT is explicit when a workspace contains several game trees.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const servers = {
  "apex-tools": "tools/mcp/apex-tools-mcp.sh",
  "apex-lsp": "tools/mcp/lsp-mcp.sh",
  "js-debugger": "tools/mcp/js-debugger-mcp.sh",
};
const server = process.argv[2] || "apex-tools";
if (!Object.hasOwn(servers, server) || process.argv.length > 3) {
  console.error("F1 Dev Tools: expected apex-tools, apex-lsp, or js-debugger.");
  process.exit(1);
}
function gameRoot(start) {
  if (!start) return null;
  let dir = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(dir, "tools/mcp/apex-tools-mcp.sh"))
        && fs.existsSync(path.join(dir, "js/game.js"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const explicit = process.env.F1_GAME_CHECKOUT || process.env.APEX_GAME_CHECKOUT;
const starts = [process.cwd(), process.env.INIT_CWD, process.env.CODEX_CWD].filter(Boolean);
// Hosts can start in the workspace that contains the newly cloned project.
// Only probe the named direct child; never choose among arbitrary repositories.
const children = [...new Set(starts.map(start => gameRoot(path.join(start, "f1-game"))).filter(Boolean))];
const exactRoot = explicit && path.resolve(explicit);
const explicitValid = exactRoot && fs.existsSync(path.join(exactRoot, "tools/mcp/apex-tools-mcp.sh"))
  && fs.existsSync(path.join(exactRoot, "js/game.js"));
const root = explicit ? (explicitValid ? exactRoot : null)
  : starts.map(gameRoot).find(Boolean) || (children.length === 1 ? children[0] : null);
if (!root) {
  console.error(children.length > 1 && !explicit
    ? "F1 Dev Tools: multiple f1-game checkouts found. Set F1_GAME_CHECKOUT to the intended absolute path."
    : "F1 Dev Tools: open a brycejmurrin/f1-game checkout or its parent workspace, or set F1_GAME_CHECKOUT to its absolute path.");
  process.exit(1);
}

const wrapper = path.join(root, servers[server]);
if (!fs.existsSync(wrapper)) {
  console.error(`F1 Dev Tools: ${server} is unavailable in ${root}; update the checkout or select a supported server.`);
  process.exit(1);
}
const gateway = path.join(root, "tools/mcp/output-level-mcp.sh");
const args = fs.existsSync(gateway)
  ? [gateway, "--server", server, "--", "bash", wrapper, "serve"]
  : [wrapper, "serve"];
const child = spawn("bash", args, {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});
child.on("error", (error) => { console.error(`F1 Dev Tools: ${error.message}`); process.exit(1); });
child.on("exit", (code, signal) => { process.exitCode = signal ? 1 : (code ?? 1); });
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
