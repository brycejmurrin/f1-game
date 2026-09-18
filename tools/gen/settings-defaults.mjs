#!/usr/bin/env node
// @doc Apply an exported SETTINGS file to the shipped defaults in `js/data/settings-defaults.js`; `--check` reports drift.
/**
 * settings-defaults — "make my settings the defaults", as one command.
 *
 *   node tools/gen/settings-defaults.mjs <export.json>          # apply
 *   node tools/gen/settings-defaults.mjs <export.json> --dry    # print, write nothing
 *   node tools/gen/settings-defaults.mjs --drop pace,tiltDeg    # back to the as-shipped default
 *   node tools/gen/settings-defaults.mjs --check                # the file still agrees with SPEC
 *
 * WHY. A player exports SETTINGS from SETTINGS > DISPLAY > RENDERER > FILES.
 * That file already carries CHANGED — every key differing from the shipped
 * default — because settings-export.js was built to make this a list of edits
 * rather than a hunt. What was missing was the other half: something that
 * performs the edits. Doing it by hand means fourteen literals across seven
 * modules, and no check that js/ui/settings-export.js's SPEC still agrees, so
 * the next export reports defaults that are no longer the defaults.
 *
 * WHAT IT REFUSES, and these are the interesting part:
 *
 *   not in SPEC          a key outside the allowlist is a typo or a private
 *                        key that was never a preference. Never written.
 *   device-adaptive      SPEC declares the default null or a function of the
 *                        device (uiScale, hudScale, resMode, gfxPreset,
 *                        gfxBackend...). Those are null BECAUSE the right value
 *                        is not the same on a phone and a desktop — css/tokens.css
 *                        owns the touch numbers so a phone is correct on its
 *                        first paint. Pinning one device's number as the global
 *                        default makes every other device wrong, silently, and
 *                        an export from a phone is the common case. Use --force
 *                        only if you mean it.
 *   excluded groups      garage, saves, accounts. settings-export.js keeps them
 *                        out of the file by construction; this keeps them out
 *                        of the defaults too.
 *   REVIEW keys          scalar, in SPEC, not device-adaptive — and still not a
 *                        preference. Muting the game or lifting the career
 *                        budget is a product decision about every new player,
 *                        and it is the shape of thing that lands in an export by
 *                        accident: a phone on silent exports sound:false. Named
 *                        below with the reason, and passed only via --include.
 *
 * The block it rewrites is delimited by @gen-settings-defaults in
 * js/data/settings-defaults.js. Every edit is printed as `key: was -> now`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TARGET = "js/data/settings-defaults.js";
const SPEC_SRC = "js/ui/settings-export.js";
const START = "  // @gen-settings-defaults start";

/** Keys a player can set, that this tool will not promote to a SHIPPED default
 *  without being named. Not about the value being wrong — about the question
 *  being a product one. The first export this tool ever ran on carried both:
 *  the phone was on silent, and the budget had been lifted to try something. */
export const REVIEW = {
  sound: "ships the game MUTED for every new player — an export from a silenced phone looks exactly like this",
  unlimitedBudget: "removes the career economy constraint for everyone — a design change, not a preference",
};
const END = "  // @gen-settings-defaults end";

/** SPEC as data: {k, lane, group, def, adaptive}. Parsed from the source rather
 *  than imported, because settings-export.js is a browser IIFE that reaches for
 *  GameAudio/GfxQuality at eval. `adaptive` is the refusal rule — a row whose
 *  default is a function or null cannot be pinned to one device's value. */
export function readSpec(root = ROOT) {
  const src = fs.readFileSync(path.join(root, SPEC_SRC), "utf8");
  const rows = [];
  const re = /\{ k: "([^"]+)", lane: "(\w+)", group: "(\w+)", def: (.*?), src: "/g;
  let m;
  while ((m = re.exec(src))) {
    const [, k, lane, group, def] = m;
    rows.push({ k, lane, group, def: def.trim(), adaptive: def.trim() === "null" || def.trim().startsWith("(") });
  }
  if (!rows.length) throw new Error(`${SPEC_SRC}: parsed no SPEC rows — the row shape changed`);
  return rows;
}

/** The DEF map currently in the target file, by evaluating just the literal. */
export function readDefaults(root = ROOT) {
  const src = fs.readFileSync(path.join(root, TARGET), "utf8");
  const a = src.indexOf(START), b = src.indexOf(END);
  if (a < 0 || b < 0) throw new Error(`${TARGET}: the @gen-settings-defaults block is gone`);
  const body = src.slice(a + START.length, b);
  const obj = new Function(`${body}; return DEF;`)();
  return { src, a, b, obj };
}

const fmt = (v) => JSON.stringify(v);

/** Group a flat key -> value map into the commented block the file carries. */
function render(pairs, spec) {
  const byKey = new Map(spec.map((r) => [r.k, r]));
  const GROUPS = [
    ["driving", "DRIVING (js/game.js, js/race/*)"],
    ["steering", "STEERING (js/input/steer-tuning.js)"],
    ["audio", "AUDIO (js/audio/panel.js)"],
    ["display", "DISPLAY / METRICS (raw lane — bare strings, not JSON)"],
    ["metrics", null],
  ];
  const out = ["  const DEF = {"];
  const seen = new Set();
  for (const [g, label] of GROUPS) {
    const ks = Object.keys(pairs).filter((k) => (byKey.get(k) || {}).group === g && !seen.has(k));
    if (!ks.length) continue;
    if (label) out.push(`    // ${label}`);
    for (const k of ks) { out.push(`    ${JSON.stringify(k)}: ${fmt(pairs[k])},`); seen.add(k); }
  }
  for (const k of Object.keys(pairs)) if (!seen.has(k)) out.push(`    ${JSON.stringify(k)}: ${fmt(pairs[k])},`);
  out.push("  };");
  return out.join("\n");
}

export function apply(exportFile, { force = false, dry = false, include = [], root = ROOT } = {}) {
  const exp = JSON.parse(fs.readFileSync(exportFile, "utf8"));
  if (exp.format !== "apex26-settings-v1") throw new Error(`${exportFile}: not an apex26-settings-v1 export`);
  const spec = readSpec(root), byKey = new Map(spec.map((r) => [r.k, r]));
  const cur = readDefaults(root);
  const next = { ...cur.obj }, edits = [], refused = [];

  for (const full of exp.changed || []) {
    const [group, k] = full.split(".");
    const row = byKey.get(k);
    const v = ((exp.settings || {})[group] || {})[k];
    if (!row) { refused.push(`${full}: not in SPEC — not a shipped preference`); continue; }
    if (row.group !== group) { refused.push(`${full}: SPEC puts ${k} in "${row.group}"`); continue; }
    if (row.adaptive && !force) {
      refused.push(`${full}: SPEC default is ${row.def === "null" ? "null" : "a function of the device"} — device-adaptive, pinning ${fmt(v)} makes other devices wrong (--force to override)`);
      continue;
    }
    if (v !== null && typeof v === "object") { refused.push(`${full}: value is a ${Array.isArray(v) ? "list" : "blob"}, not a scalar default`); continue; }
    if (REVIEW[k] && !include.includes(k)) { refused.push(`${full}: ${REVIEW[k]} (--include ${k} if you mean it)`); continue; }
    const was = Object.prototype.hasOwnProperty.call(cur.obj, k) ? cur.obj[k] : (exp.defaults || {})[group]?.[k];
    if (next[k] === v) continue;
    next[k] = v;
    edits.push(`${full}: ${fmt(was)} -> ${fmt(v)}`);
  }

  const block = render(next, spec);
  const out = cur.src.slice(0, cur.a + START.length) + "\n" + block + "\n" + cur.src.slice(cur.b);
  if (!dry && out !== cur.src) fs.writeFileSync(path.join(root, TARGET), out);
  return { edits, refused, changed: out !== cur.src, keys: Object.keys(next).length };
}

/** Drift: every key in the file must be a SPEC key, and must not be adaptive. */
/** Remove keys, so the call-site literal is the default again. The file's own
 *  header tells you not to hand-edit the block, which has to include taking a
 *  key back out — otherwise the one edit the tool cannot do is the one you make
 *  by hand, and the rule stops being true. */
export function drop(keys, { dry = false, root = ROOT } = {}) {
  const spec = readSpec(root), cur = readDefaults(root);
  const next = { ...cur.obj }, removed = [], missing = [];
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(next, k)) { missing.push(k); continue; }
    removed.push(`${k}: ${fmt(next[k])} -> as-shipped`);
    delete next[k];
  }
  const block = render(next, spec);
  const out = cur.src.slice(0, cur.a + START.length) + "\n" + block + "\n" + cur.src.slice(cur.b);
  if (!dry && out !== cur.src) fs.writeFileSync(path.join(root, TARGET), out);
  return { removed, missing, keys: Object.keys(next).length };
}

export function check(root = ROOT) {
  const spec = readSpec(root), byKey = new Map(spec.map((r) => [r.k, r]));
  const { obj } = readDefaults(root);
  const problems = [];
  for (const k of Object.keys(obj)) {
    const row = byKey.get(k);
    if (!row) { problems.push(`${k}: in ${TARGET} but not in SPEC — an export would never report it`); continue; }
    if (row.adaptive) problems.push(`${k}: SPEC declares a device-adaptive default (${row.def}) — pinning it here makes other devices wrong`);
  }
  return { ok: problems.length === 0, problems, keys: Object.keys(obj).length };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--check")) {
    const r = check();
    for (const p of r.problems) console.log("DRIFT  " + p);
    if (r.ok) console.log(`settings-defaults: ${r.keys} shipped defaults, all in SPEC and none device-adaptive`);
    process.exitCode = r.ok ? 0 : 1;
    return;
  }
  const dropIdx = argv.indexOf("--drop");
  const dropEq = (argv.find((a) => a.startsWith("--drop=")) || "").split("=")[1];
  const dropKeys = (dropEq || (dropIdx >= 0 ? argv[dropIdx + 1] : "") || "").split(",").filter(Boolean);
  if (dropKeys.length) {
    const r = drop(dropKeys, { dry: argv.includes("--dry") });
    for (const x of r.removed) console.log("  " + x);
    for (const m of r.missing) console.log(`SKIPPED  ${m}: not a shipped default — already as-shipped`);
    console.log(`${r.removed.length} default(s) dropped, ${r.keys} keys remain in ${TARGET}`);
    return;
  }
  const file = argv.find((a) => !a.startsWith("-") && a !== dropKeys.join(","));
  if (!file) { console.log("usage: settings-defaults.mjs <export.json> [--dry] [--force] [--include k1,k2] | --drop k1,k2 | --check"); process.exitCode = 2; return; }
  const incIdx = argv.indexOf("--include");
  const incEq = (argv.find((a) => a.startsWith("--include=")) || "").split("=")[1];
  const include = (incEq || (incIdx >= 0 ? argv[incIdx + 1] : "") || "").split(",").filter(Boolean);
  const r = apply(file, { force: argv.includes("--force"), dry: argv.includes("--dry"), include });
  for (const e of r.edits) console.log("  " + e);
  for (const x of r.refused) console.log("REFUSED  " + x);
  console.log(`${r.edits.length} default(s) ${r.changed ? (argv.includes("--dry") ? "would change" : "changed") : "changed"}, ${r.refused.length} refused, ${r.keys} keys in ${TARGET}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
