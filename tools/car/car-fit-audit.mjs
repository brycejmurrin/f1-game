#!/usr/bin/env node
// Do the car's parts actually CONNECT? Offline, no browser.
// @doc Do Car3D parts connect? Per-joint GAP/PENETRATION/ZFIGHT/OPEN audit of the 11 cars; --base = no new failures.
// @skill garage-parts-livery
//
// Bryce, 2026-10-19, on the design galleries: "parts that still don't actually
// connect or they mesh into each other and have weird edges". This builds each
// factory car the way parts-sweep.mjs does (node:vm, Car3D.buildComplete with
// measure:true) and reports, per SECTION pair (the Car3D part("…") markers):
//
//   GAP          a visible cluster of parts touching nothing on the car: its
//                distance to the nearest other surface, mm
//   PENETRATION  how deep one section's vertices sit inside another's closed
//                solid (nearest-face normal-sign test), mm; tyres are strict
//   ZFIGHT       same-facing visible faces of different colour/surface closer
//                than the depth buffer resolves, cm^2 of overlap
//   OPEN         visible boundary edges (paper rims on a double-sided shell), mm;
//                WARN on an absolute run, gating only as NEW/WORSE under --base
//
// Thresholds are FIT in tools/car/lib/fit-geom.mjs, each with its derivation;
// the method and its known blind spots are docs/notes/FIT-AUDIT.md.
//
//   node tools/car/car-fit-audit.mjs                         all 11 factory cars
//   node tools/car/car-fit-audit.mjs --team=ferrari,haas     a subset
//   node tools/car/car-fit-audit.mjs --styles=brakes/style_brakes_bigdisc,cockpit/style_cockpit_fenced
//   node tools/car/car-fit-audit.mjs --all-styles            + every STYLE/PREVIEW option on every car it fits
//   node tools/car/car-fit-audit.mjs --bodies=needle,brick   + body looks (livery bodyStyle); --all-bodies = every BODY_STYLES id
//   node tools/car/car-fit-audit.mjs --checks=GAP,PENETRATION
//   node tools/car/car-fit-audit.mjs --json                  machine output (rows + joints)
//   node tools/car/car-fit-audit.mjs --base origin/claude/f1-game-project-26h3ng
//        only NEW or WORSE failures vs that ref fail; pre-existing ones are listed
//   node tools/car/car-fit-audit.mjs --write-baseline f.json / --baseline f.json
//        the same comparison against a saved run
//
// Exit 1 on any FAIL (OPEN is WARN), or with --base/--baseline on any NEW/WORSE row.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { FIT, loadCar, buildCar, analyse } from "./lib/fit-geom.mjs";
import { gaps, penetration, zfight, openEdges } from "./lib/fit-checks.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const CHECKS = Object.freeze(["GAP", "PENETRATION", "ZFIGHT", "OPEN"]);

// ── one car ────────────────────────────────────────────────────────────────
export function auditMesh(mesh, checks = CHECKS) {
  const A = analyse(mesh);
  const rows = [];
  let joints = [];
  if (checks.includes("GAP")) { const g = gaps(A); rows.push(...g.rows); joints = g.joints; }
  if (checks.includes("PENETRATION")) rows.push(...penetration(A));
  if (checks.includes("ZFIGHT")) rows.push(...zfight(A));
  if (checks.includes("OPEN")) rows.push(...openEdges(A));
  return { rows: merge(rows), joints, pieces: A.pieces.length };
}

// Rows with the same check|a|b fold into one: n, the worst value and where.
function merge(rows) {
  const by = new Map();
  for (const r of rows) {
    const k = r.check + "|" + r.a + "|" + r.b, g = by.get(k);
    if (!g) { by.set(k, { ...r, n: 1, nFail: r.fail ? 1 : 0 }); continue; }
    g.n++; if (r.fail) g.nFail++;
    g.count += r.count;
    if (r.value > g.value) Object.assign(g, { value: r.value, where: r.where, note: r.note });
    g.fail = g.fail || r.fail;
  }
  return [...by.values()].sort((x, y) => x.check < y.check ? -1 : x.check > y.check ? 1 : y.value - x.value);
}

// Every (team, style) the run covers. A style is "cat/optionId"; it only
// builds on a team the option is available to (SIGNATURE gates).
export function plan(M, { teams, styles, allStyles, bodies, allBodies }) {
  const T = M.Teams.LIST.filter((t) => M.Parts.FACTORY_PRESETS[t.id] && (!teams || teams.includes(t.id)));
  if (teams) for (const id of teams) if (!T.some((t) => t.id === id)) throw new Error(`unknown team ${id}`);
  let S = styles ? styles.slice() : [];
  if (allStyles) for (const c of M.Parts.CATALOG) for (const o of c.options)
    if (o.tag === "STYLE" || o.tag === "PREVIEW") S.push(c.id + "/" + o.id);
  S = [...new Set(S)];
  // Body looks (livery bodyStyle, Car3D BODY_STYLES): style "body:<id>".
  const B = allBodies ? [...M.Car3D.BODY_STYLE_IDS] : (bodies || []);
  for (const b of B) if (!M.Car3D.BODY_STYLES[b] && !M.Car3D.TEAM_STYLE[b]) throw new Error(`unknown body style ${b}`);
  const jobs = [];
  for (const t of T) {
    jobs.push({ team: t.id, style: "factory", overlay: {} });
    for (const b of B) if (b !== t.id) jobs.push({ team: t.id, style: "body:" + b, overlay: {}, body: b });
    for (const s of S) {
      const [cat, id] = s.split("/");
      const c = M.Parts.CATALOG.find((x) => x.id === cat), o = c && c.options.find((x) => x.id === id);
      if (!o) { if (styles && styles.includes(s)) throw new Error(`unknown style ${s}`); continue; }
      if (!M.Parts.isOptionAvailable(o, t)) continue;
      jobs.push({ team: t.id, style: s, overlay: { [cat]: id } });
    }
  }
  return jobs;
}

export function run(root, opts) {
  const M = loadCar(root), out = [];
  for (const j of plan(M, opts)) {
    const r = auditMesh(buildCar(M, j.team, j.overlay, j.body), opts.checks || CHECKS);
    out.push({ team: j.team, style: j.style, pieces: r.pieces, joints: r.joints, rows: r.rows });
  }
  return { root, fit: FIT, cars: out };
}

// ── baseline comparison ────────────────────────────────────────────────────
// A head failure is NEW when the base has no failing row with that key, and
// WORSE when it has one but the head is past it by more than the check's own
// threshold or adds failing instances. A style the base cannot build (a
// preview option that only exists on the branch) is compared against the
// base's FACTORY car of the same team, so it is charged only for what it adds.
const SLACK = { GAP: FIT.GAP_MM, PENETRATION: FIT.ATTACH_MM, ZFIGHT: FIT.ZFIGHT_AREA_M2 * 1e4, OPEN: FIT.OPEN_MM };
// NOISE: a row with no failing base twin is NEW only past this margin over
// its limit. Measured on the 2026-10-19 --all-styles sweep (275 builds): a
// style that only reshapes a neighbour moves seams by ~0.1-0.9 mm, so a 2.9 mm
// joint in the base reads 3.1 mm on the branch and flapped NEW across the
// whole catalog. 1 mm is above that jitter and still a third of the 3 mm seam.
export const NOISE = Object.freeze({ GAP: 1, PENETRATION: 1, ZFIGHT: 0.5, OPEN: 10 });
const LIMIT = { GAP: FIT.GAP_MM, ZFIGHT: FIT.ZFIGHT_AREA_M2 * 1e4, OPEN: FIT.OPEN_MM };
const limitOf = (r) => r.check === "PENETRATION" ? (/^tyre /.test(r.b) ? FIT.TYRE_PEN_MM : FIT.PEN_MM) : LIMIT[r.check];
export function compareRuns(head, base) {
  const idx = new Map();
  for (const c of base.cars) for (const r of c.rows) if (r.fail) idx.set(c.team + "|" + c.style + "|" + r.check + "|" + r.a + "|" + r.b, r);
  const builtInBase = new Set(base.cars.map((c) => c.team + "|" + c.style));
  for (const c of head.cars) {
    const style = builtInBase.has(c.team + "|" + c.style) ? c.style : "factory";
    for (const r of c.rows) {
      if (!r.fail) continue;
      const b = idx.get(c.team + "|" + style + "|" + r.check + "|" + r.a + "|" + r.b);
      // count: vertices inside / face pairs / open edges / floating clusters;
      // a quarter more (and at least 3 more) is a part that grew into the fault.
      const grew = r.nFail > b?.nFail || r.count > b?.count * 1.25 + 2;
      // NEAR-LIMIT: no failing base twin, but within NOISE of the limit. Listed, never gates.
      r.status = !b ? (r.value > limitOf(r) + NOISE[r.check] ? "NEW" : "NEAR-LIMIT")
        : (r.value > b.value + SLACK[r.check] || grew) ? "WORSE" : "PRE-EXISTING";
      r.baseValue = b ? b.value : null;
    }
  }
  return head;
}

function baseTree(ref) {
  const sha = execFileSync("git", ["rev-parse", ref], { cwd: ROOT, encoding: "utf8" }).trim();
  const dir = path.join(ROOT, "artifacts", "car-fit-audit", "base-" + sha.slice(0, 12));
  if (!fs.existsSync(path.join(dir, "js", "car", "car3d.js"))) {
    fs.mkdirSync(dir, { recursive: true });
    const tar = execFileSync("git", ["archive", "--format=tar", sha, "js"], { cwd: ROOT, maxBuffer: 1 << 30 });
    execFileSync("tar", ["-x", "-C", dir], { input: tar });
  }
  return { dir, sha };
}

// ── CLI ────────────────────────────────────────────────────────────────────
function table(res) {
  const F = (v, w) => String(v).padEnd(w);
  const lines = [];
  for (const c of res.cars) {
    const fails = c.rows.filter((r) => r.fail);
    lines.push(`\n${c.team} · ${c.style} · ${c.pieces} pieces · ${fails.length} failing row(s)`);
    for (const r of fails)
      lines.push("  " + F(r.status || (r.warn ? "WARN" : "FAIL"), 13) + F(r.check, 12) + F(r.a, 26) + F(r.b, 22) +
        F(r.value + " " + r.unit + (r.baseValue != null ? " (base " + r.baseValue + ")" : ""), 22) +
        F("x" + r.nFail, 5) + "@" + JSON.stringify(r.where) + "  " + r.note);
  }
  return lines.join("\n");
}

export function summary(res) {
  const t = {};
  for (const c of res.cars) for (const r of c.rows) if (r.fail) {
    const k = r.status || (r.warn ? "WARN" : "FAIL");
    t[k] = (t[k] || 0) + 1;
  }
  return t;
}

function main() {
  const args = process.argv.slice(2);
  const val = (n) => { const a = args.find((x) => x.startsWith("--" + n + "=")); if (a) return a.slice(n.length + 3);
    const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : undefined; };
  const has = (n) => args.includes("--" + n);
  if (has("help") || has("h")) {
    console.log("Usage: node tools/car/car-fit-audit.mjs [--team=a,b] [--styles=cat/opt,…] [--all-styles] [--bodies=a,b | --all-bodies] [--checks=GAP,PENETRATION,ZFIGHT,OPEN] [--json] [--base <ref> | --baseline <file>] [--write-baseline <file>]\n\nDo Car3D parts connect? Exit 1 on any FAIL, or with a base on any NEW/WORSE failure.");
    return;
  }
  const list = (s) => s ? s.split(",").filter(Boolean) : undefined;
  const opts = { teams: list(val("team")), styles: list(val("styles")), allStyles: has("all-styles"),
                 bodies: list(val("bodies")), allBodies: has("all-bodies"), checks: list(val("checks")) || CHECKS };
  for (const c of opts.checks) if (!CHECKS.includes(c)) throw new Error(`unknown check ${c}`);
  const t0 = Date.now();
  let res = run(ROOT, opts);
  if (val("write-baseline")) fs.writeFileSync(val("write-baseline"), JSON.stringify(res));
  let baseLabel = null;
  if (val("base")) {
    const b = baseTree(val("base"));
    baseLabel = val("base") + "@" + b.sha.slice(0, 10);
    // The base tree builds the SAME jobs minus styles it does not have.
    res = compareRuns(res, run(b.dir, opts));
  } else if (val("baseline")) {
    baseLabel = val("baseline");
    res = compareRuns(res, JSON.parse(fs.readFileSync(val("baseline"), "utf8")));
  }
  const s = summary(res);
  const bad = baseLabel ? (s.NEW || 0) + (s.WORSE || 0) : (s.FAIL || 0);
  if (has("json")) console.log(JSON.stringify({ base: baseLabel, summary: s, ...res }, null, 1));
  else {
    console.log(table(res));
    console.log(`\n= car-fit-audit ${bad ? "FAIL" : "PASS"} · ${res.cars.length} car build(s) · ` +
      Object.entries(s).map(([k, v]) => v + " " + k).join(" · ") + (baseLabel ? " · base " + baseLabel : "") +
      ` · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  if (bad) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
