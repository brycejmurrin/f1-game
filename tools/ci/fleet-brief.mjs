#!/usr/bin/env node
// fleet-brief.mjs — the orchestrator hand-off as data: a ≤2 KB JSON and a ≤40-line digest, the successor's first read.
// @doc Hand-off brief for a successor: lanes, slot, cursors, triggers, asks; ≤2 KB JSON + ≤40-line digest.
// Full description: Writes artifacts/fleet-brief/brief.json (at most 2048 bytes) and brief.md (at most 40 lines) for one fleet: the live rows of the queue file (fleet/queue.json, fleet-queue.mjs's format), that fleet's rows of a saved `pr-board.mjs --json`, the newest GAME-SLOT and the last bus lines addressed to the fleet, this session's bus cursor, and the trigger ids and open user asks passed as flags. When the data exceeds the cap the oldest bus lines go first, then board rows, then long texts are cut, then the last lanes; `dropped` counts what went. A brief is a hint to look, never authority.
// @section runner
// @skill agent-fleet
//
// Why (system audit 2026-10-26, FLEET-A finding 6 and lane X1): successors were briefed with free-text hand-offs of
// 4–12 KB that restated rules and carried stale state ("merges paused", a superseded head), and OrchA 33 found 16 unowned
// PRs only after Bryce asked. A capped, generated brief keeps the hand-off to state the successor cannot re-derive
// cheaply; rules stay in AGENTS.md and the skill. Pass the files to the successor's launch prompt or HANDOFF line.
//
//   node tools/ci/fleet-brief.mjs --fleet B [--queue fleet/queue.json] [--board <saved pr-board --json>] \
//     [--bus-json <saved fleet-bus read --json> | --no-bus] [--trigger trig_x …] [--ask "<Bryce's open question>" …] \
//     [--slot "<text>"] [--out artifacts/fleet-brief] [--as <host>:<id>] [--json]
//
// (A `--queue-md` mode and a size stop read from launch-policy.md were documented here by 290012954 but never reached
// this file; audit4 C1 dropped the claim. `--queue-md` is an unknown flag, exit 2.)
//
// AUTHORITY (tx T1, 2026-10-26): brief.md's second line quotes AGENTS.md's STANDING AUTHORITY bullet verbatim (read at run
// time), and an --ask or --slot that narrows it ("Launch only on my typed word", "merges only its own PRs") is refused:
// a seed prompt carrying those two phrases cost Bryce three launch questions in 20 minutes.
//
// Exit: 0 written (or --help), 1 usage or unreadable input, 2 refused (a narrowing phrase) or an unknown flag.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readBus, whoAmI, cursorFile, addressed } from "./fleet-bus.mjs";
import { makeFlags } from "../lib/cli-args.mjs";
import { narrowingHits, standingAuthority } from "./launch-lane.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const MAX_BYTES = 2048;
export const MAX_LINES = 40;
export const DEFAULT_QUEUE = "fleet/queue.json";
export const DEFAULT_OUT = path.join("artifacts", "fleet-brief");
const TERMINAL = ["merged", "closed"];
const BUS_KEEP = 6;

const cut = (s, n) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
const short = (id) => String(id || "").replace(/^claude:session_/, "c:").replace(/^cursor:/, "cu:").slice(0, 14);

/** Queue file text (fleet-queue.mjs: {"rows":[…]} or a bare array) -> live rows. Missing/empty = []. Pure. */
export function queueRows(text) {
  if (!String(text || "").trim()) return [];
  const j = JSON.parse(text);
  const rows = Array.isArray(j) ? j : j.rows;
  if (!Array.isArray(rows)) throw new Error('queue file must be {"rows":[…]}');
  return rows.filter((r) => !TERMINAL.includes(String(r.state || "")))
    .map((r) => ({ pr: Number(r.pr), st: String(r.state || "queued"), owner: String(r.owner || ""), head: String(r.head || "").slice(0, 8), next: String(r.next || "") }))
    .sort((a, b) => a.pr - b.pr);
}

/** Saved `pr-board.mjs --json` text -> this fleet's rows, actionable first. Pure. */
export function boardRows(text, fleet) {
  if (!String(text || "").trim()) return [];
  const j = JSON.parse(String(text).slice(String(text).indexOf("{")));
  const rank = { FIX: 0, SYNC: 1, "FOREIGN-ARM": 2, READY: 3, ARM: 4, WAIT: 5, NONE: 6 };
  return (j.rows || []).filter((r) => r.fleetLetter === fleet)
    .map((r) => ({ pr: Number(r.number), act: String(r.suggest || "?"), why: String(r.why || "") }))
    .sort((a, b) => (rank[a.act] ?? 9) - (rank[b.act] ?? 9) || a.pr - b.pr);
}

/** Bus entries (oldest first) -> { slot, lines } for fleet `L`: the newest GAME-SLOT, the last lines addressed to L or *. Pure. */
export function busDigest(entries, L) {
  const es = entries || [];
  let slot = null;
  for (let i = es.length - 1; i >= 0; i--) if (es[i].type === "GAME-SLOT") { slot = { text: cut(es[i].text, 40), from: short(es[i].from), sha: String(es[i].sha).slice(0, 7) }; break; }
  const mine = es.filter((e) => e.type !== "LEASE" && (addressed(e.to, [L]) || String(e.to).startsWith(`${L}·`)));
  const lines = mine.slice(-BUS_KEEP).map((e) => `${e.at ? new Date(e.at * 1000).toISOString().slice(11, 16) + "Z " : ""}${e.type} to:${e.to} ${short(e.from)} ${cut(e.text, 70)}`);
  return { slot, lines };
}

const bytes = (o) => Buffer.byteLength(JSON.stringify(o));

/** Shrink `brief` in place until JSON.stringify fits `cap` bytes: bus, then board, then texts, then lanes. Returns it. Pure. */
export function fitBrief(brief, cap = MAX_BYTES) {
  const drop = (arr, from = "end") => { (from === "start" ? arr.shift() : arr.pop()); brief.dropped++; };
  while (bytes(brief) > cap && brief.bus.length) drop(brief.bus, "start");
  while (bytes(brief) > cap && brief.board.length) drop(brief.board);
  for (const n of [40, 24]) {
    if (bytes(brief) <= cap) break;
    for (const r of brief.lanes) r.next = cut(r.next, n);
    for (const r of brief.board) r.why = cut(r.why, n);
    brief.asks = brief.asks.map((a) => cut(a, n * 3));
  }
  while (bytes(brief) > cap && brief.lanes.length) drop(brief.lanes);
  while (bytes(brief) > cap && brief.asks.length > 1) drop(brief.asks);
  if (bytes(brief) > cap) throw new Error(`brief still ${bytes(brief)} B after trimming (cap ${cap}): shorten --ask / --slot`);
  return brief;
}

/** The ≤ MAX_LINES markdown digest of a fitted brief; `authority` (AGENTS.md's bullet, one line) is quoted verbatim. Pure. */
export function digest(b, maxLines = MAX_LINES, authority = "") {
  const head = [`# Fleet ${b.fleet} brief — ${b.at.slice(0, 16)}Z by ${short(b.by) || "?"}`,
    ...(authority ? [`authority (AGENTS.md §Concurrent PRs, verbatim; nobody re-asks it): "${authority}"`] : []),
    `slot: ${b.slot ? (typeof b.slot === "string" ? b.slot : `${b.slot.text} (${b.slot.from} ${b.slot.sha})`) : "none"} · bus cursor ${b.cursor.bus || "-"} / tip ${b.cursor.tip || "-"}${b.dropped ? ` · ${b.dropped} item(s) dropped for the 2 KB cap` : ""}`];
  const sections = [
    ["## Lanes", ["| PR | state | owner | head | next |", "|---|---|---|---|---|"], b.lanes.map((r) => `| #${r.pr} | ${r.st} | ${short(r.owner) || "**none**"} | ${r.head || "-"} | ${cut(r.next, 60) || "-"} |`)],
    ["## Board", [], b.board.map((r) => `- #${r.pr} ${r.act} — ${cut(r.why, 70)}`)],
    ["## Own triggers", [], b.triggers.map((t) => `- ${t}`)],
    ["## Open asks", [], b.asks.map((a) => `- ${a}`)],
    ["## Bus (newest last)", [], b.bus.map((l) => `- ${l}`)],
  ].filter(([, , rows]) => rows.length);
  const render = () => [...head, ...sections.flatMap(([h, pre, rows, more]) => ["", h, ...pre, ...rows, ...(more ? [`- … ${more} more in brief.json`] : [])])];
  let out = render();
  while (out.length > maxLines) {
    // Trim the longest section by one row (bus first on ties: it is the cheapest to re-read).
    const s = [...sections].sort((x, y) => y[2].length - x[2].length || (x[0].startsWith("## Bus") ? -1 : 1))[0];
    if (!s || !s[2].length) break;
    s[2].pop();
    s[3] = (s[3] || 0) + 1;
    out = render();
  }
  return out.slice(0, maxLines).join("\n") + "\n";
}

const USAGE = "usage: fleet-brief.mjs --fleet L [--queue F] [--board F] [--bus-json F | --no-bus] [--trigger ID …] [--ask T …] [--slot T] [--out DIR] [--as ID] [--last N] [--json]\n" +
  "  Writes artifacts/fleet-brief/brief.{json,md} (≤ 2 KB, ≤ 40 lines). An --ask/--slot that narrows the standing authority is refused.\n" +
  "  Exit 0 written, 1 usage or unreadable input, 2 refused or an unknown flag.";
function usage(log, msg, code = 1) {
  if (msg) log(`fleet-brief: ${msg}`);
  log(USAGE);
  return code;
}

export function main(argv, { cwd = ROOT, log = console.log, now = () => Date.now(), read = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } },
  bus = (o) => readBus(o), env = process.env } = {}) {
  if (argv.includes("--help") || argv.includes("-h")) { log(USAGE); return 0; }
  const f = { trigger: [], ask: [] };
  const VALUE = new Set(["fleet", "queue", "board", "bus-json", "slot", "out", "as", "last", "trigger", "ask"]);
  const valueAt = (i) => i > 0 && argv[i - 1].startsWith("--") && VALUE.has(argv[i - 1].slice(2));
  try { makeFlags(argv.filter((a, i) => !valueAt(i)), ["--help", "--json", "--no-bus", ...[...VALUE].map((k) => `--${k}`)]); }
  catch (e) { return usage(log, e.message.split("\n")[0], 2); }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") f.json = true;
    else if (a === "--no-bus") f.noBus = true;
    else if (a === "--trigger" || a === "--ask") { const v = argv[++i]; if (v === undefined) return usage(log, `${a} needs a value`); f[a.slice(2)].push(v); }
    else if (a.startsWith("--") && VALUE.has(a.slice(2))) { const v = argv[++i]; if (v === undefined) return usage(log, `${a} needs a value`); f[a.slice(2)] = v; }
    else return usage(log, `unknown argument ${a}`);
  }
  const L = String(f.fleet || "").toUpperCase();
  if (!/^[A-Z]$/.test(L)) return usage(log, "--fleet takes one letter");
  const me = whoAmI(env, f.as || "");
  const authority = standingAuthority(ROOT);
  const narrow = narrowingHits([...f.ask, f.slot || ""].join("\n"));
  if (narrow.length) {
    log(`= brief REFUSED: ${narrow.map((h) => `"${h}"`).join(", ")} narrows the standing authority; drop it. AGENTS.md §Concurrent PRs: "${authority}"`);
    return 2;
  }
  try {
    const lanes = queueRows(read(path.resolve(cwd, f.queue || DEFAULT_QUEUE)));
    const board = f.board ? boardRows(read(path.resolve(cwd, f.board)), L) : [];
    let entries = [], tip = "";
    if (f["bus-json"]) {
      const j = JSON.parse(read(path.resolve(cwd, f["bus-json"])) || "{}");
      entries = Array.isArray(j) ? j : j.entries || [];
      tip = j.tip || "";
    } else if (!f.noBus) {
      const r = bus({ cwd, last: Number(f.last) || 60 });
      entries = r.entries; tip = r.tip;
    }
    const { slot, lines } = busDigest(entries, L);
    let mine = "";
    if (me) try { mine = fs.readFileSync(cursorFile(me), "utf8").trim(); } catch { /* no cursor yet */ }
    const brief = fitBrief({
      v: 1, fleet: L, at: new Date(now()).toISOString(), by: me || "",
      slot: f.slot ? cut(f.slot, 120) : slot,
      cursor: { bus: mine.slice(0, 7), tip: String(tip).slice(0, 7) },
      lanes, board, triggers: f.trigger.map((t) => cut(t, 40)), asks: f.ask.map((a) => cut(a, 200)),
      bus: lines, dropped: 0,
    });
    const out = path.resolve(cwd, f.out || DEFAULT_OUT);
    fs.mkdirSync(out, { recursive: true });
    const md = digest(brief, MAX_LINES, authority);
    fs.writeFileSync(path.join(out, "brief.json"), JSON.stringify(brief) + "\n");
    fs.writeFileSync(path.join(out, "brief.md"), md);
    if (f.json) log(JSON.stringify(brief));
    else { log(md.trimEnd()); log(`= brief ${bytes(brief)} B, ${md.trimEnd().split("\n").length} lines -> ${path.relative(cwd, out)}/brief.{json,md}`); }
    return 0;
  } catch (e) {
    log(`fleet-brief: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
