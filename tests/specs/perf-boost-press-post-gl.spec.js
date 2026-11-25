// @ts-check
// BOOST with the POST CHAIN ON: press 2 re-mints nothing, post passes included (#6673, Bryce's "A + small post check").
//
// perf-boost-press-pipelines-gl.spec.js runs the BOOST census on the game's software-GL race path (tier 4: no
// bloom, SSAO, god rays or lamp volumetrics) to fit llvmpipe's budget, so a per-press re-mint INSIDE the post
// chain would be invisible there. This leg keeps the post chain of MEDIUM on: renderScale 0.5 and the governor's
// tier held from before go() (three's pipeline key never holds a target's size), two spaced presses, short
// windows. Verdict: boostVerdict — press 1 builds no lit-mesh pipeline, press 2 builds NO pipeline at all outside
// the fx particle streams (post quads included), and the fx streams add nothing over the matched no-BOOST window.
// Its own file: a second TLX boot in one Chromium process stalls (tools/perf/boost-press-census.mjs).
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { measureBoostPresses, boostVerdict, isFxStream, isLitMesh } from "../../tools/perf/boost-press-census.mjs";

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

// 10 warm + 2 × (25 control + 15 deploy + 10 spacing) = 110 live ticks; ~2.7 s a tick at MEDIUM / 0.5 on llvmpipe.
const PRESSES = 2, DEPLOY = 15, SPACING = 10;

test("TLX WebGL2, post chain on: BOOST press 2 re-mints no pipeline, post passes included", async ({ page }, testInfo) => {
  test.setTimeout(600000);
  const { hook, presses, render, warmMs } = await measureBoostPresses(page, { forceGL: true, bootMs: BOOT_MS * 2, tag: "gl-post",
    renderScale: 0.5, presses: PRESSES, deployFrames: DEPLOY, spacing: SPACING,
    gas: (on) => (on ? page.keyboard.down("ArrowUp") : page.keyboard.up("ArrowUp")) });
  expect(hook, "three's backend must be reachable to count pipelines").toMatch(/^ok /);
  testInfo.annotations.push({ type: "backend", description: hook });
  testInfo.annotations.push({ type: "render", description: JSON.stringify(render) });
  expect(render.before, "scale and tier must hold from the warm-up window to the last press").toEqual(render.after);
  expect(render.before.lookPostShed, "the post chain must be ON for this leg to mean anything").toBe(false);
  expect(render.before.tierHold, "govHold(true) must take").toBe(true);
  testInfo.annotations.push({ type: "timings", description: `warm-up ${warmMs} ms; presses ${presses.map((p) => p.ms).join(",")} ms` });
  const post = presses[1] ? presses[1].built.filter((b) => !isFxStream(b) && !isLitMesh(b)) : [];
  testInfo.annotations.push({ type: "press 2", description: `${presses[1] ? presses[1].pipelines : "-"} pipelines, ${post.length} outside lit meshes and fx streams (post)` });
  for (const p of presses) expect(p.deployed, `press ${p.press} never deployed ERS: the count would pass vacuously`).toBe(true);
  const v = boostVerdict(presses);
  expect(v.fail, v.fail.join("; ")).toEqual([]);
});
