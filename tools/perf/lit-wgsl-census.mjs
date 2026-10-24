#!/usr/bin/env node
// tools/perf/lit-wgsl-census.mjs — hash the WGSL that three.js/TSL generates for TLX's lit family, per tree.
// @doc Hash the WGSL a TLX WebGPU race compiles (lavapipe) and diff two trees: does a change re-key Safari's pipeline cache?
//
// WHY. Safari keeps its WebGPU pipeline cache across reload, kill and data-clear, keyed on the shader CODE. A merge
// that changes the generated lit WGSL re-charges ~14 s (race) + ~7.5 s (menu) of Metal compile to every iPhone
// (#3672, PR #3671 §4, docs/notes/NIGHT-ENTRY-WEBGPU-2026-10-23.md).
//
//   node tools/perf/lit-wgsl-census.mjs capture [--root <dir>] [--out <file.json>] [--track monza] [--tod day] [--weather dry]
//   node tools/perf/lit-wgsl-census.mjs diff <base.json> <head.json> [--json] [--md]
//   node tools/perf/lit-wgsl-census.mjs hash-of <file.json>            # one line: the family hash
//   node tools/perf/lit-wgsl-census.mjs advisory --base <dir> --head <dir> [--md-out <file>]   # capture both trees, diff, print the PR verdict
//
// capture serves --root (default: this checkout) statically, boots Chromium on Mesa lavapipe (the same WebGPU stack
// gfx-probe --lavapipe uses), pins TLX to its WebGPU path, races <track>, and records every
// GPUDevice.createShaderModule call. Each module is stored twice: `raw` (sha256 of the code as three wrote it) and
// `norm` (sha256 after renaming TSL's build-order identifiers by first appearance). raw is what Safari keys on, so
// it is the verdict; norm only explains a raw change ("names only" = a re-key with no semantic change).
// Exit 0 always for `diff` (advisory); `capture` exits 1 when no module was recorded (no WebGPU) so a skip is loud.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** Rename TSL build-order identifiers (`nodeVar12`, `tmp_3`, `_uniform7`…) by first appearance, so a pure
 *  renumbering normalises equal. Conservative: only names ending in digits after a known TSL stem. */
export function normaliseWgsl(code) {
  const seen = new Map();
  return code.replace(/\b(nodeVar|nodeUniform|nodeAttribute|nodeVarying|nodeCode|nodeBuffer|NodeBuffer|nodeTexture|nodeStruct|nodeProperty|tmp|nodeFunction|nodeObject|nodeSampler)_?(\d+)(?!\d)/g,
    (m, stem) => {
      if (!seen.has(m)) seen.set(m, `${stem}#${seen.size}`);
      return seen.get(m);
    });
}

/** The lit family: a large fragment module that reads a comparison-sampled shadow map (the TSL lit material).
 *  Post, sky, fx and shadow casters are reported but are not part of the family hash. Heuristic, printed per row. */
export function classify(code) {
  const fs = /@fragment/.test(code), vs = /@vertex/.test(code), cs = /@compute/.test(code);
  const stage = cs ? "compute" : fs && vs ? "vs+fs" : fs ? "fs" : vs ? "vs" : "other";
  const lit = fs && code.length > 20000 && /sampler_comparison/.test(code);
  return { stage, lit };
}

/** The PR-facing verdict: one status line, then (if changed) what moved. */
export function renderAdvisory(d) {
  const head = d.familyChanged
    ? `**lit-WGSL CHANGED** — this PR re-keys the lit shader family: every phone with a warm WebGPU pipeline cache recompiles it on its next race (~14 s race warm + ~7.5 s menu warm on an iPhone 14, #3672).`
    : d.changed
      ? `**lit-WGSL unchanged** — the lit family hash is identical (${d.litHead} lit modules); ${d.added} other module(s) changed (post/sky/fx/shadow), which re-charges only those programs.`
      : `**lit-WGSL unchanged** — all ${d.modulesHead} captured shader modules are byte-identical to the base; no phone recompiles.`;
  const lines = [head, "", "| | base | head |", "|---|---|---|", `| modules | ${d.modulesBase} | ${d.modulesHead} |`, `| lit modules | ${d.litBase} | ${d.litHead} |`,
    `| removed / added | ${d.removed} | ${d.added} |`];
  if (d.changed) lines.push("", d.namesOnly === d.added && d.added
    ? "Every added module equals a removed one after renaming TSL build-order names: the change is NAMES ONLY (a node build-order shift), no semantic edit — still a re-key."
    : `${d.namesOnly} of ${d.added} added module(s) differ from a removed one only by TSL build-order names; the rest are real edits.`);
  lines.push("", "_Advisory (tools/perf/lit-wgsl-census.mjs, lavapipe, monza day dry, one capture per tree). Not a gate. Docs: docs/notes/LIT-WGSL-CENSUS-2026-10-24.md._");
  return lines.join("\n");
}

export function summarise(modules) {
  // The same module is created more than once (per device/pipeline variant), and how many times depends on timing:
  // identical text is one row, so counts and the family hash do not move with capture length.
  const uniq = [...new Map(modules.map((m) => [sha(m.code), m])).values()];
  const rows = uniq.map((m) => {
    const c = classify(m.code);
    return { raw: sha(m.code), norm: sha(normaliseWgsl(m.code)), bytes: m.code.length, label: m.label || "", ...c };
  });
  const litRaw = rows.filter((r) => r.lit).map((r) => r.raw).sort();
  const allRaw = rows.map((r) => r.raw).sort();
  return { rows, litCount: litRaw.length, familyHash: sha(litRaw.join(",")), allHash: sha(allRaw.join(",")) };
}

/** Compare two summaries by raw hash multiset. */
export function diffSummaries(base, head) {
  const count = (rows) => { const m = new Map(); for (const r of rows) m.set(r.raw, (m.get(r.raw) || 0) + 1); return m; };
  const cb = count(base.rows), ch = count(head.rows);
  const gone = base.rows.filter((r) => !ch.has(r.raw));
  const added = head.rows.filter((r) => !cb.has(r.raw));
  const namesOnly = added.filter((a) => gone.some((g) => g.norm === a.norm));
  const lit = (rows) => rows.filter((r) => r.lit);
  return {
    changed: gone.length > 0 || added.length > 0,
    familyChanged: base.familyHash !== head.familyHash,
    modulesBase: base.rows.length, modulesHead: head.rows.length,
    litBase: base.litCount, litHead: head.litCount,
    removed: gone.length, added: added.length,
    litRemoved: lit(gone).length, litAdded: lit(added).length,
    namesOnly: namesOnly.length,
    addedRows: added,
  };
}

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      if (["json", "md"].includes(k)) o[k] = true;
      else o[k] = argv[++i];
    } else o._.push(a);
  }
  return o;
}

async function capture(o) {
  const root = resolve(o.root || ROOT);
  const { startStaticServer, launchChromium, WEBGPU_LAVAPE_CHROMIUM_ARGS, WEBGPU_LAVAPE_ENV, shutdown } =
    await import("../lib/harness.mjs");
  const srv = await startStaticServer(root);
  const browser = await launchChromium({
    args: [...WEBGPU_LAVAPE_CHROMIUM_ARGS, "--headless=new"],
    env: { ...process.env, ...WEBGPU_LAVAPE_ENV },
  });
  const modules = [];
  try {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
    await page.exposeFunction("__litWgslRecord", (label, code) => { modules.push({ label, code }); });
    await page.addInitScript(() => {
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.tlxForceGL", "0");
      localStorage.setItem("apex26.gfxWgxAllowSoftware", "1");
      sessionStorage.setItem("apex26.wgxCapture", "1");
      const hook = () => {
        const D = window.GPUDevice && window.GPUDevice.prototype;
        if (!D || D.__litHooked) return !!D;
        const orig = D.createShaderModule;
        D.createShaderModule = function (desc) {
          try { window.__litWgslRecord(String((desc && desc.label) || ""), String((desc && desc.code) || "")); } catch (_) { /* page gone */ }
          return orig.call(this, desc);
        };
        D.__litHooked = true;
        return true;
      };
      if (!hook()) { const t = setInterval(() => { if (hook()) clearInterval(t); }, 5); }
    });
    await page.goto(srv.url + "index.html", { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(() => window.__apex, null, { polling: 100, timeout: 90000 });
    await page.evaluate(async () => { try { await Assets.loadModels(); } catch (_) { /* pack optional */ } });
    await page.evaluate(({ id, tod, weather }) => { __apex.race(id, tod, weather); __apex.go(); },
      { id: o.track || "monza", tod: o.tod || "day", weather: o.weather || "dry" });
    // Settle: the lit programs are built during race entry and on the first frames; wait until no new module
    // arrives for `settle` s (default 25; software GL is slow to reach the late programs), at most 240 s.
    const settle = Number(o.settle || 25);
    let last = -1, stable = 0;
    for (let t = 0; t < 240 && stable < settle; t++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (modules.length === last) stable++; else { stable = 0; last = modules.length; }
    }
  } finally {
    await browser.close().catch(() => {});
    await srv.close();
    shutdown();
  }
  return modules;
}

const o = args(process.argv.slice(2));
const cmd = o._[0];
if (import.meta.url === `file://${process.argv[1]}`) {
  if (cmd === "capture") {
    const modules = await capture(o);
    if (!modules.length) { console.error("lit-wgsl-census: no shader module recorded (no WebGPU/lavapipe?)"); process.exit(1); }
    const out = resolve(o.out || resolve(ROOT, "artifacts/lit-wgsl/capture.json"));
    mkdirSync(dirname(out), { recursive: true });
    const s = summarise(modules);
    writeFileSync(out, JSON.stringify({ track: o.track || "monza", tod: o.tod || "day", ...s, modules }, null, 1));
    console.log(`= capture modules=${s.rows.length} lit=${s.litCount} family=${s.familyHash} all=${s.allHash} -> ${out}`);
  } else if (cmd === "diff") {
    const [b, h] = o._.slice(1).map((f) => summarise(JSON.parse(readFileSync(f, "utf8")).modules));
    const d = diffSummaries(b, h);
    console.log(o.json ? JSON.stringify(d, null, 1) : `= lit-wgsl ${d.familyChanged ? "CHANGED" : "unchanged"} modules ${d.modulesBase}->${d.modulesHead} lit ${d.litBase}->${d.litHead} removed=${d.removed} added=${d.added} namesOnly=${d.namesOnly}`);
  } else if (cmd === "advisory") {
    const sums = [];
    for (const root of [o.base, o.head]) {
      const mods = await capture({ ...o, root });
      if (!mods.length) { console.error(`lit-wgsl-census: no shader module recorded for ${root}`); process.exit(1); }
      sums.push(summarise(mods));
    }
    const md = renderAdvisory(diffSummaries(sums[0], sums[1]));
    console.log(md);
    if (o["md-out"]) writeFileSync(resolve(o["md-out"]), md + "\n");
  } else if (cmd === "hash-of") {
    console.log(summarise(JSON.parse(readFileSync(o._[1], "utf8")).modules).familyHash);
  } else {
    console.error("usage: lit-wgsl-census.mjs capture|diff|hash-of …");
    process.exit(2);
  }
}
