// @ts-check
// HUD REAR-VIEW MIRROR, live on the two WebGL2 backends this box can run
// (GLX, and TLX on three's WebGL2 path). A unit test cannot say the mirror
// renders — each backend owns its own target and composite — so this boots a
// race and asks the backend itself: mirrorState() counts the passes it
// rendered and the composites it drew into the #hud-mirror rect. Then the
// MIRROR key turns it off and the composite stops being asked for.
// WGX (WebGPU) is not bootable here; its gate is gpu-census.yml.
//
// COST: one Red Bull Ring build per backend (the lightest season circuit), a
// handful of frames at the 0.5 render-scale floor with the car frozen.
import { test, expect, BOOT_MS, TRACK_MS, awaitTrackBuild } from "../helpers/fixtures.js";
import { awaitPresentedFrame } from "../helpers/presented-canvas.js";

const FRAME_MS = TRACK_MS;

// Mean colour of a 16x4 grid over the inner 80% of the mirror rect, read off
// the presented soft canvas; null where this backend presents straight to
// #game (no 2-D copy to read).
async function mirrorPatch(page, rect) {
  return page.evaluate((r) => {
    const soft = document.getElementById("game-soft");
    if (!soft || !(soft.width > 0) || !r) return null;
    const ctx = soft.getContext("2d");
    if (!ctx) return null;
    const x0 = Math.round((r[0] + r[2] * 0.1) * soft.width), y0 = Math.round((r[1] + r[3] * 0.1) * soft.height);
    const w = Math.max(16, Math.round(r[2] * 0.8 * soft.width)), h = Math.max(4, Math.round(r[3] * 0.8 * soft.height));
    const d = ctx.getImageData(x0, y0, w, h).data;
    const cells = [];
    for (let cy = 0; cy < 4; cy++) for (let cx = 0; cx < 16; cx++) {
      let s = 0, n = 0;
      for (let y = Math.floor(cy * h / 4); y < Math.floor((cy + 1) * h / 4); y++)
        for (let x = Math.floor(cx * w / 16); x < Math.floor((cx + 1) * w / 16); x++) {
          const i = (y * w + x) * 4; s += d[i] + d[i + 1] + d[i + 2]; n += 3;
        }
      cells.push(n ? s / n : 0);
    }
    return cells;
  }, rect);
}

async function mirrorRace(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.race("redbull", "day", "dry", { laps: 3 }));
  await awaitTrackBuild(page);
  await page.evaluate(() => {
    const a = window.__apex;
    if (typeof a.renderScale === "function") a.renderScale(0.5);
    a.go();
    a.freeze(true);   // a still scene: the on/off frames differ only by the mirror
    a.camera("cockpit");
  });
}

async function mirrorCase(page, { requirePixels = false } = {}) {
  // AUTO keeps a software renderer's second world pass off; ON is ON.
  const auto = await page.evaluate(() => window.__apex.mirror());
  expect(auto, "__apex.mirror() exists once the race is up").not.toBeNull();
  expect(auto.mode).toBe("auto");
  await page.evaluate(() => window.__apex.mirror("on"));
  await page.waitForFunction(() => {
    const m = window.__apex.mirror();
    return m.shown && m.backend && m.backend.renders >= 1 && m.backend.composites >= 1;
  }, null, { polling: 100, timeout: FRAME_MS });
  const on = await page.evaluate(() => ({
    m: window.__apex.mirror(),
    cls: document.body.classList.contains("hud-mirror-on"),
    frameHidden: document.getElementById("hud-mirror").hidden,
    stored: localStorage.getItem("apex26.hudMirror"),
  }));
  const diag = JSON.stringify(on);
  expect(on.cls, diag).toBe(true);
  expect(on.frameHidden, diag).toBe(false);
  expect(on.stored, diag).toBe('"on"');
  expect(on.m.backend.dead, diag).toBe(false);
  expect(on.m.backend.w, diag).toBeGreaterThanOrEqual(16);
  expect(on.m.backend.h, diag).toBeGreaterThanOrEqual(8);
  // Top-centre, under the timing band, a wide letterbox.
  const [x, y, w, h] = on.m.rect;
  expect(Math.abs(x + w / 2 - 0.5), diag).toBeLessThan(0.02);
  expect(y, diag).toBeGreaterThan(0);
  expect(y + h, diag).toBeLessThan(0.45);
  // Letterbox in PIXELS: the rect is canvas fractions, and on a 16:9 canvas
  // a 3.5:1 frame is only ~2:1 in fractions. The backend target is pixels.
  expect(w > 0 && h > 0, diag).toBe(true);
  expect(on.m.backend.w / on.m.backend.h, diag).toBeGreaterThan(2.5);
  // The backend composites where the frame is.
  expect(on.m.backend.rect, diag).toEqual(on.m.rect);

  // The radio card never covers the mirror. Where the top row has room
  // (1280 wide: it does) it goes UP, into the timing tower's row between the
  // tower and the cam button (js/ui/hud.js radioTopSlot); the first cut
  // stacked it under the mirror with a rule the compact/caution tops beat, so
  // on a phone the card covered the mirror, and beside the mirror it still
  // sat on the view. hud.js fits at 10 Hz and re-measures a same-key layout
  // every 3 s, so the slot is waited for, not assumed.
  await page.waitForFunction(() => document.body.classList.contains("hud-radio-top"), null, { polling: 100, timeout: FRAME_MS });
  const card = await page.evaluate(() => {
    document.getElementById("announce-who").textContent = "RUSSELL · RADIO";
    document.getElementById("announce-text").textContent = "Box this lap, box this lap.";
    const a = document.getElementById("announce");
    a.hidden = false;
    const r = (e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
    const out = { card: r(a), mirror: r(document.getElementById("hud-mirror")),
      tower: r(document.querySelector(".hud-top")), cam: r(document.getElementById("btn-cam")) };
    a.hidden = true;
    return out;
  });
  const cd = JSON.stringify(card);
  const [al, at, ar, ab] = card.card, [ml, mt, mr, mb] = card.mirror;
  expect(ar <= ml || al >= mr || ab <= mt || at >= mb, cd + " clear of the mirror").toBe(true);
  expect(al, cd + " right of the tower").toBeGreaterThanOrEqual(card.tower[2]);
  expect(ar, cd + " left of the cam button").toBeLessThanOrEqual(card.cam[0]);
  expect(Math.abs(at - card.tower[1]), cd + " in the tower's row").toBeLessThan(2);

  await awaitPresentedFrame(page, 12000);
  const withMirror = await mirrorPatch(page, on.m.rect);

  // A TAP collapses it to the chip (the phone toggle — no M key there), and a
  // tap on the chip brings it back; the stored setting is untouched.
  // Hit-tested, not page.click(): Playwright's "stable" check waits on
  // animation frames, and a SwiftShader GLX frame is seconds long here. What a
  // finger gets is the TOP element at the point, so that is what is asserted.
  const tapAt = async (sel) => {
    const pt = await page.evaluate((s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      return { x, y, top: top && top.id };
    }, sel);
    expect(pt.top, `${sel} is the element under its own centre`).toBe(sel.slice(1));
    await page.mouse.click(pt.x, pt.y);
  };
  await tapAt("#hud-mirror");
  await page.waitForFunction(() => { const m = window.__apex.mirror(); return m.collapsed && !m.shown; }, null, { polling: 100, timeout: FRAME_MS });
  expect(await page.isVisible("#hud-mirror-chip")).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("apex26.hudMirror"))).toBe('"on"');
  await tapAt("#hud-mirror-chip");
  await page.waitForFunction(() => { const m = window.__apex.mirror(); return !m.collapsed && m.shown; }, null, { polling: 100, timeout: FRAME_MS });
  expect(await page.isVisible("#hud-mirror-chip")).toBe(false);

  // The MIRROR key: what shows goes off, and the backend stops compositing.
  await page.keyboard.press("KeyM");
  await page.waitForFunction(() => {
    const m = window.__apex.mirror();
    return m.mode === "off" && !m.shown && m.backend && m.backend.rect === null;
  }, null, { polling: 100, timeout: FRAME_MS });
  const off = await page.evaluate(() => ({
    m: window.__apex.mirror(),
    cls: document.body.classList.contains("hud-mirror-on"),
    frameHidden: document.getElementById("hud-mirror").hidden,
  }));
  expect(off.cls, JSON.stringify(off)).toBe(false);
  expect(off.frameHidden, JSON.stringify(off)).toBe(true);
  const c0 = off.m.backend.composites;
  await awaitPresentedFrame(page, 12000);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const off2 = await page.evaluate(() => window.__apex.mirror());
  expect(off2.backend.composites, JSON.stringify(off2)).toBe(c0);

  // Pixel evidence where the presented frame is readable: the rect held the
  // rear view, and now holds the forward view's pixels behind it.
  const without = await mirrorPatch(page, on.m.rect);
  test.info().annotations.push({ type: "mirror-pixels", description: withMirror ? "read #game-soft" : "no 2-D copy on this path" });
  // GLX always soft-presents in this headless build, so there the pixels are
  // not optional: the counters alone once passed with the image off-canvas.
  if (requirePixels) expect(withMirror && without, "GLX presents through #game-soft").toBeTruthy();
  if (withMirror && without) {
    let diff = 0;
    for (let i = 0; i < withMirror.length; i++) diff += Math.abs(withMirror[i] - without[i]);
    expect(diff / withMirror.length, JSON.stringify({ withMirror, without })).toBeGreaterThan(2);
  }
}

// THE BROADCAST PiP (REAL RACE WATCH, js/race/broadcast.js): under body.bc-on the
// mirror stands down and its ONE target is re-aimed at another car on a TV shot,
// composited UNFLIPPED into #bc-pip. Same boot as the mirror case: the backend's
// own counters say the pass rendered and composited, where the frame is, straight.
// TLX only (see the GLX test).
async function pipCase(page) {
  const before = await page.evaluate(() => {
    document.body.classList.add("bc-on");
    return window.__apex.mirror(undefined, { car: 1, cam: "tcam", mode: "on" });
  });
  const r0 = before.backend ? before.backend.renders : 0, c0 = before.backend ? before.backend.composites : 0;
  await page.waitForFunction(({ r0, c0 }) => {
    const m = window.__apex.mirror();
    return m.pip.shown && m.backend && m.backend.flip === false && m.backend.renders > r0 && m.backend.composites > c0;
  }, { r0, c0 }, { polling: 100, timeout: FRAME_MS });
  const st = await page.evaluate(() => ({
    m: window.__apex.mirror(),
    mirrorHidden: document.getElementById("hud-mirror").hidden,
    pipHidden: document.getElementById("bc-pip").hidden,
  }));
  const diag = JSON.stringify(st);
  expect(st.m.shown, diag).toBe(false);            // no rear-view mirror on the TV picture
  expect(st.mirrorHidden, diag).toBe(true);
  expect(st.pipHidden, diag).toBe(false);
  expect(st.m.pip.cam, diag).toBe("tcam");
  expect(st.m.backend.dead, diag).toBe(false);
  expect(st.m.backend.rect, diag).toEqual(st.m.pip.rect);   // composited where #bc-pip is
  expect(st.m.backend.w / st.m.backend.h, diag).toBeGreaterThan(1.5);   // the 16:9 frame, in the backend's own target pixels
  // The WATCH ends: the subject goes, the frame hides, and the mirror path is FLIPPED again.
  await page.evaluate(() => { window.__apex.mirror("on", { car: null, mode: "auto" }); document.body.classList.remove("bc-on"); });
  await page.waitForFunction(() => { const m = window.__apex.mirror(); return m.shown && !m.pip.shown && m.backend && m.backend.flip === true; },
    null, { polling: 100, timeout: FRAME_MS });
  expect(await page.evaluate(() => document.getElementById("bc-pip").hidden)).toBe(true);
}

test.describe("HUD rear-view mirror", () => {
  test.describe.configure({ timeout: 300000 });

  test("GLX renders the mirror pass, composites it into #hud-mirror, and the key turns it off", async ({ page }) => {
    await mirrorRace(page);
    expect(await page.evaluate(() => sessionStorage.getItem("apex26.gfxBound"))).toBe("webgl2");
    // No PiP case here: on this box a GLX frame is seconds, and the mirror case
    // alone takes most of the budget; the GLX composite's flag is pinned by
    // gfx-backend-canary.test.mjs, the pass itself by mirror-pass.test.mjs.
    await mirrorCase(page, { requirePixels: true });
  });

  test.describe("TLX", () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        try {
          localStorage.setItem("apex26.gfxBackend", "three");
          localStorage.setItem("apex26.tlxForceGL", "1");
        } catch (_) {}
      });
    });
    test("TLX renders the mirror pass, composites it into #hud-mirror, and the key turns it off", async ({ page }) => {
      await mirrorRace(page);
      await mirrorCase(page);
      await pipCase(page);
    });
  });
});
