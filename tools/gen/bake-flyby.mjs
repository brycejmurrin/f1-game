#!/usr/bin/env node
/**
 * bake-flyby.mjs — bake a copied FLYBY SHOT EDITOR list into js/camera/flyby-seq.js.
 * @doc Bakes a copied `window.FlybyShots = [...]` blob into js/camera/flyby-seq.js's DEFAULT shot list.
 * @skill playwright-probe
 *
 * The "apply" step of the in-game FLYBY SHOT EDITOR's COPY VALUES export
 * (js/camera/flyby-panel.js). Usage:
 *
 *   node tools/gen/bake-flyby.mjs <file>     # read the blob from a file
 *   node tools/gen/bake-flyby.mjs - < blob   # read it from stdin
 *
 * Accepts either the full `window.FlybyShots = [...];` the panel exports or a
 * bare `[...]` array. The export is a JS array literal (unquoted keys), so the
 * parse is JSON-first with a sandboxed (empty vm context) literal fallback.
 *
 * SAFETY INTERLOCK — THE NAME IS THE CHECK. This tool REPLACES the whole
 * `const DEFAULT = [...]` literal in js/camera/flyby-seq.js. The lighting tuner
 * learned what that costs the hard way: its COPY VALUES export is a DELTA, and
 * baking a delta with a full-replace tool silently deletes every profile the
 * blob does not mention. So the only name accepted here is `FlybyShots`, the
 * one the editor emits for a COMPLETE list. Anything else — a `FlybyEdits`, a
 * `FlybyDelta`, a blob someone renamed by hand — is refused with the reason,
 * rather than trusting whoever is pasting to have noticed.
 *
 * Does NOT commit, and does NOT bump cache tags (the deploy stamps hashes;
 * committed shell tags stay ?v=dev).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { ROOT, isMain } from "./gen-lib.mjs";

export const TARGET = "js/camera/flyby-seq.js";
export const EASES = ["linear", "in", "out", "inOut"];
export const AT_KINDS = ["start", "pole", "grid", "slot", "corner", "centre", "landmark"];
/** Durations are fractions of one run, so they must sum to 1. The solver
 *  normalises internally, which is exactly why this is checked HERE: a list
 *  whose durations sum to 1.6 plays correctly and reads as nonsense forever. */
export const DUR_TOLERANCE = 0.01;

/** Every reason FlybySeq.solve() could not PLAY this list. Empty == good.
 *  Mirrors shotErrors() in js/camera/flyby-panel.js: the structural half, which
 *  a PREVIEW needs (tools/shot/flyby.mjs --shots) and a bake needs as well. */
export function shotErrors(list) {
  const bad = [];
  if (!Array.isArray(list) || !list.length) return ["the shot list must be a non-empty array"];
  list.forEach((s, i) => {
    const at = `shot ${i} (${(s && s.id) || "?"})`;
    if (!s || typeof s !== "object" || Array.isArray(s)) { bad.push(`${at} is not an object`); return; }
    if (typeof s.id !== "string" || !s.id) bad.push(`${at} has no string id`);
    if (typeof s.dur !== "number" || !isFinite(s.dur) || s.dur <= 0) bad.push(`${at} has no finite positive dur`);
    if (!EASES.includes(s.ease)) bad.push(`${at} ease must be one of ${EASES.join(", ")}`);
    for (const k of ["eye", "look"]) {
      if (!Array.isArray(s[k]) || s[k].length !== 2) { bad.push(`${at} ${k} must be a [from, to] pair`); continue; }
      s[k].forEach((p, j) => {
        if (!p || typeof p !== "object") { bad.push(`${at} ${k}[${j}] is not a pose`); return; }
        if (!AT_KINDS.includes(p.at)) bad.push(`${at} ${k}[${j}] has unknown at: ${JSON.stringify(p.at)}`);
      });
    }
    if (!Array.isArray(s.fov) || s.fov.length !== 2 ||
        !s.fov.every((n) => typeof n === "number" && isFinite(n))) bad.push(`${at} fov must be [from, to] numbers`);
  });
  return bad;
}

/** Every reason this list cannot be baked, as plain sentences. Empty == good.
 *  Mirrors validateShots() in js/camera/flyby-panel.js — the panel refuses the
 *  copy and this refuses the paste, so neither end is the only guard. */
export function validateShots(list) {
  const bad = shotErrors(list);
  if (bad.length) return bad;
  let sum = 0;
  for (const s of list) sum += s.dur;
  if (Math.abs(sum - 1) > DUR_TOLERANCE) {
    bad.push(`durations sum to ${sum.toFixed(4)}, not 1 — they are fractions of ONE run, ` +
      "so a sum other than 1 means the shot list does not say what it looks like it says " +
      "(press NORMALISE in the editor, then copy again)");
  }
  return bad;
}

/** The blob minus its leading `//` lines. COPY VALUES prefixes an invalid list
 *  with `// THIS LIST WILL NOT BAKE: ...`; left in, those lines hid the name from
 *  blobName() and turned the refusal into a parse error about `window`, instead
 *  of the reasons the panel had already written down. */
export function stripLeadingComments(raw) {
  return String(raw).replace(/^(?:\s*\/\/[^\n]*\n)+/, "");
}

/** The blob's assignment name, or null when it is a bare array literal. */
export function blobName(raw) {
  const m = /^\s*(?:window\.)?([A-Za-z_$][\w$]*)\s*=/.exec(stripLeadingComments(raw));
  return m ? m[1] : null;
}

/** A JS array literal (unquoted keys) -> plain data. JSON first; the fallback
 *  evaluates in an EMPTY vm context with a timeout, not through indirect eval,
 *  which runs in this process's global scope with `process` in reach -- a pasted
 *  blob is data and gets no more than data's privileges. The JSON round trip
 *  hands back host-realm arrays and drops anything that is not data. */
export function parseLiteral(body) {
  try { return JSON.parse(body); }
  catch (e) {
    let v;
    try { v = vm.runInNewContext("(" + body + ")", Object.create(null), { timeout: 1000 }); }
    catch (_) { throw new Error("Could not parse the shot list: " + e.message); }
    return JSON.parse(JSON.stringify(v === undefined ? null : v));
  }
}

/** Blob text -> the list as written, NOT validated (the preview tool holds it to
 *  shotErrors, the bake to validateShots). Throws with a readable message. */
export function readBlob(raw) {
  const name = blobName(raw);
  if (name && name !== "FlybyShots") {
    throw new Error(
      `This blob is named \`${name}\`, not \`FlybyShots\`.\n` +
      "bake-flyby.mjs REPLACES the whole DEFAULT shot list in js/camera/flyby-seq.js, so it\n" +
      "only accepts the COMPLETE list the FLYBY SHOT EDITOR's COPY VALUES button emits —\n" +
      "which is the one that wears that name. Baking a partial or renamed blob would delete\n" +
      "every shot it does not mention, silently. Re-copy from the editor (it always exports\n" +
      "the whole list) rather than renaming this one.");
  }
  const body = stripLeadingComments(raw).replace(/^\s*(?:window\.)?[A-Za-z_$][\w$]*\s*=\s*/, "")
    .replace(/;\s*$/, "").trim();
  if (!body) throw new Error("No input. Pass a file path or pipe the copied shot list on stdin.");
  return parseLiteral(body);
}

/** Blob text -> the shot array, held to the bake rules. Throws with a readable message. */
export function parseBlob(raw) {
  const list = readBlob(raw);
  const bad = validateShots(list);
  if (bad.length) throw new Error("This shot list will not bake:\n  - " + bad.join("\n  - "));
  return list;
}

/** The literal, formatted the way flyby-seq.js writes it by hand. */
export function render(list, notes) {
  const pose = (p) => JSON.stringify(p);
  const n = notes || {};
  const lines = (a) => (a && a.length ? a.join("\n") + "\n" : "");
  const body = list.map((s) =>
    lines(n[s.id] && n[s.id].lead) +
    "    {\n" +
    `      id: ${JSON.stringify(s.id)}, dur: ${s.dur}, ease: ${JSON.stringify(s.ease)},\n` +
    lines(n[s.id] && n[s.id].inner) +
    `      eye: [${pose(s.eye[0])},\n            ${pose(s.eye[1])}],\n` +
    `      look: [${pose(s.look[0])},\n             ${pose(s.look[1])}],\n` +
    `      fov: [${s.fov[0]}, ${s.fov[1]}],\n` +
    "    }").join(",\n");
  return "  const DEFAULT = [\n" + body + ",\n  ];";
}

/* ANCHORED, like the lighting bake's regex and for the same reason: the file's
   header comment shows the shot shape, and an unanchored match would rewrite
   the documentation instead of the data. `^  const DEFAULT = [` at two-space
   indent, through the first `^  ];` at the same indent. */
export const DEFAULT_RE = /^ {2}const DEFAULT = \[[\s\S]*?^ {2}\];/m;

/** THE RATIONALE SURVIVES A BAKE. DEFAULT's comments are why each shot is the
 *  way it is ("BOTH GRID SHOTS LOOK FORWARD", the Bahrain crane note), and a
 *  bake that rewrote the literal from data deleted all of them. Comment lines
 *  are collected per shot id: `lead` (between two shots — section headers and
 *  block comments, re-emitted before that shot) and `inner` (inside its
 *  braces, re-emitted after its id line). A shot the new list drops takes its
 *  comments with it; a new shot has none. */
export function shotNotes(literal) {
  const notes = {};
  let pending = [], cur = null, inner = [];
  for (const line of literal.split("\n")) {
    const t = line.trim();
    if (/^\{$/.test(t)) { cur = null; inner = []; continue; }
    const id = /^id:\s*"([^"]*)"/.exec(t);
    if (id) { cur = id[1]; notes[cur] = { lead: pending, inner }; pending = []; continue; }
    if (/^\},?$/.test(t)) { cur = null; continue; }
    if (t.startsWith("//")) {
      if (cur) notes[cur].inner.push(line); else pending.push(line);
    }
  }
  return notes;
}

export function bake(src, list) {
  const m = DEFAULT_RE.exec(src);
  if (!m) throw new Error(`Could not find the \`const DEFAULT = [...]\` array in ${TARGET}`);
  const notes = shotNotes(m[0]);
  return src.replace(DEFAULT_RE, () => render(list, notes));
}

function main() {
  const arg = process.argv[2];
  let raw;
  try { raw = (arg && arg !== "-") ? readFileSync(arg, "utf8") : readFileSync(0, "utf8"); }
  catch (e) { console.error("Could not read the input:", e.message); process.exit(1); }
  raw = raw.trim();
  if (!raw) { console.error("No input. Pass a file path or pipe the copied shot list on stdin."); process.exit(1); }

  let list;
  try { list = parseBlob(raw); }
  catch (e) { console.error(e.message); process.exit(1); }

  const file = path.join(ROOT, TARGET);
  let src;
  try { src = readFileSync(file, "utf8"); }
  catch (e) { console.error(`Could not read ${TARGET}:`, e.message); process.exit(1); }
  let out;
  try { out = bake(src, list); }
  catch (e) { console.error(e.message); process.exit(1); }
  writeFileSync(file, out);

  console.log(`Baked ${list.length} shot(s) into ${TARGET}.`);
  console.log("Shell tags stay ?v=dev (no numeric bump — the deploy stamps hashes).");
  console.log("Next: `node --test tests/unit/flyby-shots.test.mjs` (it walks the shipped");
  console.log("sequence across three circuits and fails if an eye landed in a building),");
  console.log("then review `git diff` and commit.");
}

if (isMain(import.meta.url)) main();
