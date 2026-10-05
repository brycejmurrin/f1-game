#!/usr/bin/env node
// @doc Every menu and popup, then the Display survey, as JPEGs plus an index.html in artifacts/show-menus.
// show-menus.mjs — every menu and popup, then the Display survey, into one page.
// @skill playwright-probe
//
//   node tools/shot/show-menus.mjs
//   node tools/shot/show-menus.mjs --only=title,settings,hud
//
// The car from each side is garage-angles.mjs (`--views=hero,front,side,rear,top`);
// show.mjs, which did a three-menu subset of this plus those angles, was
// folded away 2026-10-05.
//
// One boot. Menus are opened the way a player opens them, then closed.
// Display's own panels (lighting, camera, flyby) are shot over a race,
// because that is where they actually open.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";
import { resolveRepoDefault } from "../lib/output-paths.mjs";
import { chromiumArgsForBackend, installProbeInit, gotoGame } from "./probe-page.mjs";
import { getScreen, OVERLAY_IDS } from "../ui/menu-screens.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const outDir = resolveRepoDefault(ROOT, "artifacts", "show-menus");
mkdirSync(outDir, { recursive: true });   // a fresh checkout has no artifacts/show-menus

const MENUS = [
  ["title", "Title"],
  ["career", "Career"],
  ["careerguide", "Career guide"],
  ["select", "Circuits"],
  ["trackdetail", "Circuit detail"],
  ["racesettings", "Race setup"],
  ["duelpicker", "Duel picker"],
  ["season-setup", "Season setup"],
  ["garage", "Garage"],
  ["garageteam", "Garage — team"],
  ["garagelivery", "Garage — livery"],
  ["garagewheels", "Garage — wheels"],
  ["teampicker", "Team picker"],
  ["customize", "Livery editor"],
  ["datahub", "Data hub"],
  ["datatelemetry", "Data — telemetry"],
  ["dataschedule", "Data — schedule"],
  ["trackdesigner", "Track designer"],
  ["photostudio", "Photo studio"],
  ["howtoplay", "How to play"],
  ["vsfriend", "Race a friend"],
  ["loading", "Pre-race loading"],
  ["settings", "Settings"],
  ["settingscontrols", "Controls"],
  ["settingsdriving", "Driving"],
  ["settingsdisplay", "Display"],
  ["advanced", "Steering and assists"],
  ["audioset", "Music and sound"],
];

const argv = process.argv.slice(2);
const flag = (n) => {
  const hit = argv.find((a) => a.startsWith(n + "="));
  return hit ? hit.slice(n.length + 1) : "";
};
const only = new Set(flag("--only").split(",").filter(Boolean));
const shots = [];

async function shotPage(page) {
  const session = await page.context().newCDPSession(page);
  try {
    const { data } = await session.send("Page.captureScreenshot", { format: "jpeg", quality: 68 });
    return Buffer.from(data, "base64");
  } finally {
    await session.detach().catch(() => {});
  }
}

async function save(page, id, title) {
  const jpg = await shotPage(page);
  const file = join(outDir, id + ".jpg");
  writeFileSync(file, jpg);
  shots.push({ id, title, file });
  console.log("shot", id, jpg.length);
}

async function resetToTitle(page, base) {
  await page.evaluate((ids) => {
    const duel = document.getElementById("duel-picker");
    if (duel && duel.open && duel.close) duel.close();
    for (const el of document.querySelectorAll(".screen")) {
      if (el.id !== "overlay") el.hidden = true;
    }
    for (const id of ["photo-studio", "lighting", "camtune", "flyby", "photo-controls", "loading"]) {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    }
    const ov = document.getElementById("overlay");
    if (ov) {
      ov.hidden = false;
      ov.style.removeProperty("display");
    }
    document.body.classList.remove("in-race", "photo-mode", "lt-open");
  }, OVERLAY_IDS);
  await page.waitForTimeout(200);
  const ok = await page.evaluate(() => {
    const b = document.getElementById("mb-race");
    if (!b) return false;
    const r = b.getBoundingClientRect();
    return r.width > 8 && r.height > 8;
  });
  if (!ok) {
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__apex && window.__apex.race, null, { timeout: 90000 });
    await page.waitForTimeout(400);
  }
}

// One page beside the JPEGs, relative links, rewritten after each batch so a
// run that dies in the race half still leaves the menu half viewable. It used
// to hand the JPEGs to a gallery script outside the repo that exists on one
// host, and silently did nothing everywhere else.
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function publish() {
  if (!shots.length) return;
  const figs = shots.map((s) => `<figure><img src="${esc(s.id)}.jpg" alt="${esc(s.title)}" loading="lazy">` +
    `<figcaption>${esc(s.title)}</figcaption></figure>`).join("\n");
  writeFileSync(join(outDir, "index.html"), `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Apex 26 — menus</title>
<style>body{margin:0;background:#0c0c0e;color:#ece8e1;font:15px/1.4 sans-serif}img{display:block;width:100%;height:auto}figure{margin:0 0 14px}figcaption{padding:6px 16px}</style>
</head><body>
${figs}
</body></html>
`);
  console.log("page", join(outDir, "index.html"), shots.length);
}

const srv = await startStaticServer(ROOT);
let browser;
try {
  browser = await launchChromium({ headless: true, args: chromiumArgsForBackend("webgl2") });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 852, height: 393 });
  page.setDefaultTimeout(12000);
  await installProbeInit(page, { backend: "webgl2" });
  await gotoGame(page, srv.url);

  for (const [id, title] of MENUS) {
    if (only.size && !only.has(id)) continue;
    const screen = getScreen(id);
    if (!screen) { console.error("missing", id); continue; }
    try {
      if (id !== "title") await resetToTitle(page, srv.url);
      await screen.open(page);
      await page.waitForTimeout(300);
      await save(page, id, title);
    } catch (err) {
      console.error("fail", id, err.message);
    }
  }

  if (!only.size || only.has("appearance")) {
    try {
      await resetToTitle(page, srv.url);
      await page.click("#mb-settings");
      await page.waitForSelector("#pmsettings:not([hidden])", { timeout: 15000 });
      await page.evaluate(() => document.getElementById("pm-open-appearance")?.click());
      await page.waitForFunction(() => !document.getElementById("pm-panel-appearance").hidden, null, { timeout: 15000 });
      await save(page, "appearance", "Appearance");
    } catch (err) {
      console.error("fail appearance", err.message);
    }
  }

  publish();

  if (!only.size || only.has("hud")) {
    try {
    await page.evaluate(async () => { await window.__apex.race("monza"); });
    await page.waitForFunction(() => window.__apex.info().track === "monza", null, { timeout: 90000 });
    await page.evaluate(() => { window.__apex.go(); window.__apex.jump(0.2, 40); window.__apex.snapCam(); });
    await page.waitForTimeout(600);
    await save(page, "hud", "In-race HUD");

    await page.evaluate(() => { document.getElementById("pausemenu").hidden = false; });
    await page.waitForTimeout(250);
    await save(page, "pause", "Pause");

    await page.evaluate(() => document.getElementById("pm-settings")?.click());
    await page.waitForFunction(() => !document.getElementById("pmsettings").hidden, null, { timeout: 15000 });
    await page.evaluate(() => document.getElementById("pm-open-display")?.click());
    await page.waitForFunction(() => !document.getElementById("pm-panel-display").hidden, null, { timeout: 15000 });
    await save(page, "display-race", "Display during a race");

    await page.evaluate(() => {
      if (!document.getElementById("pm-visual-tuners")?.open) {
        document.querySelector("#pm-visual-tuners > summary")?.click();
      }
    });
    await page.waitForTimeout(200);

    await page.evaluate(() => document.getElementById("pm-lighting")?.click());
    await page.waitForFunction(() => !document.getElementById("lighting").hidden, null, { timeout: 15000 });
    await page.waitForTimeout(400);
    await save(page, "lighting", "Lighting tuner");
    await page.evaluate(() => document.getElementById("lt-close")?.click());
    await page.waitForTimeout(300);

    await page.evaluate(() => { document.getElementById("pausemenu").hidden = false; });
    await page.evaluate(() => document.getElementById("pm-settings")?.click());
    await page.waitForFunction(() => !document.getElementById("pmsettings").hidden, null, { timeout: 15000 });
    await page.evaluate(() => {
      if (!document.getElementById("pm-visual-tuners")?.open) {
        document.querySelector("#pm-visual-tuners > summary")?.click();
      }
    });
    await page.evaluate(() => document.getElementById("pm-camtune")?.click());
    await page.waitForFunction(() => !document.getElementById("camtune").hidden, null, { timeout: 15000 });
    await page.waitForTimeout(400);
    await save(page, "cameratuner", "Camera tuner");
    await page.evaluate(() => document.getElementById("ct-close")?.click());
    await page.waitForTimeout(300);

    await page.evaluate(() => { document.getElementById("pausemenu").hidden = false; });
    await page.evaluate(() => document.getElementById("pm-settings")?.click());
    await page.waitForFunction(() => !document.getElementById("pmsettings").hidden, null, { timeout: 15000 });
    await page.evaluate(() => {
      if (!document.getElementById("pm-visual-tuners")?.open) {
        document.querySelector("#pm-visual-tuners > summary")?.click();
      }
    });
    await page.evaluate(() => document.getElementById("pm-flyby")?.click());
    await page.waitForFunction(() => !document.getElementById("flyby").hidden, null, { timeout: 15000 });
    await page.waitForTimeout(400);
    await save(page, "flyby", "Flyby editor");
  } catch (err) {
    console.error("fail display-race", err.message);
  }
  }

  publish();
} finally {
  if (browser) await browser.close().catch(() => {});
  await shutdown(srv).catch(() => {});
}
console.log("done");
