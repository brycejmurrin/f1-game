#!/usr/bin/env node
// @doc Readiness: canonical F1 environment and plugin support.
// Read-only preflight. Uses existing checkout commands; never boots a browser.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const HELP = `Usage: node scripts/readiness.mjs --checkout PATH [--catalog FILE] [--out FILE]
Read-only Git identity + existing Apex status/catalog/doctor CLI probes.
Run from the checkout; keep --out under artifacts/ or scratch/.
--catalog: fresh host tool-name JSON array or {tools:[{name:...}]}.
No snapshot means UNKNOWN, never absent. Tool exposure is not a service check.
Exit 0 = local probes pass (overall can be PARTIAL); exit 1 = local failure.
Each subprocess is bounded to 20 seconds. No installs, browser or host changes.
`;
const MAX_BYTES = 2 * 1024 * 1024;
const definitions = {
  "apex-tools": { wrapper: "tools/mcp/apex-tools-mcp.sh", pattern: /(?:^|[.:]|__)apex_[a-z0-9_]+$/ },
  "apex-lsp": { wrapper: "tools/mcp/lsp-mcp.sh", pattern: /(?:^|[.:]|__)lsp_[a-z0-9_]+$/ },
  "js-debugger": { wrapper: "tools/mcp/js-debugger-mcp.sh", pattern: /(?:^|[.:]|__)debugger_[a-z0-9_]+$/ },
};

export function toolNames(value) {
  const entries = Array.isArray(value) ? value : value?.tools;
  if (!Array.isArray(entries)) throw new Error("catalog must be a tool-name array or {tools:[...]}");
  const names = entries.map((entry) => typeof entry === "string" ? entry : entry?.name);
  if (names.some((name) => typeof name !== "string" || !/^[\w.:-]{1,200}$/.test(name)))
    throw new Error("catalog contains an invalid tool name");
  return [...new Set(names)];
}

export function collect({ checkout, names = null, run = execute, present = fs.existsSync }) {
  const report = {
    schemaVersion: 1, checkedAt: new Date().toISOString(), checkout,
    overall: "PARTIAL", localChecks: "PASS", git: {},
    host: { snapshot: names === null ? "UNKNOWN" : "SUPPLIED_UNVERIFIED", servers: {}, serviceChecks: "SKIP" },
    cli: {}, renderedBehavior: "SKIP", next: [],
  };
  const fail = () => { report.localChecks = "FAIL"; report.overall = "FAIL"; };
  for (const [server, { wrapper, pattern }] of Object.entries(definitions)) {
    const exposed = (names || []).filter((name) => pattern.test(name));
    report.host.servers[server] = { declared: true, wrapperPresent: present(path.join(checkout, wrapper)),
      exposure: names === null ? "UNKNOWN" : exposed.length ? "EXPOSED" : "NOT_EXPOSED", matchedTools: exposed };
  }
  try {
    const sha = run("git", ["rev-parse", "--verify", "HEAD"], checkout).trim();
    if (!/^[0-9a-f]{40,64}$/.test(sha)) throw new Error("invalid Git revision");
    report.git = { outcome: "PASS", sha, dirty: !!run("git", ["status", "--porcelain"], checkout).trim() };
  } catch { report.git = { outcome: "FAIL", reason: "Cannot verify Git revision and working-tree state" }; fail(); }
  const wrapper = path.join(checkout, definitions["apex-tools"].wrapper);
  for (const name of ["apex_status", "apex_catalog", "apex_doctor"]) {
    try {
      const value = JSON.parse(run("bash", [wrapper, "call", name, "{}"], checkout));
      if (value?.ok !== true || (name === "apex_doctor" && (value.out?.ok !== true || value.out?.summary?.fail !== 0)))
        throw new Error("probe did not return a successful result");
      if (name === "apex_status" && (typeof value.lock?.held !== "boolean" || typeof value.next?.action !== "string"))
        throw new Error("status contract incomplete");
      if (name === "apex_catalog" && (!Array.isArray(value.tracks) || !Array.isArray(value.cams)))
        throw new Error("catalog contract incomplete");
      const summary = name === "apex_status"
        ? { browserLockHeld: value.lock?.held ?? null, playwrightBusy: value.playwright?.busy ?? null,
            chromeDaemonUp: value.chromeDaemon?.up ?? null,
            advice: { action: value.next.action, reason: value.next.reason ?? null }, loadavg: value.loadavg ?? null }
        : name === "apex_catalog"
          ? { arrayCounts: Object.fromEntries(Object.entries(value).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length])) }
          : { summary: value.out.summary, warnings: (value.out.checks || []).filter((c) => c.status !== "pass")
              .map(({ id, status, message }) => ({ id, status, message })) };
      report.cli[name] = { outcome: "PASS", summary };
    } catch {
      report.cli[name] = { outcome: "FAIL", reason: "Command failed, timed out, returned unreadable JSON or reported failure; run the checkout command for diagnostics" };
      fail();
    }
  }
  if (names === null) report.next.push("Supply a fresh active-host tool-name snapshot; attachment is unknown.");
  const absent = Object.entries(report.host.servers).filter(([, s]) => s.exposure === "NOT_EXPOSED").map(([n]) => n);
  if (absent.length) report.next.push(`Not exposed in supplied snapshot: ${absent.join(", ")}. Use documented CLI fallbacks in an executable checkout. Local stdio requires a supporting executor; refreshing a hosted chat does not guarantee attachment.`);
  const status = report.cli.apex_status?.summary;
  if (status?.browserLockHeld || status?.playwrightBusy || (status?.advice && status.advice.action !== "ready"))
    report.next.push("Apex occupancy advises waiting or another next action; preserve the existing owner and follow the status advice before a browser launch.");
  if (Object.values(report.host.servers).some((s) => !s.wrapperPresent))
    report.next.push("A declared server wrapper is missing. Confirm checkout version before selecting that workflow.");
  report.next.push("Review doctor warnings; a local PASS does not verify attached services, persistent browser support or rendered behavior.");
  report.next.push("Make harmless host calls before relying on exposed tools. Follow checkout skills for browser ownership and cleanup.");
  return report;
}

function execute(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: "utf8", timeout: 20000, maxBuffer: MAX_BYTES,
    stdio: ["ignore", "pipe", "pipe"] });
}

export function main(argv = process.argv.slice(2)) {
  let report;
  let output;
  try {
    const { values } = parseArgs({ args: argv, options: {
      checkout: { type: "string" }, catalog: { type: "string" }, out: { type: "string" }, help: { type: "boolean" },
    } });
    if (values.help) { process.stdout.write(HELP); return 0; }
    output = values.out;
    if (!values.checkout) throw new Error("--checkout is required; choose the intended worktree explicitly");
    const checkout = fs.realpathSync(path.resolve(values.checkout));
    if (!fs.existsSync(path.join(checkout, "js/game.js")) || !fs.existsSync(path.join(checkout, "tools/mcp/apex-tools-mcp.sh")))
      throw new Error("--checkout is not an Apex game checkout with its existing MCP wrapper");
    let names = null;
    if (values.catalog) {
      if (fs.statSync(values.catalog).size > MAX_BYTES) throw new Error("catalog exceeds 2 MiB");
      names = toolNames(JSON.parse(fs.readFileSync(values.catalog, "utf8")));
    }
    report = collect({ checkout, names });
  } catch (error) {
    report = { schemaVersion: 1, overall: "FAIL", localChecks: "FAIL", reason: error.message };
  }
  const json = JSON.stringify(report, null, 2) + "\n";
  if (output) {
    // Preserve existing evidence; caller chooses a new path for each run.
    fs.writeFileSync(path.resolve(output), json, { flag: "wx" });
  }
  process.stdout.write(json);
  return report.localChecks === "FAIL" ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); }
  catch { process.stderr.write("Readiness report could not be saved; choose a writable, new artifacts/ or scratch/ path.\n"); process.exitCode = 1; }
}
