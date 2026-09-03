/* source-integrity.test.mjs — the three checks that cost a second and caught
 * nothing, because nothing was running them.
 *
 * Every one of these exists because of a real failure in the 2026-08 UI pass,
 * and in each case the 350-odd guards that DO run were green through it:
 *
 *   1. A comment body with no opening `/*` in js/ui/sheet-shape.js. That is a
 *      SyntaxError, so the whole IIFE never ran, so no sheet carried
 *      `data-shape` or `data-pair` and every list/detail layout in the app
 *      silently fell back to stacked. Nothing failed. It was caught by looking
 *      at a rendered page.
 *   2. A stray `}` left by a scripted edit in css/carsetup.css, which closed
 *      `@layer components` early. Everything after it became UNLAYERED, and an
 *      unlayered rule beats every layer — so roughly half a stylesheet quietly
 *      changed precedence. A stylesheet does not report errors; it just stops
 *      containing what you thought.
 *   3. tools/layout-audit.mjs surveyed 38 screens while the shell had 39. The
 *      missing one was #track-detail, which is exactly why a landscape
 *      dead-band in it survived a 380-cell survey and had to be found by hand.
 *      A survey is only as good as its inventory, and nothing checked the
 *      inventory.
 *
 * (1) and (2) are not style rules — they are "does this file still parse", and
 * the answer being NO is invisible at runtime in both languages. (3) is the
 * same idea one level up: does the thing that measures us know what to measure.
 *
 * Run: node --test tests/unit/source-integrity.test.mjs  (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const walk = (dir, ext, out = []) => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, ext, out);
    else if (e.name.endsWith(ext)) out.push(rel);
  }
  return out;
};

test("every js/ file still parses", () => {
  // vendor/ is excluded: it is a vendored three.js island of ES modules, not
  // ours to keep parsing, and `node --check` reads it as a script.
  const files = walk("js", ".js");
  assert.ok(files.length > 100, `expected the whole js tree, found ${files.length}`);
  const broken = [];
  for (const f of files) {
    try {
      execFileSync(process.execPath, ["--check", path.join(ROOT, f)], { stdio: "pipe" });
    } catch (e) {
      broken.push(`${f}: ${String(e.stderr || e).split("\n").find((l) => /Error/.test(l)) || "parse failed"}`);
    }
  }
  assert.deepEqual(broken, [],
    "a js file does not parse. Every file here is a plain <script>, so a SyntaxError " +
    "means the global it assigns never exists and everything downstream silently " +
    "degrades — no error, no failing test, just a different layout");
});

test("every css/ file has balanced braces outside comments", () => {
  const files = walk("css", ".css");
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    let depth = 0, wentNegative = false;
    for (const ch of src) {
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth < 0) { wentNegative = true; break; } }
    }
    if (wentNegative) bad.push(`${f}: a '}' closes more than was opened`);
    else if (depth !== 0) bad.push(`${f}: ${depth} block(s) left open`);
  }
  assert.deepEqual(bad, [],
    "a stylesheet's braces do not balance. Every file here wraps its rules in an " +
    "@layer, so one stray brace closes the layer early and everything after it " +
    "becomes UNLAYERED — which beats every layer, silently");
});

test("Spotify dialog has an accessible name", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(html,
    /<dialog id="spotifypanel"[^>]*aria-labelledby="dlg-spotify"[^>]*>[\s\S]*?<h2 id="dlg-spotify">SPOTIFY<\/h2>/,
    "#spotifypanel must reference its visible heading");
});

test("Data Export actions are not announced as toggles", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/data/export.js"), "utf8");
  assert.match(src, /gatherBtn\.setAttribute\("data-aria-action",\s*""\)/);
  assert.match(src, /dlBtn\.setAttribute\("data-aria-action",\s*""\)/);
});

/* A SELECTOR THAT MATCHES NOTHING IS THE THIRD WAY A STYLESHEET LIES.
 * The first two are above: a file that does not parse, and a brace that ends a
 * layer early. This one is quieter than either — the file parses, the braces
 * balance, the rule is right there in the source, and it simply never applies to
 * any element that has ever existed.
 *
 * Both shapes below are REAL, both from the 2026-08 UI pass, and both survived
 * every guard in the repo:
 *
 *   `#lighting-inner[data-density="compact"] body.photo-mode … #lighting-inner`
 *
 *   - `body` as a DESCENDANT of a panel. `body` is an ancestor of everything;
 *     nothing is inside it in the sense a descendant combinator means. SEVEN
 *     rules in css/tuner.css carried this — the entire single-column layout the
 *     lighting tuner uses in FREE CAMERA, plus the `--dock-w` that pays for the
 *     rail's 210px furniture column. With them dead the panel kept a two-column
 *     grid at a width that left the sliders 76px, and "KEY LIGHT (SUN)" set one
 *     word per line. Found by looking at a screenshot, months later.
 *   - the SAME id twice in one selector. Ids are unique, so `#a … #a` is either
 *     a no-match or a tautology; either way it is not what was meant. This has
 *     happened three times in this codebase, always the same way — a scoping
 *     prefix applied mechanically to a whole block whose rules did not all start
 *     at the same element.
 *
 * Cheap, total, and it needs no browser: the mistake is visible in the text.
 */
test("no CSS selector can never match", () => {
  const files = walk("css", ".css");
  // Every rule prelude at EVERY depth — these files wrap everything in an
  // @layer, so a depth-0 scan would see exactly one prelude per file.
  const preludes = (src) => {
    const out = []; let buf = "";
    for (const c of src) {
      if (c === "{") { out.push(buf.trim()); buf = ""; }
      else if (c === "}" || c === ";") buf = "";
      else buf += c;
    }
    return out;
  };
  // Split on commas OUTSIDE parentheses: `:is(#a, #b)` is one compound, not two.
  const topLevelSplit = (s, sep) => {
    const out = []; let d = 0, cur = "";
    for (const c of s) {
      if (c === "(") d++; else if (c === ")") d--;
      if (c === sep && d === 0) { out.push(cur); cur = ""; } else cur += c;
    }
    out.push(cur); return out;
  };
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const p of preludes(src)) {
      if (!p || p.startsWith("@")) continue;
      for (const sel of topLevelSplit(p, ",")) {
        const s = sel.trim();
        if (!s) continue;
        // Blank out parenthesised arguments before looking for combinators:
        // `body:has(#x > #y)` is a body-rooted rule, not a descendant of #x.
        const outer = s.replace(/\([^()]*\)/g, (m) => " ".repeat(m.length));
        if (/[\s>+~](body|html)\b/.test(outer)) {
          bad.push(`${f}: body/html as a descendant — ${s.slice(0, 100)}`);
        }
        const ids = outer.match(/#[A-Za-z][-\w]*/g) || [];
        if (new Set(ids).size !== ids.length) {
          bad.push(`${f}: the same id twice — ${s.slice(0, 100)}`);
        }
      }
    }
  }
  assert.deepEqual(bad, [],
    "a selector here can never match any element, so its whole rule is dead. A " +
    "stylesheet reports nothing for this: it parses, it cascades, and the layout " +
    "it describes simply never happens");
});

/* THE SHELL'S TAGS NEST. The two checks above ask "does this file still parse"
 * for JS and for CSS, and index.html — the only HTML in the project, holding
 * every screen in the app — had no equivalent.
 *
 * It was needed within the hour it was written. A scripted edit inserted a
 * closing `</details>` into the shell while the matching opening tag had never
 * been written: the script that was supposed to add it asserted, failed on a
 * LATER assertion, and died before its write, so only the second half landed.
 * An unbalanced tag does not throw. The browser's parser silently re-nests
 * around it, which moves whole screens into the wrong parent — and every guard
 * in this repo stayed green, because none of them read the markup.
 *
 * Deliberately a NESTING check and nothing more. It is not a validator and must
 * not grow into one: void elements, self-closing SVG and boolean attributes all
 * live in this file and are all fine. The one question is whether every
 * container that opens gets closed, in order.
 */
test("index.html's tags are balanced and correctly nested", () => {
  const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
    .replace(/<!--[\s\S]*?-->/g, "")              // comments
    .replace(/<script[\s\S]*?<\/script>/gi, "")    // JS may contain "<" and "</div>" in strings
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  // Elements that never have a closing tag, so they never enter the stack.
  const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr"]);
  const stack = [];
  const bad = [];
  for (const m of src.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g)) {
    const [, slash, rawName, attrs] = m;
    const name = rawName.toLowerCase();
    if (VOID.has(name) || attrs.trimEnd().endsWith("/")) continue;
    const line = src.slice(0, m.index).split("\n").length;
    if (!slash) { stack.push({ name, line }); continue; }
    const top = stack.pop();
    if (!top) { bad.push(`line ${line}: </${name}> closes nothing`); break; }
    if (top.name !== name) {
      bad.push(`line ${line}: </${name}> closes <${top.name}> opened at line ${top.line}`);
      break;
    }
  }
  for (const left of stack.slice(0, 3)) bad.push(`<${left.name}> at line ${left.line} is never closed`);

  assert.deepEqual(bad, [],
    "index.html's tags do not nest. This is the one HTML file in the project and it " +
    "holds every screen in the app; an unbalanced tag does not throw, the parser " +
    "silently re-nests around it, and a whole screen ends up inside the wrong parent");
});

test("tools/menu-screens.mjs knows about every screen in the shell", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const audit = fs.readFileSync(path.join(ROOT, "tools/menu-screens.mjs"), "utf8");

  const shell = new Set([
    ...[...html.matchAll(/<dialog id="([a-z0-9-]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/<div id="([a-z0-9-]+)"[^>]*class="[^"]*\bscreen\b/g)].map((m) => m[1]),
    // The third arm: a modal that is neither a <dialog> nor a .screen div.
    // #rotate-device hid from this scan for months exactly this way — a bare
    // <div role="dialog"> with no class at all is still a screen the survey
    // should know about (or explicitly refuse below).
    ...[...html.matchAll(/<div id="([a-z0-9-]+)"[^>]*role="dialog"/g)].map((m) => m[1]),
  ]);
  // Screens the survey deliberately does NOT open, each with its reason —
  // an entry here is a written decision, not a gap.
  const EXEMPT = new Set([
    // CSS-media-gated (portrait + coarse + <=743w + <=950h) AND mid-race
    // only: reachable in one of the twelve survey viewports and never from a
    // menu, so a SCREENS entry would report eleven skips per run. Covered
    // instead by tests/specs/ui-audit.spec.js "23 portrait rotate-device
    // overlay" and tests/specs/rotation-recovery.spec.js.
    "rotate-device",
  ]);
  // The audit names a screen either by its root selector or by an id: entry
  // whose spelling drops the hyphens (trackdetail for #track-detail).
  const known = new Set([
    ...[...audit.matchAll(/root:\s*"#([a-z0-9-]+)"/g)].map((m) => m[1]),
    ...[...audit.matchAll(/id:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]),
  ]);
  const missing = [...shell].filter((id) =>
    !EXEMPT.has(id) && !known.has(id) && !known.has(id.replace(/-/g, "")));

  assert.deepEqual(missing, [],
    "a screen exists in index.html that tools/layout-audit.mjs never opens, so the " +
    "layout survey silently does not cover it. Add it to SCREENS in menu-screens.mjs — or, if it " +
    "genuinely cannot be surveyed, add it to EXEMPT above with the reason, " +
    "rather than leaving the gap unstated");
});

test("Settings uses labelled category tabs with matching panels", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  for (const id of ["controls", "display", "more"]) {
    assert.match(html, new RegExp(`id="pm-tab-${id}"[^>]*role="tab"[\\s\\S]{0,180}aria-controls="pm-panel-${id}"`));
    assert.match(html, new RegExp(`id="pm-panel-${id}"[^>]*role="tabpanel"[\\s\\S]{0,180}aria-labelledby="pm-tab-${id}"`));
  }
  assert.match(html, /id="pm-category-tabs"[^>]*role="tablist"/);
});

test("portrait race blocker is an actionable accessible dialog", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.match(html, /id="rotate-device"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /id="rotate-device"[^>]*aria-labelledby="rotate-title"[^>]*aria-describedby="rotate-detail"/);
  assert.match(html, /Turn off rotation lock, then rotate your phone\./,
    "guidance must not tell a portrait-locked player to enable rotation lock");
  assert.match(html, /id="rotate-controls"/);
  assert.match(html, /id="rotate-exit"/);
  assert.match(game, /\$\("rotate-controls"\)\.onclick[\s\S]*?setPaused\(true\)/,
    "Controls must pause before yielding the blocker to help");
  assert.match(game, /\$\("rotate-exit"\)\.onclick\s*=\s*\(\)\s*=>\s*quitToMenu\(\)/,
    "Exit Race must use the real session cleanup path");

  // RACE IN PORTRAIT is the opt-in. The blocker stays the DEFAULT — it is the
  // recovery path for a phone rotation-locked mid-race — so the CSS must gate
  // on a class the player sets, never remove the rule.
  assert.match(html, /id="rotate-race"/);
  assert.match(game, /\$\("rotate-race"\)\.onclick[\s\S]*?rotate-ok/,
    "the opt-in must set the class the blocker rule reads");
  assert.match(game, /localStorage\.setItem\("apex26\.portraitOk"/,
    "the choice must survive a reload, or the blocker asks again every race");
  const css = fs.readFileSync(path.join(ROOT, "css/responsive.css"), "utf8");
  assert.match(css, /body\.in-race:not\(\.rotate-ok\) #rotate-device \{ display: flex; \}/,
    "the blocker must still appear by default — opt-in, not opt-out");
});

test("no screen fakes modality with a div claiming dialog semantics", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const FAKE_MODAL_OK = new Set([
    // The blocker is a viewport-gated sheet over a RUNNING race — it must NOT
    // be a real dialog, because showModal() inerts the document and the race
    // canvas and pause switch have to stay live behind it. Its semantics are
    // pinned positively in the test above.
    "rotate-device",
  ]);
  const fakes = [];
  for (const m of html.matchAll(/<div\s[^>]*id="([a-z0-9-]+)"[^>]*>/g)) {
    if (FAKE_MODAL_OK.has(m[1])) continue;
    if (/role="dialog"|aria-modal="true"/.test(m[0])) fakes.push(m[1]);
  }
  assert.deepEqual(fakes, [],
    "a <div> claiming role=\"dialog\" or aria-modal is a promise the platform " +
    "never honours: no top layer, no focus containment, no Escape, no :modal. " +
    "Every modal here is a real <dialog> mirrored by js/ui/modal.js — the " +
    "data hub and the telemetry popup were the last two fakes to convert. Use " +
    "one, or add the id to FAKE_MODAL_OK with the reason it cannot be modal: " +
    fakes.join(", "));
});

test("Circuit filters are not nested in a listbox and circuits expose button state", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const menus = fs.readFileSync(path.join(ROOT, "js/ui/select-screen.js"), "utf8");
  assert.match(html, /id="sel-tracks"[^>]*role="group"/);
  assert.doesNotMatch(html, /id="sel-tracks"[^>]*role="listbox"/);
  assert.match(menus, /row\.setAttribute\("aria-pressed"/);
  assert.doesNotMatch(menus, /row\.setAttribute\("role", "option"\)/);
});

test("scenery SUPPRESSED is coalesced, not a per-prop Log.warn", () => {
  const files = [
    "js/track/tracks.js",
    "js/track/scenery/structures.js",
    "js/track/scenery/nature.js",
    "js/track/scenery/city.js",
    "js/track/scenery/identity.js",
  ];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    assert.doesNotMatch(src, /Log\.warn\("scenery", `[^`]*SUPPRESSED/,
      rel + " still warns per suppressed prop");
    assert.doesNotMatch(src, /Log\.warn\("track", `place SUPPRESSED/,
      rel + " still warns per suppressed place()");
  }
  const tracks = fs.readFileSync(path.join(ROOT, "js/track/tracks.js"), "utf8");
  assert.match(tracks, /const noteSuppressed = /);
  assert.match(tracks, /: suppressed /);
});


test("the audio block cannot deref a null player, and a lone throw no longer kills the loop", () => {
  // startRace is ASYNC now (it awaits ensureScenery for the split scenery
  // files), so update() can tick before makeCars has staged the grid. It
  // already documents that player may be null and guards ITSELF; this block did
  // not. Measured
  // 2026-08-31 via __apex.race() + go(): 0 draws a frame, permanently, with
  // "Cannot read properties of null (reading 'rpm')" once. PERF-FINDINGS 2i.
  const src = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.match(src, /if \(soundOn && player\) \{/,
    "the engine-audio block must test player before dereferencing it");
  assert.doesNotMatch(src, /if \(soundOn\) \{\n\s*const revFrac/,
    "the unguarded `if (soundOn)` form is back — it dies on a null player");

  // THE POLICY MOVED (round 14, PERF-FINDINGS 2k). The title above used to end
  // "one throw kills the render loop", and that was the whole cost of the bug:
  // a throw escaped tick() before the rAF re-schedule, so the loop never ran
  // again. Fixing the one deref left every OTHER transient fault just as fatal.
  // tick() now tolerates a bounded run that a clean frame pays back, and still
  // rethrows at the cap — BOTH halves pinned, because either alone is wrong: no
  // tolerance is the old bug, and unbounded tolerance repaints the error
  // overlay 60x/s for a deterministic fault.
  assert.match(src, /if \(LoopHealth\.fault\(e\)\) \{ requestAnimationFrame\(tick\); return; \}/,
    "a tolerated fault must re-schedule the frame");
  assert.match(src, /tickBody\(now\); LoopHealth\.clean\(\); requestAnimationFrame\(tick\);/,
    "a clean frame must pay the fault run back, or unrelated faults reach the cap");
  assert.match(src, /tick\._reported = true; window\.__apexReportError\("tick", e\);[^]*?\n\s*\}\n\s*throw e;/,
    "at the cap the loop must still report once and rethrow");
});

test("the GL-call census refuses to report a frame it did not measure", () => {
  // It printed `per: {}` and exited 0 for a whole session while the render loop
  // was dead: "no calls" was indistinguishable from "I counted no calls". Same
  // absence-reads-as-normal shape as the vacuous gpuErrors check and the
  // readdirSync harnesses that built circuits bare, both of which shipped
  // confident numbers about nothing. PERF-FINDINGS 2i.
  const src = fs.readFileSync(path.join(ROOT, "tools/glx-call-census.mjs"), "utf8");
  assert.match(src, /CENSUS MEASURED NOTHING/);
  assert.match(src, /process\.exitCode = 1/,
    "an empty census must exit non-zero, not merely print");
  // race() -> wait -> go(), never one evaluate: go() in the async startRace
  // window is what killed the loop in the first place.
  assert.match(src, /__apex\.race\(t, d, "clear"\); \}, \[TRACK, TOD\]\)/);
  assert.match(src, /await page\.evaluate\(\(\) => __apex\.go\(\)\)/,
    "go() must come after the track wait, on its own");
});
