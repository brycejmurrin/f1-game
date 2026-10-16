#!/usr/bin/env node
// @doc Apply an exported GARAGE file to the shipped defaults in `js/data/garage-defaults.js`; `--check` reports drift.
/**
 * garage-defaults — "make this garage the shipped defaults", as one command.
 *
 *   node tools/gen/garage-defaults.mjs <export.json>          # apply
 *   node tools/gen/garage-defaults.mjs <export.json> --dry    # print, write nothing
 *   node tools/gen/garage-defaults.mjs --check                # every key is garage-shaped
 *
 * WHY. A player (or designer) exports GARAGE from GARAGE › TEAM › SAVE GARAGE
 * FILE. That file is already the allowlisted shape (`apex26-garage-v1`). What
 * was missing was the other half: something that turns that export into the
 * defaults every fresh install (and RESET GARAGE TO DEFAULTS) reads — without
 * writing into an existing player's localStorage.
 *
 * Mirror of tools/gen/settings-defaults.mjs for the garage namespace. The
 * block it rewrites is delimited by @gen-garage-defaults in
 * js/data/garage-defaults.js. GameStore.get consults GarageDefaults on a miss
 * for those keys; a value the player already stored still wins.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TARGET = "js/data/garage-defaults.js";
const START = "  // @gen-garage-defaults start";
const END = "  // @gen-garage-defaults end";
const FORMAT = "apex26-garage-v1";

const GARAGE_PREFIXES = ["parts.", "livery.", "setup."];
const GARAGE_SINGLES = ["customTeam", "customLogo", "team", "driver"];
const ID_RE = /^[A-Za-z0-9_.-]{1,64}$/;

export function isGarageKey(k) {
  if (GARAGE_SINGLES.indexOf(k) >= 0) return true;
  for (const p of GARAGE_PREFIXES) {
    if (k.indexOf(p) === 0) return ID_RE.test(k.slice(p.length));
  }
  return false;
}

/** The DEF map currently in the target file, by evaluating just the literal. */
export function readDefaults(root = ROOT) {
  const src = fs.readFileSync(path.join(root, TARGET), "utf8");
  const a = src.indexOf(START), b = src.indexOf(END);
  if (a < 0 || b < 0) throw new Error(`${TARGET}: the @gen-garage-defaults block is gone`);
  const body = src.slice(a + START.length, b);
  const obj = new Function(`${body}; return { DEF, META };`)();
  return { src, a, b, def: obj.DEF, meta: obj.META };
}

function render(garage, meta) {
  // Stable key order so diffs stay readable across re-exports.
  const keys = Object.keys(garage).sort();
  const lines = ["  const META = " + JSON.stringify({
    format: meta.format || FORMAT,
    exportedAt: meta.exportedAt || null,
    build: meta.build || null,
    excluded: meta.excluded || null,
    count: keys.length,
  }, null, 2).replace(/\n/g, "\n  ") + ";",
    "  const DEF = {"];
  for (const k of keys) {
    lines.push(`    ${JSON.stringify(k)}: ${JSON.stringify(garage[k])},`);
  }
  lines.push("  };");
  return lines.join("\n");
}

export function apply(exportFile, { dry = false, root = ROOT } = {}) {
  const exp = JSON.parse(fs.readFileSync(exportFile, "utf8"));
  if (exp.format !== FORMAT) throw new Error(`${exportFile}: not an ${FORMAT} export`);
  const garage = exp.garage || {};
  const keys = Object.keys(garage);
  if (!keys.length) throw new Error(`${exportFile}: garage object is empty`);
  const refused = [];
  const next = {};
  for (const k of keys) {
    if (!isGarageKey(k)) { refused.push(`${k}: not a garage-shaped key`); continue; }
    next[k] = garage[k];
  }
  if (!Object.keys(next).length) throw new Error(`${exportFile}: no garage-shaped keys survived`);
  const cur = readDefaults(root);
  const meta = {
    format: FORMAT,
    exportedAt: exp.exportedAt || null,
    build: exp.build != null ? String(exp.build) : null,
    excluded: exp.excluded || null,
  };
  const block = render(next, meta);
  const out = cur.src.slice(0, cur.a + START.length) + "\n" + block + "\n" + cur.src.slice(cur.b);
  if (!dry && out !== cur.src) fs.writeFileSync(path.join(root, TARGET), out);
  return {
    keys: Object.keys(next).length,
    refused,
    changed: out !== cur.src,
    team: next.team,
    driver: next.driver,
  };
}

export function check(root = ROOT) {
  const { def, meta } = readDefaults(root);
  const problems = [];
  if (!meta || meta.format !== FORMAT) problems.push(`META.format must be ${FORMAT}`);
  const keys = Object.keys(def);
  if (!keys.length) problems.push("DEF is empty — nothing ships as a garage default");
  for (const k of keys) {
    if (!isGarageKey(k)) problems.push(`${k}: in ${TARGET} but not garage-shaped`);
  }
  if (meta && typeof meta.count === "number" && meta.count !== keys.length) {
    problems.push(`META.count ${meta.count} !== DEF keys ${keys.length}`);
  }
  return { ok: problems.length === 0, problems, keys: keys.length };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--check")) {
    const r = check();
    for (const p of r.problems) console.log("DRIFT  " + p);
    if (r.ok) console.log(`garage-defaults: ${r.keys} shipped garage keys, all garage-shaped`);
    process.exitCode = r.ok ? 0 : 1;
    return;
  }
  const file = argv.find((a) => !a.startsWith("-"));
  if (!file) {
    console.log("usage: garage-defaults.mjs <export.json> [--dry] | --check");
    process.exitCode = 2;
    return;
  }
  const r = apply(file, { dry: argv.includes("--dry") });
  for (const x of r.refused) console.log("REFUSED  " + x);
  console.log(
    `${r.keys} garage key(s) ${r.changed ? (argv.includes("--dry") ? "would change" : "changed") : "unchanged"}` +
    `, ${r.refused.length} refused` +
    (r.team != null ? `, team=${r.team}` : "") +
    (r.driver != null ? `, driver=${r.driver}` : "") +
    ` → ${TARGET}`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
