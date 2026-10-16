#!/usr/bin/env node
// handback.mjs — the worker's PR hand-off, verified and printed once.
// @doc Verifies a PR head's CI + ready-gate, prints one SWEEP and one DONE line, lists check-ins to delete.
// Full description: Reads the PR (head sha, body), the head's `= ci` verdict (ci-watch --once) and ready-gate (Structural guards + Plan). Green: prints exactly one `SWEEP <PR#>` line and one `DONE …` line for the parent in the fleet block (it sends nothing — the caller does, once), then the `checkin=` triggers to delete_trigger. Red / pending / Plan open: prints why and exits 1 with no SWEEP.
// @skill agent-fleet
//
//   node tools/ci/handback.mjs --pr 12 [--json] [--ci <passed|…>]
//
// Check-in triggers: a MCP trigger id cannot be listed from a shell, so record
// each one in the PR's fleet block when you arm it —
//   node tools/ci/pr-body.mjs --pr 12 --fleet checkin=trig_01abc
// — and this lists every `checkin:` value as `delete_trigger <id>`.
//
// Exit 0 hand-back ready, 1 not ready, 3 API / token error.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate, resolveSha, withPlan } from "./ready-gate.mjs";
import { fleetEntries } from "./pr-body.mjs";
import { CliArgError, exitIfHelp, makeFlags } from "../lib/cli-args.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** `= ci <verdict>` of the head, from ci-watch --once. */
export function ciVerdict(sha, { run = spawnSync } = {}) {
  const r = run("node", ["tools/ci/ci-watch.mjs", "--sha", sha, "--once"], { cwd: ROOT, encoding: "utf8", timeout: 120000 });
  const m = /= ci (\w+)/.exec(`${r.stdout || ""}\n${r.stderr || ""}`);
  return m ? m[1] : "unknown";
}

/** Pure: assemble the hand-back lines from the verdicts and the PR body. */
export function handbackPlan({ pr, sha, ci, gate, body }) {
  const fleet = fleetEntries(body);
  const get = (k) => fleet.find(([key]) => key === k)?.[1] || "";
  const checkins = fleet.filter(([k]) => k === "checkin").flatMap(([, v]) => v.split(",")).map((v) => v.trim()).filter((v) => v && v !== "none");
  const ready = ci === "passed" && gate.code === 0;
  const why = [];
  if (ci !== "passed") why.push(`ci ${ci}`);
  if (gate.code !== 0) why.push(`ready-gate ${gate.state} — ${gate.evidence}`);
  const parent = get("orchestrator");
  return {
    ready, why, checkins, parent,
    sweep: ready ? `SWEEP ${pr}` : null,
    done: ready ? `DONE #${pr} head ${sha.slice(0, 7)} ci passed ready-gate ${gate.state}` : null,
  };
}

const USAGE = `usage: node tools/ci/handback.mjs --pr <n> [--json]
  Verifies the PR head (ci-watch --once = ci passed, ready-gate incl. the Plan), then prints ONE
  "SWEEP <n>" line and ONE "DONE …" line for the parent named by the fleet block's orchestrator:
  send each once with send_message. Sends nothing. Lists the fleet block's checkin= triggers to delete.`;

export function main(argv, { resolve = resolveSha, gateFor = evaluate, ci = ciVerdict, log = console.log } = {}) {
  const f = makeFlags(argv, ["--pr", "--json", "--help"]);
  const pr = f.flag("--pr");
  if (!/^\d+$/.test(pr || "")) throw new CliArgError("--pr <n> is required");
  const r = resolve({ pr });
  if (r.error) { log(`[handback] = handback unknown — ${r.error}`); return 3; }
  const gate = withPlan(gateFor({ sha: r.sha }), r.body);
  const p = handbackPlan({ pr: Number(pr), sha: r.sha, ci: ci(r.sha), gate, body: r.body });
  if (f.has("--json")) { log(JSON.stringify(p, null, 2)); return p.ready ? 0 : 1; }
  if (!p.ready) { log(`[handback] = handback not-ready — ${p.why.join("; ")}`); return 1; }
  log(`[handback] = handback ready — #${pr} head ${r.sha.slice(0, 7)}`);
  log(p.sweep);
  log(p.parent ? `DONE (to ${p.parent}): ${p.done}` : `DONE: ${p.done}`);
  if (p.checkins.length) for (const t of p.checkins) log(`delete_trigger ${t}`);
  else log("no checkin= in the fleet block: list_triggers and delete your own check-ins");
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  exitIfHelp(argv, USAGE);
  try { process.exit(main(argv)); }
  catch (e) {
    if (!(e instanceof CliArgError)) throw e;
    console.error(`${e.message}\n\n${USAGE}`);
    process.exit(1);
  }
}
