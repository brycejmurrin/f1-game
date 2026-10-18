// css-has-scope — `body:has(#x)` walks the WHOLE document; `body:has(> #x)` asks body's children.
//
// Each `body:has(#lighting:not([hidden]))` is re-matched whenever body's style is
// invalidated, and an unscoped argument is a descendant search over every node
// (~4.9k, pmsettings alone ~2.9k). DevTools trace, phone 852x393 touch race, GLX,
// headless: UpdateLayoutTree 5.6-6.4 ms/frame, ahead of all JS; scoping the
// body-child arguments to `> #x` cut it to 3.6-4.0 (docs/notes/PERF-HUNT-CPU-2026-10-17.md).
// The child combinator is the same match ONLY while #x stays a direct child of
// <body>, so this pins both directions: every scoped id IS a body child in
// index.html, and a body child is never searched for unscoped again.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// Parent tag + classes of every element in index.html, by a tag-depth walk
// (void elements, comments and raw-text tags skipped). Static: the shell owns all DOM.
function shellElements(html) {
  const VOID = new Set("area base br col embed hr img input link meta source track wbr".split(" "));
  const RAW = new Set(["script", "style", "template", "textarea", "title"]);
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
  const stack = [], out = [];
  let m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith("<!--")) continue;
    const tag = m[2].toLowerCase(), attrs = m[3];
    if (m[1] === "/") { const i = stack.map((e) => e.tag).lastIndexOf(tag); if (i >= 0) stack.length = i; continue; }
    const id = /\sid\s*=\s*"([^"]+)"/.exec(attrs), cls = /\sclass\s*=\s*"([^"]*)"/.exec(attrs);
    const up = stack[stack.length - 1];
    const el = { tag, parent: up && up.tag, up, id: id && id[1], classes: cls ? cls[1].split(/\s+/) : [] };
    out.push(el);
    if (VOID.has(tag) || attrs.trim().endsWith("/")) continue;
    if (RAW.has(tag)) { const end = html.indexOf("</" + tag, re.lastIndex); re.lastIndex = end < 0 ? html.length : end; continue; }
    stack.push(el);
  }
  return out;
}

const ELS = shellElements(read("index.html"));
const BODY_KIDS = new Set(ELS.filter((e) => e.parent === "body" && e.id).map((e) => e.id));
const HUD_KIDS = new Set(ELS.filter((e) => e.up && e.up.id === "hud" && e.id).map((e) => e.id));
const BY_ID = new Map(ELS.filter((e) => e.id).map((e) => [e.id, e]));
// Comments stripped: a quoted old selector in prose is not a rule.
const CSS = fs.readdirSync(path.join(ROOT, "css")).filter((f) => f.endsWith(".css"))
  .map((f) => ["css/" + f, read("css/" + f).replace(/\/\*[\s\S]*?\*\//g, "")]);
// Every `:has(` on a body / html compound — the second `:has(` of a chained
// `body:has(…):has(…)` included — as [whole match, "html"|"body", argument head].
// The compound is found by walking back from `:has(` at bracket depth 0 to a
// space, combinator, comma or brace (a lazy regex skipped the first of a chain).
function* hasArgs(src) {
  for (let i = src.indexOf(":has("); i >= 0; i = src.indexOf(":has(", i + 5)) {
    let j = i, depth = 0;
    while (j > 0) {
      const c = src[j - 1];
      if (c === ")" || c === "]") depth++;
      else if (c === "(" || c === "[") { if (depth === 0) break; depth--; }
      else if (depth === 0 && /[\s,{}>~+]/.test(c)) break;
      j--;
    }
    const tag = /^(html|body)\b/.exec(src.slice(j, i));
    if (!tag) continue;
    let k = i + 5, d = 0;   // the argument up to :has('s own closing paren (`:where(#hud)` nests)
    for (; k < src.length; k++) { const c = src[k]; if (c === "(" || c === "[") d++; else if (c === ")" || c === "]") { if (d === 0) break; d--; } }
    const arg = src.slice(i + 5, k).trim();
    yield [src.slice(j, i + 5) + arg, tag[1], arg];
  }
}

test("the shell walk is not vacuous", () => {
  for (const id of ["hud", "pmsettings", "pausemenu", "overlay", "lighting"]) assert.ok(BODY_KIDS.has(id), id);
  assert.ok(!BODY_KIDS.has("hud-limits"), "#hud-limits lives inside #hud");
});

// The leading child-combinator chain of a scoped argument, one compound per step, up to the first
// descendant space: `> :where(#hud) > #hud-limits:not([hidden]) x` -> [":where(#hud)", "#hud-limits:not([hidden])"].
function childChain(arg) {
  const steps = [];
  let cur = "", d = 0, i = 0;
  if (arg[0] !== ">") return steps;
  for (i = 1; i < arg.length; i++) {
    const c = arg[i];
    if (c === "(" || c === "[") d++; else if (c === ")" || c === "]") d--;
    if (d === 0 && c === ">") { steps.push(cur.trim()); cur = ""; continue; }
    if (d === 0 && /\s/.test(c) && cur.trim() && !/^\s*>/.test(arg.slice(i))) break;
    cur += c;
  }
  if (cur.trim()) steps.push(cur.trim());
  return steps;
}
// The shell element a step names: an #id (bare or in :where/:is), else a .class among `up`'s children.
function stepEl(step, up) {
  const id = /#([\w-]+)/.exec(step);
  if (id) return BY_ID.get(id[1]) || null;
  if (step === "body") return ELS.find((e) => e.tag === "body") || null;
  const cls = /\.([\w-]+)/.exec(step);
  return cls ? ELS.find((e) => e.up === up && e.classes.includes(cls[1])) || null : null;
}

test("every scoped :has(> …) chain is the shell's real parent chain, step by step", () => {
  const body = ELS.find((e) => e.tag === "body");
  const bad = [];
  let n = 0;
  for (const [file, src] of CSS) for (const m of hasArgs(src)) {
    const steps = childChain(m[2]);
    if (!steps.length) continue;
    let up = m[1] === "html" ? body.up : body;
    if (m[1] === "html" && steps[0] !== "body") { bad.push(`${file}: ${m[0]} — html:has(> …) must step through body`); continue; }
    n++;
    for (const step of steps) {
      if (/^\.screen\b|^dialog\.screen\b/.test(step) && up === body) break;   // pinned by the .screen test below
      if (/^dialog\b/.test(step) && (up === body || up.id === "datahub")) break;   // pinned by the <dialog> test below
      const el = stepEl(step, up);
      if (!el || el.up !== up) { bad.push(`${file}: ${m[0]} — "${step}" is not a child of ${up.id ? "#" + up.id : up.tag} in index.html`); break; }
      up = el;
    }
  }
  assert.ok(n >= 40, `expected the scoped rules, found ${n}`);
  assert.deepEqual(bad, [], "the child combinator stopped matching: move the element back, or fix the chain");
});

test("an added chain step cannot raise specificity: every step between body and the target is :where()", () => {
  const bad = [];
  for (const [file, src] of CSS) for (const m of hasArgs(src)) {
    const steps = childChain(m[2]);
    const mid = steps.slice(m[1] === "html" ? 1 : 0, -1);
    for (const step of mid) if (!/^:where\(/.test(step) && !/^#(pmsettings|flyby|lighting|camtune)\b/.test(step)) bad.push(`${file}: ${m[0]} — "${step}"`);
  }
  assert.deepEqual(bad, []);
});

test("scoped :has(> .screen…) holds: every .screen is a <body> child and none is built in JS", () => {
  const screens = ELS.filter((e) => e.classes.includes("screen"));
  assert.ok(screens.length >= 10, "screens found");
  assert.deepEqual(screens.filter((e) => e.parent !== "body").map((e) => e.id || e.tag), []);
  const js = [];
  const walk = (dir) => { for (const f of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + "/" + f.name;
    if (f.isDirectory()) { if (f.name !== "vendor") walk(rel); } else if (f.name.endsWith(".js") && /["'\s]screen["'\s]/.test(read(rel)) && /classList\.add\(\s*["']screen["']|className\s*=\s*["'][^"']*\bscreen\b/.test(read(rel))) js.push(rel);
  } };
  walk("js");
  assert.deepEqual(js, [], "a .screen built at runtime may not be a body child");
});

test("a <body> or #hud child is never searched for unscoped (write `:has(> #id…)` / `:has(> :where(#hud) > #id…)`)", () => {
  const bad = [];
  for (const [file, src] of CSS) for (const m of hasArgs(src)) {
    const id = /^#([\w-]+)/.exec(m[2].trim());
    if (id && (BODY_KIDS.has(id[1]) || HUD_KIDS.has(id[1]))) bad.push(`${file}: ${m[0]}`);
  }
  assert.deepEqual(bad, []);
});

// `body:has(dialog[open])` / `body:has(dialog:modal)` were the last whole-document searches
// (selector stats, phone race: a third of all selector time; docs/notes/PERF-P2-2026-10-18.md).
// Scoped to `> dialog` plus `> :where(#datahub) > dialog`, which holds only while every shell
// <dialog> is a body child and the one built at runtime (the telemetry popup) is #datahub's child.
test("scoped :has(> dialog…) holds: every shell <dialog> is a <body> child; the runtime one hangs off #datahub", () => {
  const dialogs = ELS.filter((e) => e.tag === "dialog");
  assert.ok(dialogs.length >= 15, "dialogs found");
  assert.deepEqual(dialogs.filter((e) => e.parent !== "body").map((e) => e.id || e.tag), []);
  const built = [];
  const walk = (dir) => { for (const f of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + "/" + f.name;
    if (f.isDirectory()) { if (f.name !== "vendor") walk(rel); } else if (f.name.endsWith(".js") && /(?:createElement|\bel)\(\s*["']dialog["']/.test(read(rel))) built.push(rel);
  } };
  walk("js");
  assert.deepEqual(built, ["js/data/telemetry.js"], "a new runtime <dialog>: append it to <body> or #datahub, or widen the scoped rules");
  assert.match(read("js/data/telemetry.js"), /const host = document\.getElementById\("datahub"\) \|\| document\.body;\s*host\.appendChild\(overlay\);/);
  const bad = [];
  for (const [file, src] of CSS) for (const m of hasArgs(src)) if (/^dialog\b/.test(m[2])) bad.push(`${file}: ${m[0]}`);
  assert.deepEqual(bad, [], "write `:has(> dialog…)` and `:has(> :where(#datahub) > dialog…)`");
});
