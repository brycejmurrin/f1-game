#!/usr/bin/env node
// @doc Which specs `tests/helpers/vm-page.js` could run under `node --test`: per-spec blocking calls + a portable count.
/**
 * vm-portable — the eligibility lint for the `vmPage` adapter.
 *
 *   node tools/check/vm-portable.mjs              # table, one row per spec
 *   node tools/check/vm-portable.mjs --json       # machine-readable
 *   node tools/check/vm-portable.mjs --portable   # just the portable list
 *   node tools/check/vm-portable.mjs --blocked    # only the specs that cannot
 *
 * VERDICT AS OF THIS COMMIT (measured by running this file over tests/specs):
 *
 *     118 specs  →  35 portable today
 *                   53 portable after a one-line import change (18 specs
 *                      import `test` straight from @playwright/test, so they
 *                      cannot see the APEX_VM_PAGE switch in fixtures.js)
 *                   65 need a browser
 *
 * EVERY BLOCKER CLASS BELOW WAS FOUND BY RUNNING SPECS, not by reading them.
 * A ten-spec cohort was put through the adapter first; the classes the first
 * version of this lint could not see are the ones that failed:
 *
 *   spec                    adapter result   this lint now says
 *   physics-fixes           2/2   22.0 s     portable
 *   logging   (sharedTest)  6/6    4.0 s     portable
 *   headless-api           23/24   5 s       portable
 *   new-hooks              50/56  22 s       portable
 *   agent-determinism       4/5   21.2 s     BLOCKED (requestAnimationFrame)
 *   steering                2/13   2 s       BLOCKED (in-page .click())
 *   sliders                16/22  54 s       BLOCKED (in-page dispatchEvent)
 *   presets                 4/4    4 s       BLOCKED (in-page .click()) — a
 *                                            conservative false negative
 *   scenery-kits            0/1    1 s       BLOCKED (@playwright/test import)
 *   understeer-cue          0/7  317 s       portable — AND STILL ALL RED
 *
 * That last row is the one to keep in view. PORTABLE IS NECESSARY, NOT
 * SUFFICIENT: this lint can only say that nothing in the spec reaches for a
 * browser API, never that the VM reproduces what the browser did. Only running
 * the spec says that, and only a fidelity gate (the research plan's item 2)
 * says it will keep saying it. Nothing should leave a blocking browser gate on
 * the strength of a `yes` in this table alone.
 *
 * The residue this lint deliberately does NOT model is one semantic
 * divergence, not an API: game-vm settles the BOOT circuit's scenery before
 * createGame returns, so the first `__apex` call completes the lazy track
 * build in line. Every "returns null before a track is loaded" test therefore
 * goes red under the adapter — 7 of the cohort's failures outside steering and
 * sliders are that single cause. First-load assertions do not adapt, and a
 * static scan cannot tell one from a normal hook read.
 *
 * A spec is PORTABLE when every API it reaches for is one
 * tests/helpers/vm-page.js implements: goto / evaluate / waitForFunction /
 * waitForTimeout / addInitScript / on / reload, plus `expect` on plain values.
 * Everything else — a locator, a screenshot, the mouse, the keyboard, a route
 * mock, the clock, a real viewport resize, `expect(locator)` — needs a browser,
 * and this tool names WHICH call and on WHICH line so the answer is actionable
 * rather than a yes/no.
 *
 * TWO BLOCKERS THAT ARE NOT AN API CALL, and both were found by running the
 * adapter rather than by reading specs:
 *
 *   1. `requestAnimationFrame` inside an evaluate body. game-vm skips GLX, so
 *      the game's own frame callback reaches render() and throws on the first
 *      pump (measured: `_carCullPlanes[i]` undefined, js/game.js:7224). A spec
 *      that resolves an evaluate on a frame is asserting something ABOUT
 *      frames and belongs in a browser.
 *   2. `page.route` / a spec asserting stubbed Jolpica/OpenF1 CONTENT. game-vm
 *      has no network at all — `fetch` rejects like an offline browser — so
 *      the fixture's route mocks have no equivalent.
 *
 * WHAT THIS TOOL DELIBERATELY DOES NOT SAY. Portable is not the same as
 * SHOULD BE ADAPTED. A twin (or an adapted spec) is blind to everything the
 * renderer does, which is why tools/ci/twinned-specs.mjs keeps that cost
 * written down and why smoke.spec.js and physics-characterization.spec.js stay
 * in a real browser whatever this table says.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as espree from "espree";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SPECS = path.join(ROOT, "tests", "specs");

/** Everything tests/helpers/vm-page.js serves. Anything else on a `page`,
 *  `context` or locator object is a blocker. */
export const SERVED = new Set([
  "goto", "evaluate", "waitForFunction", "waitForTimeout", "addInitScript",
  "on", "off", "reload", "close", "url", "isClosed", "setViewportSize",
  "viewportSize",
]);

/** Page/context methods that exist in Playwright and cannot be served. Listed
 *  rather than derived so a NEW Playwright API is reported as unknown-blocking
 *  instead of silently passing. */
export const BLOCKING_METHODS = new Set([
  "locator", "getByRole", "getByText", "getByTestId", "getByLabel", "getByTitle",
  "getByAltText", "getByPlaceholder", "screenshot", "click", "dblclick", "fill",
  "press", "hover", "type", "check", "uncheck", "selectOption", "focus", "blur",
  "tap", "dragAndDrop", "setInputFiles", "waitForSelector", "waitForEvent",
  "waitForRequest", "waitForResponse", "waitForNavigation", "waitForLoadState",
  "waitForURL", "route", "unroute", "routeFromHAR", "setContent", "content",
  "title", "frame", "frameLocator", "childFrames", "exposeFunction",
  "exposeBinding", "evaluateHandle", "pdf", "emulateMedia", "addStyleTag",
  "addScriptTag", "bringToFront", "goBack", "goForward", "newPage",
  "newContext", "setExtraHTTPHeaders", "setOffline", "grantPermissions",
  "videoFrame", "accessibility", "coverage", "opener", "dispatchEvent",
]);

/** Reached from INSIDE an evaluate body, these need a DOM that game-vm does
 *  not have. `getElementById(...).textContent` and friends stay legal — the
 *  stub serves a plain element for any id — so only the members that need a
 *  real tree, a real box or a real event path are listed. */
export const DOM_IN_PAGE = new Set([
  "click", "querySelector", "querySelectorAll", "getElementsByClassName",
  "getElementsByTagName", "getBoundingClientRect", "getClientRects",
  "dispatchEvent", "elementFromPoint", "closest", "matches", "scrollIntoView",
  "getComputedStyle", "showModal", "requestFullscreen", "animate",
]);

/** Objects whose every member is a browser: page.mouse.move, page.clock.fastForward. */
export const BLOCKING_OBJECTS = new Set(["mouse", "keyboard", "touchscreen", "clock", "request", "coverage", "accessibility"]);

/** The receivers a blocking method actually matters on. `window.location.reload`
 *  inside an evaluate body is not a page call. */
const PAGE_RECEIVERS = /^(page|context|racePage|_bootedPage|sharedPage)$/;

const SKIP_KEYS = new Set(["loc", "range", "type", "parent", "start", "end"]);
function each(node, fn) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) each(n, fn); return; }
  fn(node);
  for (const k of Object.keys(node)) if (!SKIP_KEYS.has(k)) each(node[k], fn);
}

const name = (n) => (n && n.type === "Identifier" ? n.name : n && n.type === "Literal" ? String(n.value) : null);

/**
 * Blocking calls in one spec's source.
 * @returns {{file:string, parseError?:string, blockers:{line:number, what:string, why:string}[], evaluates:number}}
 */
export function auditSource(src, file = "<src>") {
  let ast;
  try {
    ast = espree.parse(src, { ecmaVersion: "latest", sourceType: "module", loc: true });
  } catch (e) {
    return { file, parseError: e.message, blockers: [{ line: 0, what: "parse", why: e.message }], evaluates: 0 };
  }
  const blockers = [];
  const seen = new Set();
  const add = (line, what, why, kind = "api") => {
    const k = `${what}@${line}`;
    if (seen.has(k)) return;
    seen.add(k);
    blockers.push({ line, what, why, kind });
  };
  let evaluates = 0;

  // The backend switch lives in tests/helpers/fixtures.js, so a spec that
  // imports `test` straight from @playwright/test cannot see it. Counted
  // separately from the rest: it is a ONE-LINE import change, not a rewrite,
  // and lumping it in with `page.mouse` would hide how close those specs are.
  for (const n of ast.body) {
    if (n.type === "ImportDeclaration" && n.source.value === "@playwright/test") {
      add(n.loc.start.line, 'import from "@playwright/test"',
          "the APEX_VM_PAGE switch is in tests/helpers/fixtures.js — change the import line", "import");
    }
  }

  each(ast, (n) => {
    // page.mouse.* / page.clock.* / page.keyboard.*
    if (n.type === "MemberExpression" && !n.computed && n.object && n.object.type === "MemberExpression") {
      const mid = name(n.object.property);
      if (mid && BLOCKING_OBJECTS.has(mid) && PAGE_RECEIVERS.test(name(n.object.object) || "")) {
        add(n.loc.start.line, `page.${mid}.${name(n.property)}`, "input/clock/network device — no browser");
      }
    }
    if (n.type !== "CallExpression") return;
    const c = n.callee;

    // expect(locator)… — the matcher, not the value. `toBeVisible` and friends
    // only exist on a locator, so their presence IS the tell.
    if (c.type === "MemberExpression" && !c.computed) {
      const m = name(c.property);
      if (m && /^(toBeVisible|toBeHidden|toHaveText|toHaveValue|toHaveAttribute|toHaveClass|toHaveCount|toBeEnabled|toBeDisabled|toBeChecked|toBeFocused|toHaveScreenshot|toHaveTitle|toHaveURL|toBeAttached|toBeEditable|toBeInViewport|toHaveCSS)$/.test(m)) {
        add(n.loc.start.line, `expect(...).${m}()`, "a locator matcher — needs a DOM");
      }
      if (m === "evaluate") evaluates++;
      const recv = name(c.object);
      if (m && recv && PAGE_RECEIVERS.test(recv) && !SERVED.has(m)) {
        add(n.loc.start.line, `${recv}.${m}()`,
            BLOCKING_METHODS.has(m) ? "no browser equivalent" : "not implemented by the adapter");
      }
      // Anything chained off a locator() lands here as `.click()` etc. on an
      // unknown receiver; the locator() call itself is already reported.
    }

    // What the evaluate BODY itself reaches for. Scanned as a subtree rather
    // than over the whole file, so a spec that merely mentions rAF or the DOM
    // in prose is not penalised.
    if (c.type === "MemberExpression" && !c.computed &&
        ["evaluate", "waitForFunction"].includes(name(c.property)) &&
        PAGE_RECEIVERS.test(name(c.object) || "")) {
      each(n.arguments[0], (k) => {
        if (k.type === "CallExpression" && name(k.callee) === "requestAnimationFrame") {
          add(k.loc.start.line, "requestAnimationFrame (in an evaluate body)",
              "game-vm pumps rAF but has no renderer — the frame callback throws in render()");
        }
        if (k.type !== "CallExpression" || k.callee.type !== "MemberExpression" || k.callee.computed) return;
        const m = name(k.callee.property);
        if (!m) return;
        // DOM READS AND DOM DRIVING FROM INSIDE THE PAGE — the blocker class
        // the adapter's first cohort run found, and the one no page-level API
        // scan can see. game-vm's DOM is INERT: querySelectorAll returns [],
        // every rect is 0x0, getComputedStyle returns "", and a synthesised
        // click reaches a real handler that then walks a tree which is not
        // there (measured: tests/specs/steering.spec.js, 9 of 13 tests die in
        // js/ui/select-screen.js mountToolbar off an in-page `.click()`).
        if (DOM_IN_PAGE.has(m)) {
          add(k.loc.start.line, `${m}() (in an evaluate body)`,
              "drives or measures the DOM from inside the page — game-vm's DOM is inert");
        }
      });
    }
  });

  // A real viewport is a browser fact: the adapter RECORDS the size and the
  // canvas stays 1280x720, so a spec that measures layout from it is lying.
  if (/\.setViewportSize\(/.test(src)) {
    const line = src.slice(0, src.indexOf(".setViewportSize(")).split("\n").length;
    add(line, "page.setViewportSize()", "recorded only — game-vm's canvas is a fixed 1280x720 stub");
  }
  return { file, blockers, evaluates };
}

export function auditAll(dir = SPECS) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".spec.js"))
    .sort()
    .map((f) => {
      const r = auditSource(fs.readFileSync(path.join(dir, f), "utf8"), `tests/specs/${f}`);
      const hard = r.blockers.filter((b) => b.kind !== "import");
      return { ...r, portable: r.blockers.length === 0, portableAfterImportFix: hard.length === 0 };
    });
}

function main() {
  const argv = process.argv.slice(2);
  const rows = auditAll();
  const portable = rows.filter((r) => r.portable);
  const nearly = rows.filter((r) => !r.portable && r.portableAfterImportFix);
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ total: rows.length, portable: portable.length,
      portableAfterImportFix: portable.length + nearly.length, rows }, null, 2));
    return;
  }
  if (argv.includes("--portable")) { for (const r of portable) console.log(r.file); return; }
  const show = argv.includes("--blocked") ? rows.filter((r) => !r.portable) : rows;
  const w = Math.max(...show.map((r) => r.file.length), 10);
  console.log(`${"spec".padEnd(w)}  vm   blocking calls`);
  console.log("-".repeat(w + 6 + 40));
  for (const r of show) {
    const what = r.portable ? "" :
      [...new Set(r.blockers.map((b) => b.what))].slice(0, 4).join(", ") +
      (new Set(r.blockers.map((b) => b.what)).size > 4 ? ` +${new Set(r.blockers.map((b) => b.what)).size - 4} more` : "");
    console.log(`${r.file.padEnd(w)}  ${r.portable ? "yes " : "NO  "} ${what}`);
  }
  console.log();
  console.log(`vm-portable: ${portable.length}/${rows.length} specs use only APIs tests/helpers/vm-page.js serves; ` +
              `${nearly.length} more would after a one-line import change (${portable.length + nearly.length} total), ` +
              `${rows.length - portable.length - nearly.length} need a browser. Portable is ELIGIBILITY, not a ` +
              `recommendation — an adapted spec is blind to the renderer.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
