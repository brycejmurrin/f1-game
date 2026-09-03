// One screenshot of the GARAGE 3D scene — the setup-preview turntable, its
// @doc One screenshot of the GARAGE 3D scene (turntable car, crest lightbox, boards) — the only way to look at garage-scene.js.
// @skill garage-parts-livery / car-viewer
// lightbox crest, boards and props — not the DOM panel in front of it.
//
// Why this exists: nothing could photograph the garage. layout-audit --screen=
// captures menus with the CANVAS HIDDEN (that is the point of it), and
// capture/shot.mjs frames a car on a TRACK via __apex camera hooks, which the
// garage has none of. So a change to js/garage/scene.js or to the crest
// lightbox could only be reasoned about, never looked at — and reasoning about
// what a scene looks like is how a rendering defect survives review.
//
//   node tools/capture/garage-shot.mjs [out.png] [teamIndex]
//
// Needs a static server on $PORT (default 3456). Screenshots the canvas BOX
// rather than the locator: a continuously animating WebGL canvas never passes
// Playwright's stability check (capture/shot.mjs has the same idiom, and
// survey-track.mjs before it). The DOM panel is faded to opacity 0 instead of
// hidden — `hidden` on #carsetup would end the preview and stop the render.
import { chromium } from "playwright";
import fs from "node:fs";

const PORT = process.env.PORT || 3456;
const out = process.argv[2] || "scratch/captures/garage/garage.png";
const team = process.argv[3] || null;
// The bundled full Chromium, not the headless shell: the shell has no
// navigator.gpu and this box does not always carry a matching shell build.
const EXE = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"]
  .find((p) => fs.existsSync(p));

const b = await chromium.launch(EXE ? { executablePath: EXE } : {});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on("pageerror", (e) => console.error("[pageerror]", String(e).slice(0, 300)));
// Boot + the first Tracks.build are CPU-bound under SwiftShader and routinely
// outrun Playwright's 30 s default on a loaded box.
p.setDefaultTimeout(120000);
if (team != null) {
  await p.addInitScript((t) => localStorage.setItem("apex26.team", JSON.stringify(+t)), team);
}
await p.goto(`http://127.0.0.1:${PORT}/`);
await p.waitForFunction(() => window.__apex && window.__apex.race, null,
  { polling: 200, timeout: 120000 });
await p.locator("#mb-race").click();
await p.locator("#select").waitFor({ state: "visible" });
await p.locator("#sel-go").click();
await p.locator("#carsetup").waitFor({ state: "visible" });
await p.waitForTimeout(6000);        // turntable build + light settle
await p.evaluate(() => { const c = document.getElementById("carsetup"); if (c) c.style.opacity = "0"; });
await p.waitForTimeout(1200);
fs.mkdirSync(out.replace(/\/[^/]+$/, ""), { recursive: true });
await p.screenshot({ path: out, clip: await p.locator("#game").boundingBox() });
console.log("wrote " + out);
await b.close();
