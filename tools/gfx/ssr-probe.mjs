#!/usr/bin/env node
/* ssr-probe.mjs — capture the WET-ROAD screen-space reflection, and see WHY it
 * @doc Captures the wet-road screen-space reflection and reports why it looks as it does — the SSR lighting probe.
 * @skill webgl-debug
 * looks the way it does.
 *
 *   node tools/gfx/ssr-probe.mjs --track=redbull --tod=dusk --frac=0.62,0.30
 *   node tools/gfx/ssr-probe.mjs --track=spa --frac=0.10 --debug=gates
 *   node tools/gfx/ssr-probe.mjs --track=vegas --tod=night --cam=chase --hi
 *
 * Flags
 *   --track=<id>        circuit (default redbull)
 *   --tod=<t>           dawn|day|dusk|night          (default dusk)
 *   --weather=wet|dry   (default wet)
 *   --frac=a,b,c        lap fractions to shoot       (default 0.30,0.62)
 *   --cam=<mode>        any __apex.camera() mode     (default cockpit)
 *   --label=<s>         filename suffix              (default shot)
 *   --hi                render at 2556x1180 (phone DPR2) instead of 960x440
 *   --debug=<mode>      off (default) | gates | hitmiss | hitcol | mix
 *
 * Debug modes paint the road pixels in the composite instead of shading them:
 *   gates    R = upDot gate, G = near gate, B = far fade. Their product IS
 *            roadMask, so cyan = "the up-facing test rejected this pixel" and
 *            white = "SSR fully enabled here".
 *   hitmiss  green = the ray march found a hit, blue = hit faded out at the
 *            frame edge, red = miss (fell back to the sky).
 *   hitcol   the raw colour the march is mirroring; magenta = miss. Tarmac
 *            showing up here means the ray grazed into the road itself.
 *   mix      HOW REFLECTIVE each road pixel ends up — the final substitution
 *            amount. black -> blue -> cyan -> green -> yellow -> red = 0 .. 0.8.
 *            The map to read when the question is "why is that bit matte".
 *
 * WHY THIS EXISTS: the wet mirror is the product of a mask, a ray march and a
 * substitution, and a beauty shot cannot tell you which of the three went wrong
 * — a matte road looks identical whether the mask rejected the pixel, the march
 * missed, or the march hit something dark. Each mode isolates one stage.
 *
 * TWO SANDBOX GOTCHAS BAKED IN, both of which silently produce wrong pictures:
 *  - SwiftShader renders this scene at WELL UNDER 1 fps, so any wall-clock sleep
 *    gets zero frames. Every wait here is on real rAF ticks.
 *  - ...which also means waiting on frames after a jump() lets the car free-run
 *    for tens of seconds of sim time and crash into a barrier. So freeze FIRST
 *    and pump the sim with step(), which advances update() regardless of the
 *    frozen flag and refreshes the render-interpolation anchors.
 * The debug modes run against a COPY of the working tree, so uncommitted shader
 * edits are captured and the real tree is never touched.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const flag = (n) => process.argv.includes(`--${n}`);

const TRACK = arg("track", "redbull");
const TOD = arg("tod", "dusk");
const WEATHER = arg("weather", "wet");
const FRACS = arg("frac", "0.30,0.62").split(",").map(Number).filter(Number.isFinite);
const CAM = arg("cam", "cockpit");
const LABEL = arg("label", "shot");
const DEBUG = arg("debug", "off");
// Pin road wetness (LT.wetness) so captures don't race the ramp. -1 = leave auto.
const WETNESS = Number(arg("wetness", WEATHER === "wet" ? "1" : "-1"));
const HI = flag("hi");
const OUT = join(ROOT, "scratch", "captures", "ssr");

// ── debug overlays ─────────────────────────────────────────────────────────
// Each is a string replacement into the composite's road-SSR block. The anchors
// are the two lines that bracket the interesting stages; if either stops
// matching, the shader was refactored and the patch fails loudly rather than
// silently capturing an unpatched frame (which is exactly the trap that made an
// earlier investigation chase the wrong cause for an hour).
const ANCHOR_MASK = "    float roadTerm = roadMask * uReflect;";
const ANCHOR_MIX = "      float mixAmt = clamp(strength * cover, 0.0, carDom ? 0.85 : 0.80);";
// The cover line has been rewritten twice; both older spellings are kept so a
// checkout from before either change still probes rather than throwing. The
// live one is first — stageRoot() takes the first that matches.
const ANCHOR_COVER = "      float cover  = carDom ? conf : 0.60;";
const ANCHOR_COVER_ALT = [
  "      float cover  = carDom ? conf : max(conf, 0.30);",
  "      float cover  = found ? hit : (carDom ? 0.0 : 0.30);",
];

const PATCHES = {
  gates: (s) => s.replace(ANCHOR_MASK, `    if (carPx < 0.3) {
      outColor = vec4(smoothstep(0.25, 0.55, upDot),
                      smoothstep(uSsrNear, uSsrNear * 2.8, P.z),
                      1.0 - smoothstep(-22.0, -78.0, P.z), 1.0);
      return;
    }
${ANCHOR_MASK}`),
  hitmiss: (s, anchor) => s.replace(anchor, `${anchor}
      if (!carDom && roadTerm > 0.001) {
        outColor = vec4(found ? mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 0.0), clamp(hit, 0.0, 1.0))
                              : vec3(1.0, 0.0, 0.0), 1.0);
        return;
      }`),
  hitcol: (s, anchor) => s.replace(anchor, `${anchor}
      if (!carDom && roadTerm > 0.001) {
        outColor = vec4(found ? hitCol : vec3(1.0, 0.0, 1.0), 1.0);
        return;
      }`),
  // HOW REFLECTIVE each road pixel actually ends up — the final substitution
  // amount, which is what "glossy here, matte there" really means. Everything
  // else (mask, hit, cover, strength) only matters through this number, so this
  // is the map to read when the question is "why is that bit matte".
  //   black -> blue -> cyan -> green -> yellow -> red = 0 .. 0.8
  mix: (s) => s.replace(ANCHOR_MIX, `${ANCHOR_MIX}
      if (!carDom) {
        float t = clamp(mixAmt / 0.8, 0.0, 1.0);
        vec3 ramp = t < 0.25 ? mix(vec3(0.0), vec3(0.0, 0.0, 1.0), t / 0.25)
                  : t < 0.50 ? mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), (t - 0.25) / 0.25)
                  : t < 0.75 ? mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 1.0, 0.0), (t - 0.50) / 0.25)
                             : mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), (t - 0.75) / 0.25);
        outColor = vec4(ramp, 1.0); return;
      }`),
};

function stageRoot() {
  if (DEBUG === "off") return { root: ROOT, cleanup: () => {} };
  if (!PATCHES[DEBUG]) throw new Error(`unknown --debug=${DEBUG} (off|gates|hitmiss|hitcol|mix)`);
  // Copy only what the page loads — a full-tree copy would drag node_modules,
  // .git and every captured artifact along with it.
  const dir = mkdtempSync(join(tmpdir(), "ssr-probe-"));
  for (const p of ["index.html", "version.json", "js", "css", "assets", "vendor"]) {
    try { cpSync(join(ROOT, p), join(dir, p), { recursive: true }); } catch {}
  }
  const file = join(dir, "js/render/glx/shaders/glsl-post.js");
  const src = readFileSync(file, "utf8");
  const anchor = [ANCHOR_COVER, ...ANCHOR_COVER_ALT].find((a) => src.includes(a)) || null;
  if (DEBUG === "gates" && !src.includes(ANCHOR_MASK)) throw new Error("gates anchor not found in post.js");
  if (DEBUG === "mix" && !src.includes(ANCHOR_MIX)) throw new Error("mix anchor not found in post.js");
  if (DEBUG !== "gates" && DEBUG !== "mix" && !anchor) throw new Error("cover anchor not found in post.js");
  const out = PATCHES[DEBUG](src, anchor);
  if (out === src) throw new Error(`--debug=${DEBUG} patched nothing`);
  writeFileSync(file, out);
  return { root: dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const installCounter = () => {
  window.__frames = 0;
  const tick = () => { window.__frames++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
};
async function waitFrames(page, n) {
  const from = await page.evaluate(() => window.__frames);
  await page.waitForFunction((t) => window.__frames >= t, from + n, { timeout: 900_000 });
}

mkdirSync(OUT, { recursive: true });
const stage = stageRoot();
const srv = await startStaticServer(stage.root);
try {
  const browser = await launchChromium({ args: [
    "--use-angle=swiftshader",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
  ] });
  const page = await browser.newPage({
    viewport: HI ? { width: 1278, height: 590 } : { width: 960, height: 440 },
    deviceScaleFactor: HI ? 2 : 1,
  });
  page.on("pageerror", (e) => console.log(`  ! pageerror: ${e.message}`));
  await page.goto(srv.url);
  await page.waitForFunction(() => window.__apex != null, null, { timeout: 60_000 });
  await page.evaluate(installCounter);
  await page.evaluate(({ t, d, w }) => window.__apex.race(t, d, w), { t: TRACK, d: TOD, w: WEATHER });
  await page.waitForFunction(() => window.__apex.info().track != null, null, { timeout: 120_000 });
  await page.evaluate(({ d, w, cam, wet }) => {
    const a = window.__apex;
    a.go(); a.camera(cam); a.hud(false);
    a.weather(w); a.setTimeOfDay(d);
    // frame.wetness RAMPS (cur += (target-cur)*dt*0.8) and we freeze almost
    // immediately, so an un-pinned capture shoots a barely-damp road and every
    // A/B of the wet mirror is meaningless. LT.wetness is the tuner's explicit
    // override for exactly this — pin it so captures are deterministic.
    if (wet >= 0) a.lightTune({ wetness: wet });
  }, { d: TOD, w: WEATHER, cam: CAM, wet: WETNESS });
  await waitFrames(page, 3);

  for (const f of FRACS) {
    const st = await page.evaluate((x) => {
      const a = window.__apex;
      a.freeze(true);          // before the jump: no free-running between frames
      a.jump(x, 55, 0);
      a.step(1 / 60, 4);       // refresh render anchors (runs even while frozen)
      a.jump(x, 55, 0);        // ...then pin it back exactly on the mark
      a.snapCam();
      const p = a.probe(), v = a.viewState();
      return { s: p.s, x: p.x, speed: p.speed, cam: v.eye.map((n) => +n.toFixed(1)),
               mode: v.camMode, state: v.state, dbg: v.dbgCamActive, frozen: v.frozen };
    }, f);
    await waitFrames(page, 3);
    const name = `${TRACK}-${TOD}-${WEATHER}-${CAM}-${Math.round(f * 1000)}-${DEBUG === "off" ? LABEL : DEBUG}.png`;
    await page.screenshot({ path: join(OUT, name), timeout: 900_000 });
    console.log(`frac ${f}  s=${st.s.toFixed(0)} x=${st.x.toFixed(2)} eye=[${st.cam}] `
      + `mode=${st.mode} state=${st.state} dbgCam=${st.dbg} frozen=${st.frozen}  -> scratch/captures/ssr/${name}`);
  }
  await browser.close();
} finally {
  stage.cleanup();
  shutdown();
}
