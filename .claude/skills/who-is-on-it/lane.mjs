#!/usr/bin/env node
// Lane wrapper: draft-PR owned globs + overlap refusal, then tools/ci/who-is-on-it.mjs.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api, DEPLOY } from "../../../tools/ci/ready-full-cap.mjs";
import { CLAIMS_BOARD, parseBoard, readBoard } from "../../../tools/ci/who-is-on-it.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CI = path.join(ROOT, "tools/ci/who-is-on-it.mjs");

/** @param {string} g */
function globToRegex(g) {
  let s = String(g).trim().replace(/[.+^${}()|[\]\\]/g, "\\$&");
  s = s.replace(/\*\*/g, "\0").replace(/\*/g, "[^/]*").replace(/\0/g, ".*");
  if (!s.endsWith(".*") && !/\[\^\/\]\*/.test(s)) s += "(?:/.*)?";
  return new RegExp(`^${s}$`);
}

/** Conservative: could the same repo path match both globs? */
export function globsOverlap(a, b) {
  const ga = String(a).trim();
  const gb = String(b).trim();
  if (!ga || !gb) return false;
  if (ga === gb) return true;
  const strip = (x) => x.replace(/\/\*\*$/, "");
  const na = strip(ga);
  const nb = strip(gb);
  if (na === nb) return true;
  if (na.startsWith(nb + "/") || nb.startsWith(na + "/")) return true;
  const ra = globToRegex(ga);
  const rb = globToRegex(gb);
  const probes = [na, nb, `${na}/x`, `${nb}/x`, path.join(na, "file"), path.join(nb, "file")];
  for (const p of probes) {
    if (ra.test(p) && rb.test(p)) return true;
  }
  return ra.test(nb) || rb.test(na);
}

/** @param {string} body */
export function parseOwnedGlobs(body) {
  const text = String(body || "");
  const fleet = text.match(/```fleet\n([\s\S]*?)```/);
  const block = fleet ? fleet[1] : text;
  const owned = [];
  for (const line of block.split("\n")) {
    const m = line.match(/^\s*owned:\s*(.+)$/i);
    if (m) owned.push(...m[1].split(/\s+/).filter(Boolean));
  }
  return owned;
}

/** @param {string} text claim message */
export function ownedFromClaimText(text) {
  const m = String(text).match(/\bowned:\s*([^\n|]+)/i);
  if (!m) return [];
  return m[1].split(/\s+/).filter(Boolean);
}

/** @param {typeof api} fetch */
export function listDraftLanes(fetch = api) {
  const r = fetch(`pulls?state=open&base=${encodeURIComponent(DEPLOY)}&per_page=100`);
  if (r.error) return { error: r.error, drafts: [] };
  const drafts = (r.json || [])
    .filter((p) => p && p.draft && p.head?.ref)
    .map((p) => ({
      number: p.number,
      title: p.title || "",
      branch: p.head.ref,
      owned: parseOwnedGlobs(p.body || ""),
    }));
  return { drafts };
}

/**
 * @param {string[]} mine
 * @param {{ drafts: Array<{number:number, branch:string, title:string, owned:string[]}> }} ctx
 * @param {Array<{slug:string, text:string, stale:boolean, released:boolean}>} claims
 */
export function findOverlaps(mine, ctx, claims) {
  const hits = [];
  for (const d of ctx.drafts) {
    for (const o of d.owned) {
      for (const m of mine) {
        if (globsOverlap(m, o)) hits.push({ kind: "draft-pr", pr: d.number, branch: d.branch, theirs: o, mine: m });
      }
    }
  }
  for (const c of claims) {
    if (c.released || c.stale) continue;
    const theirs = ownedFromClaimText(c.text);
    const list = theirs.length ? theirs : [];
    for (const o of list) {
      for (const m of mine) {
        if (globsOverlap(m, o)) hits.push({ kind: "claim", slug: c.slug, theirs: o, mine: m });
      }
    }
    if (!list.length) {
      for (const m of mine) {
        if (c.text.includes(m)) hits.push({ kind: "claim-text", slug: c.slug, mine: m });
      }
    }
  }
  return hits;
}

function printDrafts(drafts) {
  console.log(`\n# open draft PRs into ${DEPLOY} (owned globs from fleet block)`);
  if (!drafts.length) console.log("(none)");
  for (const d of drafts) {
    const own = d.owned.length ? d.owned.join(" ") : "(no owned: line)";
    console.log(`  #${d.number}  ${d.branch}  — ${d.title}`);
    console.log(`           owned: ${own}`);
  }
}

function claimSnippet(branch, sessionShort, owned) {
  return `claim: ${branch} @ ${sessionShort} | owned: ${owned.join(" ")}`;
}

function runCi(argv) {
  const r = spawnSync(process.execPath, [CI, ...argv], { cwd: ROOT, encoding: "utf8", stdio: "inherit" });
  return r.status ?? 1;
}

function loadActiveClaims() {
  const tip = spawnSync("git", ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${CLAIMS_BOARD}`],
    { cwd: ROOT, encoding: "utf8" });
  if (tip.status !== 0) return [];
  return parseBoard(readBoard(`refs/remotes/origin/${CLAIMS_BOARD}`)).filter((c) => !c.released);
}

function splitClaimArgv(argv) {
  const ci = [];
  const owned = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--claim") {
      while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) owned.push(argv[++i]);
      continue;
    }
    ci.push(a);
  }
  return { ci, owned };
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("usage: node .claude/skills/who-is-on-it/lane.mjs [--json] [--no-fetch] [--hours N] [--session ID]");
    console.log("       node .claude/skills/who-is-on-it/lane.mjs --claim <owned-glob> [...] [--session ID]");
    console.log("       node .claude/skills/who-is-on-it/lane.mjs --release [--session ID]");
    console.log("\nLane wrapper around tools/ci/who-is-on-it.mjs — draft PR owned scan + overlap refusal.");
    return 0;
  }

  const json = argv.includes("--json");
  const release = argv.includes("--release");
  const { ci: ciArgv, owned } = splitClaimArgv(argv);

  const { drafts, error } = listDraftLanes();
  if (error && !json) console.error(`# draft PR list: ${error} (overlap check skipped)`);

  if (owned.length && !release) {
    const active = loadActiveClaims();
    const overlaps = error ? [] : findOverlaps(owned, { drafts }, active);
    if (overlaps.length) {
      console.error("# REFUSED — overlapping owned path");
      for (const h of overlaps) {
        if (h.kind === "draft-pr") console.error(`  draft PR #${h.pr} (${h.branch}): ${h.theirs} ∩ ${h.mine}`);
        else console.error(`  claim ${h.slug}: ${h.theirs || h.mine} ∩ ${h.mine}`);
      }
      return 1;
    }
    const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
    const sess = argv.includes("--session") ? argv[argv.indexOf("--session") + 1] : (process.env.APEX_SESSION_ID || "").slice(0, 8) || "session";
    const msg = `lane owned: ${owned.join(" ")}`;
    const rc = runCi([...ciArgv, "--claim", msg]);
    if (rc !== 0) return rc;
    console.log(`\n# paste under the fleet block:\n${claimSnippet(branch, sess, owned)}`);
    return 0;
  }

  if (!json) printDrafts(drafts);
  return runCi(ciArgv);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
