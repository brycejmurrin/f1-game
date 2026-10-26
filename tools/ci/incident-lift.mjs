#!/usr/bin/env node
// incident-lift.mjs — lift a bus INCIDENT freeze once the fix is live.
// @doc Lift an INCIDENT sent with `--fix <sha>` once Pages is green on that sha (writes the `INCIDENT … lifted` bus line).
// @section runner
// @skill agent-fleet
//
// `fleet-bus.mjs send INCIDENT --to '*' --fix <sha> "text"` marks the freeze with `[fix:<sha>]`. merge-gate's
// pacing check freezes game merges until a line containing `lifted` follows, and nobody remembered to send it
// (the Fleet A transcript audit of 2026-10-26, PR #3770, finding 10). This reads the bus, and when the open INCIDENT
// names a fix sha whose pages.yml run is green (ancestry, merge-gate's pagesGreenFor) it sends the lifted line.
//
//   node tools/ci/incident-lift.mjs [--dry-run] [--as <host>:<id>]
//
// Exit 0 lifted or nothing to lift · 2 fix not green yet (pending or red) · 1 usage / bus failure.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readBus, sendBusLine, openFixIncident, whoAmI } from "./fleet-bus.mjs";
import { pagesGreenFor } from "./merge-gate.mjs";

/** Decide from bus entries (oldest first): { action: "none" | "wait" | "lift", sha, entry, text }. Pure but for pagesGreen. */
export function decide(entries, pagesGreen) {
  const open = openFixIncident(entries);
  if (!open) return { action: "none" };
  const g = pagesGreen(open.sha);
  if (g !== true) return { action: "wait", sha: open.sha, entry: open.entry, pages: g };
  const why = `Pages green on ${open.sha.slice(0, 8)} (auto-lift of ${open.entry.from}'s incident)`;
  // A typed incident (audit4 A2) closes by id; the legacy untyped line still takes `lifted: …`.
  return { action: "lift", sha: open.sha, entry: open.entry, text: open.id ? `close ${open.id} ${why}` : `lifted: ${why}` };
}

export function main(argv, { bus = readBus, pages = pagesGreenFor, send = sendBusLine, log = console.log, env = process.env } = {}) {
  const dry = argv.includes("--dry-run");
  const i = argv.indexOf("--as");
  const me = whoAmI(env, i < 0 ? "" : argv[i + 1]);
  const d = decide(bus({ last: 200 }).entries, (sha) => pages(sha));
  if (d.action === "none") { log("= incident-lift: no open INCIDENT with a [fix:<sha>] marker"); return 0; }
  if (d.action === "wait") { log(`= incident-lift: Pages not green on ${d.sha.slice(0, 8)} (${d.pages === false ? "red" : "pending or unknown"}) — still frozen`); return 2; }
  if (dry) { log(`= incident-lift: would send INCIDENT ${d.text}`); return 0; }
  if (!me) { log("= incident-lift: no identity: pass --as <host>:<id> or set APEX_FLEET_AS"); return 1; }
  const r = send("INCIDENT", "*", me, d.text, { log });
  return r.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
