#!/usr/bin/env node
// CSS PLAY — host the working tree, open one screen, dump structured DOM,
// @doc One-screen CSS edit loop: host the tree, open a menu, dump structured DOM, hot-swap a stylesheet, screenshot.
// @skill css-play
// hot-swap a stylesheet from disk, screenshot. The edit-loop tool for css/.
//
//   node tools/ui/css-play.mjs --list
//   node tools/ui/css-play.mjs --screen settings
//   node tools/ui/css-play.mjs --screen garage --sel "#cs-tabs" --css css/carsetup.css
//   node tools/ui/css-play.mjs settings --inject ".sheet{max-height:80vh}" --json
//
// Playwright MCP extras (same CLI):
//   ./tools/mcp/playwright-mcp.sh play --screen settings
//   ./tools/mcp/playwright-mcp.sh dom  --screen settings --sel .sheet
//
// Hot-swap rewrites the matching <link href="css/….css?v=…"> to
// css/….css?play=<mtime>. The static server already sends Cache-Control:
// no-store, so the file on disk is what paints — no bump-cache mid-loop.
// Hide #game. Reach screens through their own buttons. Output under
// artifacts/css-play/ (or scratch/).
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  launchChromium,
  shutdown,
  sleep,
  startStaticServer,
} from "../lib/harness.mjs";
import {
  assertContainedPath,
  resolveRepoDefault,
} from "../lib/output-paths.mjs";

const ROOT = pathFromModule(import.meta.url);

function pathFromModule(metaUrl) {
  return fileURLToPath(new URL("../..", metaUrl)).replace(/\/$/, "");
}

/** Title-path plus the common menus. Ids are a subset of layout-audit SCREENS. */
export const SCREENS = {
  title: { name: "Title / main menu", root: "#overlay", clicks: [] },
  select: { name: "Circuit select", root: "#select", clicks: ["#mb-race"] },
  garage: { name: "Garage", root: "#carsetup", clicks: ["#mb-garage"] },
  settings: { name: "Settings", root: "#pmsettings", clicks: ["#mb-settings"] },
  career: { name: "Career hub", root: "#career", clicks: ["#mb-career"] },
  datahub: { name: "F1 data hub", root: "#datahub", clicks: ["#mb-data"] },
  howtoplay: { name: "How to play", root: "#howtoplay", clicks: ["#mb-settings", "#pm-tab-more", "#pm-howto"] },
  vsfriend: { name: "VS friend lobby", root: "#vsfriend", clicks: ["#mb-vs"] },
  pause: { name: "Pause menu", root: "#pausemenu", clicks: ["#pausebtn"], race: "monza" },
};

const ALIASES = {
  overlay: "title",
  menu: "title",
  main: "title",
  pmsettings: "settings",
  carsetup: "garage",
  help: "howtoplay",
  vs: "vsfriend",
  paused: "pause",
  pausemenu: "pause",
};

export function resolveScreen(id) {
  if (!id) return "title";
  const key = String(id).toLowerCase().replace(/^#/, "");
  const resolved = ALIASES[key] || (SCREENS[key] ? key : null);
  if (!resolved) {
    throw new Error(`unknown screen: ${id}. Use --list or --root + --click`);
  }
  return resolved;
}

export function listScreens() {
  return Object.entries(SCREENS).map(([id, s]) => ({
    id,
    name: s.name,
    root: s.root,
    clicks: [...s.clicks],
  }));
}

export function assertCssRel(rel) {
  if (typeof rel !== "string" || !rel.startsWith("css/") || !rel.endsWith(".css")) {
    throw new Error(`css path must be css/*.css, got ${rel}`);
  }
  if (rel.includes("..") || rel.includes("\\")) {
    throw new Error(`css path escapes css/: ${rel}`);
  }
  const abs = resolve(ROOT, rel);
  assertContainedPath(resolve(ROOT, "css"), abs, "css file");
  if (!existsSync(abs)) throw new Error(`css file missing: ${rel}`);
  return rel;
}

export function parseCssPlayArgs(argv) {
  const out = {
    mode: "play",
    screen: "title",
    sel: null,
    css: null,
    inject: null,
    viewport: { width: 852, height: 393 },
    out: null,
    json: false,
    shot: true,
    clicks: null,
    root: null,
    scale: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`missing value for ${a}`);
      return argv[++i];
    };
    if (a === "--help" || a === "-h" || a === "help") out.mode = "help";
    else if (a === "--list" || a === "list") out.mode = "list";
    else if (a === "--json") out.json = true;
    else if (a === "--no-shot") out.shot = false;
    else if (a === "--desktop") out.viewport = { width: 1280, height: 720 };
    else if (a === "--screen") out.screen = resolveScreen(next());
    else if (a === "--sel") out.sel = next();
    else if (a === "--css") out.css = assertCssRel(next());
    else if (a === "--inject") out.inject = next();
    else if (a === "--viewport") {
      const [w, h] = next().split("x").map(Number);
      if (!w || !h) throw new Error("viewport must be WxH");
      out.viewport = { width: w, height: h };
    } else if (a === "--out") out.out = next();
    else if (a === "--click") out.clicks = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--root") out.root = next();
    else if (a === "--scale") out.scale = Number(next());
    else if (a.startsWith("--")) throw new Error(`unknown flag: ${a}`);
    else out.screen = resolveScreen(a);
  }
  return out;
}

export function printHelp() {
  return `css-play.mjs — host localhost, open one screen, dump DOM, hot-swap CSS, screenshot

Usage:
  node tools/ui/css-play.mjs --list
  node tools/ui/css-play.mjs --screen settings
  node tools/ui/css-play.mjs garage --sel "#cs-tabs" --css css/carsetup.css
  node tools/ui/css-play.mjs settings --inject ".sheet{max-height:80vh}" --json

Flags:
  --screen ID       title|select|garage|settings|career|datahub|howtoplay|vsfriend|pause
  --sel CSS         extra querySelectorAll hits in the DOM dump
  --css css/FILE    hot-swap that stylesheet from disk (?play=<mtime>, no cache bump)
  --inject CSS      overlay <style id="apex-css-play"> after the screen opens
  --viewport WxH    default 852x393 (play-shape iPhone landscape)
  --desktop         1280x720
  --scale N         __apex.uiScale(N) after boot
  --click SEL,SEL   extra clicks after the catalog path (or instead, with --root)
  --root SEL        screen root when not using a catalog id
  --out DIR         under artifacts/ or scratch/ (default artifacts/css-play/<id>-<stamp>/)
  --json            print the result object
  --no-shot         DOM dump only
  --list            catalog
  --help

Same CLI via the Playwright wrapper:
  ./tools/mcp/playwright-mcp.sh play --screen settings
  ./tools/mcp/playwright-mcp.sh dom  --screen settings --sel .sheet

Output: artifacts/css-play/<screen>-<stamp>/{shot.png,dom.json,meta.json}
Hide #game. Do not bump-cache mid-loop — ship with bump-cache after the look lands.
`;
}

/**
 * Page-serialisable DOM probe. Passed to page.evaluate — no Node closes.
 * Boxes are CSS px (getBoundingClientRect / currentCSSZoom).
 */
export function collectDomInfo(opts) {
  const sel = (opts && opts.sel) || null;
  const rootSel = (opts && opts.root) || "#overlay";
  const STYLE_KEYS = [
    "display", "position", "overflow", "overflowX", "overflowY",
    "width", "height", "maxWidth", "maxHeight", "minWidth", "minHeight",
    "padding", "margin", "fontSize", "fontWeight", "lineHeight",
    "color", "backgroundColor", "zIndex", "opacity", "visibility",
    "zoom", "flex", "flexDirection", "gridTemplateColumns", "gap",
    "justifyContent", "alignItems", "boxSizing", "transform",
  ];
  const boxOf = (el) => {
    const r = el.getBoundingClientRect();
    const z = el.currentCSSZoom || 1;
    return {
      x: Math.round(r.x / z),
      y: Math.round(r.y / z),
      w: Math.round(r.width / z),
      h: Math.round(r.height / z),
      zoom: z,
      clientW: el.clientWidth,
      clientH: el.clientHeight,
      scrollW: el.scrollWidth,
      scrollH: el.scrollHeight,
    };
  };
  const computedOf = (el) => {
    const cs = getComputedStyle(el);
    const out = {};
    for (const k of STYLE_KEYS) out[k] = cs[k];
    return out;
  };
  const nodeOf = (el, kids) => {
    if (!el) return null;
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      className: String(el.className || "").slice(0, 120),
      role: el.getAttribute("role"),
      hidden: !!el.hidden,
      open: el.open ?? null,
      box: boxOf(el),
      computed: computedOf(el),
      text: (el.innerText || "").trim().slice(0, 200),
      childCount: el.children.length,
      kids: kids ? [...el.children].slice(0, 40).map((c) => ({
        tag: c.tagName.toLowerCase(),
        id: c.id || "",
        className: String(c.className || "").slice(0, 80),
        text: (c.innerText || "").trim().slice(0, 40),
        box: boxOf(c),
        hidden: !!c.hidden,
        open: c.open ?? null,
      })) : undefined,
    };
  };
  const rootEl = document.querySelector(rootSel);
  const hitEls = sel ? [...document.querySelectorAll(sel)].filter((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none") return false;
    const r = el.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1;
  }).slice(0, 20) : [];
  const bodyCs = getComputedStyle(document.body);
  const rootCs = getComputedStyle(document.documentElement);
  const topEl = window.UiLayers && window.UiLayers.top && window.UiLayers.top();
  return {
    ok: true,
    viewport: innerWidth + "x" + innerHeight,
    dpr: devicePixelRatio,
    bodyClass: document.body.className || "",
    tokens: {
      tap: bodyCs.getPropertyValue("--tap").trim(),
      chipH: bodyCs.getPropertyValue("--chip-h").trim(),
      uiScale: rootCs.getPropertyValue("--ui-scale").trim(),
      hudScale: rootCs.getPropertyValue("--hud-scale").trim(),
    },
    layer: topEl ? { id: topEl.id || "", tag: topEl.tagName.toLowerCase() } : null,
    root: nodeOf(rootEl, true),
    sel,
    hits: hitEls.map((el) => nodeOf(el, false)),
  };
}

export async function swapStylesheet(page, relPath) {
  const abs = resolve(ROOT, relPath);
  const mtime = statSync(abs).mtimeMs;
  await page.evaluate(async ({ rel, mtime }) => {
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
    const link = links.find((l) =>
      (l.getAttribute("href") || "").includes(rel) || l.href.includes(rel));
    if (!link) throw new Error("stylesheet not loaded: " + rel);
    await new Promise((res, rej) => {
      link.onload = () => res();
      link.onerror = () => rej(new Error("reload failed: " + rel));
      link.href = rel + "?play=" + mtime;
    });
  }, { rel: relPath, mtime });
}

export async function injectOverlay(page, css) {
  await page.evaluate((text) => {
    let el = document.getElementById("apex-css-play");
    if (!el) {
      el = document.createElement("style");
      el.id = "apex-css-play";
      document.head.appendChild(el);
    }
    el.textContent = text;
  }, css);
}

function resolveOut(requested, screen) {
  if (!requested) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return resolveRepoDefault(ROOT, "artifacts", "css-play", `${screen}-${stamp}`);
  }
  const abs = isAbsolute(requested) ? requested : resolve(ROOT, requested);
  try {
    return assertContainedPath(resolve(ROOT, "artifacts"), abs, "out");
  } catch {
    return assertContainedPath(resolve(ROOT, "scratch"), abs, "out");
  }
}

async function waitOpen(page, root) {
  await page.waitForSelector(root + ":not([hidden])", { timeout: 15000 });
  await page.evaluate(async (sel) => {
    await new Promise((r) => {
      const t = setInterval(() => {
        const el = document.querySelector(sel);
        if (!el) { clearInterval(t); r(); return; }
        const a = el.getAnimations ? el.getAnimations({ subtree: true }) : [];
        if (!a.some((x) => x.playState === "running") && getComputedStyle(el).opacity !== "0") {
          clearInterval(t); r();
        }
      }, 50);
    });
  }, root);
}

export async function runCssPlay(opts) {
  const screenId = opts.root ? (opts.screen || "custom") : opts.screen;
  const def = SCREENS[screenId] || { name: screenId, root: opts.root || "#overlay", clicks: [] };
  const root = opts.root || def.root;
  const clicks = opts.clicks || def.clicks;
  const outDir = resolveOut(opts.out, screenId);
  mkdirSync(outDir, { recursive: true });

  const srv = await startStaticServer(ROOT);
  let browser;
  try {
    browser = await launchChromium();
    const page = await browser.newPage({
      viewport: { width: opts.viewport.width, height: opts.viewport.height },
    });
    await page.goto(srv.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(() => window.__apex && window.__apex.race, null, {
      polling: 100, timeout: 30000,
    });
    await page.evaluate(() => {
      window.__apex.headless(true);
      const g = document.querySelector("#game");
      if (g) g.style.visibility = "hidden";
    });
    if (opts.scale != null && !Number.isNaN(opts.scale)) {
      await page.evaluate((n) => window.__apex.uiScale(n), opts.scale);
    }
    if (def.race) {
      await page.evaluate(async (id) => {
        await window.__apex.race(id);
        window.__apex.go();
        window.__apex.headless(true);
        const g = document.querySelector("#game");
        if (g) g.style.visibility = "hidden";
      }, def.race);
      await page.waitForFunction((id) => {
        const info = window.__apex.info();
        return info && (info.state === "race" || info.state === "count") && info.track === id;
      }, def.race, { polling: 100, timeout: 40000 });
      await page.waitForSelector("#pausebtn:not([hidden])", { timeout: 15000 });
    }
    for (const sel of clicks) await page.click(sel);
    await waitOpen(page, root);
    if (screenId === "datahub") await sleep(800);

    if (opts.css) await swapStylesheet(page, opts.css);
    if (opts.inject) await injectOverlay(page, opts.inject);
    await sleep(200);

    const dom = await page.evaluate(collectDomInfo, { sel: opts.sel, root });
    const domPath = resolve(outDir, "dom.json");
    writeFileSync(domPath, JSON.stringify(dom, null, 2));

    let shotPath = null;
    if (opts.shot !== false) {
      shotPath = resolve(outDir, "shot.png");
      await page.screenshot({ path: shotPath, fullPage: false });
    }

    const meta = {
      screen: screenId,
      name: def.name,
      root,
      url: srv.url,
      viewport: `${opts.viewport.width}x${opts.viewport.height}`,
      css: opts.css,
      inject: opts.inject ? true : false,
      sel: opts.sel,
      out: outDir,
      shot: shotPath,
      dom: domPath,
    };
    writeFileSync(resolve(outDir, "meta.json"), JSON.stringify(meta, null, 2));
    return { ok: true, ...meta, dump: dom };
  } finally {
    if (browser) await browser.close();
    await srv.close();
    await shutdown();
  }
}

function invokedAsCli() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(import.meta.url) === resolve(entry);
  } catch {
    return false;
  }
}

if (invokedAsCli()) {
  try {
    const opts = parseCssPlayArgs(process.argv.slice(2));
    if (opts.mode === "help") {
      process.stdout.write(printHelp());
      process.exit(0);
    }
    if (opts.mode === "list") {
      for (const row of listScreens()) {
        const pathClicks = row.clicks.length ? row.clicks.join(" → ") : "(boot)";
        process.stdout.write(`${row.id.padEnd(12)} ${row.root.padEnd(16)} ${pathClicks}  ${row.name}\n`);
      }
      process.exit(0);
    }
    const result = await runCssPlay(opts);
    if (opts.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    else {
      process.stdout.write(`screen  ${result.screen}  ${result.root}\n`);
      process.stdout.write(`url     ${result.url}\n`);
      process.stdout.write(`dom     ${result.dom}\n`);
      if (result.shot) process.stdout.write(`shot    ${result.shot}\n`);
      if (result.dump && result.dump.root) {
        const b = result.dump.root.box;
        process.stdout.write(`root    ${result.dump.root.tag}#${result.dump.root.id}  ${b.w}x${b.h} @ ${b.x},${b.y}\n`);
      }
    }
  } catch (err) {
    process.stderr.write((err && err.message) ? err.message + "\n" : String(err) + "\n");
    process.exit(1);
  }
}
