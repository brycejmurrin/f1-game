// tools/manifest.cjs TIERS: every file group states WHEN it loads (tier) and WHERE it runs.
// A new FULL path or LAZY_* group without a tag fails here, naming it (#6920 U0.4).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const MANIFEST = require("../../tools/manifest.cjs");

const TIER_SET = new Set(["boot", "menu", "home", "garage", "race", "career", "tool"]);
const WHERE_SET = new Set(["page", "worker", "both"]);
const GROUP_TIER = { LAZY_AGENT: "tool", LAZY_DEV: "tool", LAZY_PERF: "tool", LAZY_CAREER_UI: "career", LAZY_CAREER: "career",
  LAZY_GARAGE_EXTERIOR: "garage", LAZY_RACE: "race", LAZY_RACE_SESSION: "race", LAZY_TRACK_BUILD: "race", LAZY_REAL_RACE: "race" };
const WORKER_GROUPS = new Set(["LAZY_WORKER", "TRACK_WORKER_EXTRA"]);

/** name -> files for every group the page roster loads (FULL, DEFERRED.*, LAZY_* arrays, OVERLAY_PAGE, TRACK_WORKER_EXTRA). */
function groupsOf(M) {
  const g = new Map();
  for (const [k, files] of Object.entries(M.DEFERRED || {})) g.set(`DEFERRED.${k}`, files);
  for (const [k, v] of Object.entries(M)) if (/^LAZY_/.test(k) && !/_EDGES$/.test(k) && Array.isArray(v)) g.set(k, v);
  g.set("OVERLAY_PAGE", M.OVERLAY_PAGE);
  g.set("TRACK_WORKER_EXTRA", M.TRACK_WORKER_EXTRA);
  return g;
}

/** Pure: error strings for a manifest object; [] when every tag is complete and consistent. */
export function checkTiers(M) {
  const T = M.TIERS;
  if (!T) return ["manifest exports no TIERS"];
  const GT = T.GROUP_TIERS, FT = T.FULL_TIERS;
  if (!GT || !FT) return ["TIERS needs GROUP_TIERS and FULL_TIERS"];
  const errs = [];
  const groups = groupsOf(M);
  const workerFiles = new Set(M.TRACK_WORKER_EXTRA);
  const fullSet = new Set(M.FULL);

  for (const f of M.FULL) if (!(f in FT)) errs.push(`FULL_TIERS has no entry for ${f}`);
  for (const f of Object.keys(FT)) if (!fullSet.has(f)) errs.push(`FULL_TIERS names ${f}, which is not in FULL`);
  for (const g of groups.keys()) if (!(g in GT)) errs.push(`GROUP_TIERS has no entry for ${g}`);
  for (const g of Object.keys(GT)) if (!groups.has(g)) errs.push(`GROUP_TIERS names ${g}, which is not a group`);

  const norm = (v) => (typeof v === "string" ? { tier: v, where: "page" } : { where: "page", ...v });
  const check = (label, tier, where, isFull, isLazy, wantWhere) => {
    if (!TIER_SET.has(tier)) errs.push(`${label}: bad tier ${tier}`);
    if (!WHERE_SET.has(where)) errs.push(`${label}: bad where ${where}`);
    if (tier === "boot" && isLazy) errs.push(`${label}: boot tier in a LAZY group`);
    if (tier === "tool" && isFull) errs.push(`${label}: tool tier in FULL`);
    if (wantWhere && !wantWhere.includes(where)) errs.push(`${label}: where ${where}, want ${wantWhere.join("|")}`);
  };
  for (const f of M.FULL) {
    if (!(f in FT)) continue;
    const { tier, where } = norm(FT[f]);
    check(`FULL ${f}`, tier, where, true, false, workerFiles.has(f) ? ["both"] : ["page"]);
  }
  for (const [g, files] of groups) {
    if (!(g in GT)) continue;
    const { tier, where, files: per = {} } = GT[g];
    const isLazy = g.startsWith("LAZY_");
    if (g in GROUP_TIER && tier !== GROUP_TIER[g]) errs.push(`${g}: tier ${tier}, want ${GROUP_TIER[g]}`);
    check(g, tier, where, false, isLazy, WORKER_GROUPS.has(g) ? ["worker", "both"] : ["page"]);
    for (const f of files) {
      if (!workerFiles.has(f) || WORKER_GROUPS.has(g)) continue;
      if (per[f] !== "both") errs.push(`${g}: ${f} is also a worker file; GROUP_TIERS.${g}.files must mark it both`);
    }
  }
  const seen = new Map();
  for (const [g, files] of [["FULL", M.FULL], ...[...groups].filter(([k]) => k !== "OVERLAY_PAGE" && k !== "TRACK_WORKER_EXTRA")]) {
    for (const f of files) {
      if (seen.has(f)) errs.push(`${f} is in both ${seen.get(f)} and ${g}`);
      else seen.set(f, g);
    }
  }
  return errs;
}

const clone = (M) => ({ ...M, FULL: [...M.FULL], TIERS: { GROUP_TIERS: structuredClone(M.TIERS.GROUP_TIERS), FULL_TIERS: structuredClone(M.TIERS.FULL_TIERS) } });
const has = (errs, s) => errs.some((e) => e.includes(s));

test("the real manifest is fully and consistently tagged", () => {
  assert.deepEqual(checkTiers(MANIFEST), []);
});

test("a new FULL path with no tier fails naming it", () => {
  const M = clone(MANIFEST);
  M.FULL.push(["js", "core", "new-untagged.js"].join("/"));
  assert.equal(has(checkTiers(M), ["js", "core", "new-untagged.js"].join("/")), true);
});

test("a new LAZY_* group with no GROUP_TIERS entry fails naming it", () => {
  const M = clone(MANIFEST);
  M.LAZY_NEW_GROUP = [["js", "ui", "new-lazy.js"].join("/")];
  assert.equal(has(checkTiers(M), "LAZY_NEW_GROUP"), true);
});

test("a boot LAZY group and a tool FULL file fail", () => {
  const a = clone(MANIFEST);
  a.TIERS.GROUP_TIERS.LAZY_RACE.tier = "boot";
  assert.equal(has(checkTiers(a), "LAZY_RACE"), true);
  const b = clone(MANIFEST);
  b.TIERS.FULL_TIERS["js/core/log.js"] = "tool";
  assert.equal(has(checkTiers(b), "js/core/log.js"), true);
});

test("a worker-loaded file tagged page-only fails", () => {
  const M = clone(MANIFEST);
  M.TIERS.FULL_TIERS["js/render/shared/assets.js"] = "boot";
  assert.equal(has(checkTiers(M), "js/render/shared/assets.js"), true);
  const D = clone(MANIFEST);
  delete D.TIERS.GROUP_TIERS["DEFERRED.three"].files;
  assert.equal(has(checkTiers(D), "tlx-chunked.js"), true);
});

test("no LAZY_* key of the manifest is TIERS", () => {
  assert.deepEqual(Object.keys(MANIFEST).filter((k) => /^LAZY_/.test(k) && k.includes("TIERS")), []);
});
