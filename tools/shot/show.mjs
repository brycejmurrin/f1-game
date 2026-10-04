#!/usr/bin/env node
// @doc One phone HTML page: menus then car angles, with embedded JPEGs for offline preview.
// show.mjs — one phone page of the game: menus, then the car from each side.
//
//   node tools/shot/show.mjs
//   node tools/shot/show.mjs --out artifacts/show
//
// Existing shot tools write loose PNGs into scratch/. This writes one HTML
// file with the pictures inside it, so it opens after a download with no
// server and no extra files. JPEGs sit beside it if you want those instead.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";
import { resolveRepoDefault, resolveContainedChild } from "../lib/output-paths.mjs";
import {
  chromiumArgsForBackend, installProbeInit, gotoGame, openGarage, settleGarage,
  screenshotPresentedCanvas,
} from "./probe-page.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("-") ? argv[i + 1] : d;
};
const outDir = flag("--out", null)
  ? resolveContainedChild(ROOT, flag("--out"), "--out")
  : resolveRepoDefault(ROOT, "artifacts", "show");
const team = flag("--team", "ferrari");

const UI = [
  { id: "title", title: "Title", note: "The front door, as the phone holds the game.", go: async (page) => {
    await page.waitForSelector("#overlay:not([hidden])", { timeout: 30000 });
  } },
  { id: "settings", title: "Settings", note: "Steering, audio, and the tuners, opened from the title.", go: async (page) => {
    await page.click("#mb-settings");
    await page.waitForSelector("#pmsettings:not([hidden])", { timeout: 15000 });
  } },
  { id: "circuits", title: "Circuits", note: "Pick a race. Shot before the garage, so the list is what you see.", go: async (page) => {
    await page.click("#pm-settings-close");
    await page.waitForSelector("#pmsettings", { state: "hidden", timeout: 10000 }).catch(() => {});
    await page.click("#mb-race");
    await page.waitForSelector("#select:not([hidden])", { timeout: 20000 });
  } },
];

const CAR = [
  { id: "garage", title: "Garage", note: "The bay with the panels on, so the UI and the car are in one frame.", view: "hero", page: true },
  { id: "car-front", title: "Front", note: "Nose and front wing. The panel is hidden so the body is the picture.", view: "front" },
  { id: "car-side", title: "Side", note: "The flank, which is where a livery either reads or doesn't.", view: "side" },
  { id: "car-rear", title: "Rear", note: "Rear wing, diffuser, and the rain light.", view: "rear" },
  { id: "car-top", title: "Top", note: "Plan view. Useful when a part sits under the bodywork from the side.", view: "top" },
];

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => {
    if (c === "&") return "&" + "amp;";
    if (c === "<") return "&" + "lt;";
    if (c === ">") return "&" + "gt;";
    return "&" + "quot;";
  });
}

async function shotCar(page, pngPath) {
  await page.evaluate(() => {
    const c = document.getElementById("carsetup");
    if (c) c.style.opacity = "0";
  });
  const shot = await screenshotPresentedCanvas(page, {
    path: pngPath, type: "jpeg", quality: 72, timeout: 40000,
  });
  return shot.buf;
}

async function shotPage(page) {
  const session = await page.context().newCDPSession(page);
  try {
    const { data } = await session.send("Page.captureScreenshot", { format: "jpeg", quality: 72 });
    return Buffer.from(data, "base64");
  } finally {
    await session.detach().catch(() => {});
  }
}

function writePage(shots) {
  const card = (s) => {
    if (!s.jpeg) {
      return `<figure class="miss"><figcaption><b>${esc(s.title)}</b><span>${esc(s.error || "no frame")}</span></figcaption></figure>`;
    }
    const uri = "data:image/jpeg;base64," + s.jpeg.toString("base64");
    return `<figure><img src="${uri}" alt="${esc(s.title)}"><figcaption><b>${esc(s.title)}</b><span>${esc(s.note)}</span></figcaption></figure>`;
  };
  const group = (name, rows) => `<section><h2>${name}</h2>${rows.map(card).join("\n")}</section>`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Apex 26 — show</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0c0c0e; color: #ece8e1; font: 15px/1.4 -apple-system, BlinkMacSystemFont, sans-serif; }
  header { padding: 20px 16px 8px; }
  h1 { font-size: 22px; font-weight: 650; margin: 0 0 4px; letter-spacing: -0.02em; }
  header p { margin: 0; color: #9a948a; }
  h2 { font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: #9a948a; margin: 22px 16px 8px; }
  figure { margin: 0 0 14px; }
  img { display: block; width: 100%; height: auto; background: #000; }
  figcaption { padding: 8px 16px 4px; }
  figcaption b { display: block; }
  figcaption span { color: #9a948a; }
  .miss { padding: 24px 16px; color: #c45c4a; }
</style>
</head>
<body>
<header>
  <h1>Apex 26</h1>
  <p>Menus and the car, one file. The pictures are inside the page.</p>
</header>
${group("UI", shots.filter((s) => s.group === "ui"))}
${group("Car", shots.filter((s) => s.group === "car"))}
</body>
</html>
`;
  writeFileSync(join(outDir, "show.html"), html);
}

mkdirSync(outDir, { recursive: true });
const shots = [];
const srv = await startStaticServer(ROOT);
let browser;
try {
  browser = await launchChromium({ headless: true, args: chromiumArgsForBackend("webgl2") });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 852, height: 393 });
  await installProbeInit(page, { backend: "webgl2", team: null });
  await gotoGame(page, srv.url);

  for (const row of UI) {
    const shot = { id: row.id, title: row.title, note: row.note, group: "ui" };
    try {
      await row.go(page);
      const jpg = await shotPage(page);
      shot.jpeg = jpg;
      writeFileSync(join(outDir, row.id + ".jpg"), jpg);
      console.log("ui", row.id, jpg.length);
    } catch (err) {
      shot.error = err.message;
      console.error("ui", row.id, err.message);
    }
    shots.push(shot);
  }

  await openGarage(page, { team });
  for (const row of CAR) {
    const shot = { id: row.id, title: row.title, note: row.note, group: "car" };
    try {
      await page.evaluate((view) => document.querySelector(`[data-cs-view="${view}"]`)?.click(), row.view);
      await settleGarage(page, { frames: row.page ? 50 : 30 });
      let jpg;
      if (row.page) jpg = await shotPage(page);
      else jpg = await shotCar(page, join(outDir, row.id + ".jpg"));
      shot.jpeg = jpg;
      writeFileSync(join(outDir, row.id + ".jpg"), jpg);
      console.log("car", row.id, jpg.length);
    } catch (err) {
      shot.error = err.message;
      console.error("car", row.id, err.message);
    }
    shots.push(shot);
  }
} finally {
  writePage(shots);
  if (browser) await browser.close().catch(() => {});
  await shutdown(srv).catch(() => {});
}

const ok = shots.filter((s) => s.jpeg).length;
console.log(`show.html  ${ok}/${shots.length}  ${join(outDir, "show.html")}`);
const gallery = "/workspace/scripts/show-shots.mjs";
const published = shots.filter((s) => s.jpeg);
if (published.length && existsSync(gallery)) {
  const args = [
    gallery,
    "--heading", "Menus and the car",
    "--note", "Scroll. The pictures are in the preview.",
  ];
  for (const s of published) args.push("--title", s.title, join(outDir, s.id + ".jpg"));
  const pub = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (pub.status) process.exit(pub.status);
}
if (!ok) process.exit(1);
