// @ts-check
// Every control of a menu layer is reachable with the ARROW KEYS and with a
// controller's D-PAD alone, and Escape / B leave the layer.
//
// The walk is a breadth-first search over focus states: from every control
// reached so far, press each of the four directions and record where focus
// lands, until nothing new appears. The truth to compare against is
// MenuNav.items(layer) — the walker's own idea of "a control here" — so a
// control the walker OFFERS but cannot REACH is exactly the defect class this
// pins. Four shipped that way (all measured 2026-09-08, all fixed):
//
//   - the contents of a CLOSED <details> kept their layout boxes, so step()
//     picked them as the nearest target and focus() silently refused: on the
//     DISPLAY page, from BACK, no arrow moved at all;
//   - a <select> owned all four arrows, so every ‹ value › row was an island
//     the keyboard could only leave with Tab — and a pad has no Tab;
//   - step()'s across-penalty let a full-width slider two rows down beat the
//     chevron cluster in the very next row, so the METRICS rows could not be
//     entered from the fold header above them;
//   - the ‹ › chevrons beside a select formed a focusable column that nothing
//     could enter (they are pointer-only now — the select answers the keys);
//   - and the pad's synthetic key was dispatched at `document`, so an
//     element's OWN onkeydown was never in its path: both tab rails (the
//     garage categories, the circuit filter chips) own their axis by design,
//     MenuNav steps aside for them, and their handlers never ran — the D-pad
//     sat on the garage's TEAM tab forever while a real ArrowDown walked all
//     fifteen. It targets the focused control now, as a real key does.
//
// BOTH WALKS RUN IN-PAGE on synthetic keydowns, which is what a pad sends
// anyway (js/input/input.js padDispatchKey) and what MenuNav's own window
// capture listener reads; the per-press page round-trip cost ~4 minutes a
// layer on this box, and the assertions are about MenuNav's routing, not the
// UA's. The keys a real player presses are covered by menu-keyboard.spec.js;
// Enter on a fold header below is a REAL key, because opening a <details> is
// a UA default action a synthetic event does not get.
import { test, expect, BOOT_MS, TRACK_MS } from "../helpers/fixtures.js";

const DESKTOP = { width: 1280, height: 800 };

// A standard-mapping pad the page's navigator reports as the only one.
const PAD_SETUP = `
  window.__pad = { connected: true, mapping: "standard", id: "Xbox Wireless Controller", axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })) };
  navigator.getGamepads = () => [window.__pad, null, null, null];
  window.__press = (i, v = 1) => { window.__pad.buttons[i] = { pressed: v >= 0.5, value: v, touched: v > 0 }; };
`;

// The walker. Keys derive from CONTENT (id, else tag/class/text plus the
// occurrence index in the layer), never from the node: a tab rail with
// automatic activation rebuilds the panel under it, and the select screen
// rebuilds its tiles, so a node-stamped key would go stale mid-walk.
const WALKER = `
  window.__aud = {
    layerId: null,
    KEYS: ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"],
    DPAD: [12, 13, 14, 15],
    sig(el) {
      if (el.id) return "#" + el.id;
      const t = (el.getAttribute("aria-label") || el.textContent || el.value || el.placeholder || "").replace(/\\s+/g, " ").trim().slice(0, 40);
      return el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : "") + "'" + t + "'";
    },
    key(el) {
      const layer = document.getElementById(this.layerId);
      if (!el || el === document.body || !layer || !layer.contains(el)) return null;
      const s = this.sig(el);
      let n = 0;
      for (const o of layer.querySelectorAll(el.tagName)) { if (o === el) break; if (this.sig(o) === s) n++; }
      return s + (n ? "@" + n : "");
    },
    active() { return this.key(document.activeElement); },
    items() { return MenuNav.items(document.getElementById(this.layerId)).map((el) => this.key(el)); },
    find(k) {
      const layer = document.getElementById(this.layerId);
      for (const el of layer.querySelectorAll(MenuNav.FOCUSABLE)) if (this.key(el) === k) return el;
      return null;
    },
    focus(k) { const el = this.find(k); if (el) el.focus(); return !!el && document.activeElement === el; },
    top() { const t = UiLayers.top(); return t ? t.id : null; },
    padPress(btn) { window.__press(btn); Input.poll(); window.__press(btn, 0); Input.poll(); },
    // A value control (a <select>, a slider) OWNS its own axis: those keys
    // change the value, so a walk must not press them — on the pad they are
    // stepped by js/input/input.js rather than sent on at all.
    skips(el, i) {
      if (!el) return false;
      const owns = MenuNav.ownsArrows(el, this.KEYS[i]);
      const valueCtl = el.tagName === "SELECT" || (el.tagName === "INPUT" && /^(range|number)$/i.test(el.type));
      return owns && !(valueCtl && i < 2);   // the cross axis of a value control still moves
    },
    // restore: in-page JS run after every press. The circuit picker's filter
    // tabs ACTIVATE on an arrow and re-filter the strip, so ALL is put back.
    walk(layerId, pad, restore) {
      this.layerId = layerId;
      const all = this.items();
      let seed = this.active();
      if (all.indexOf(seed) < 0) { this.press(0, false); seed = this.active(); }
      const seen = [seed], q = [seed];
      while (q.length) {
        const k = q.shift();
        for (let i = 0; i < 4; i++) {
          if (!this.focus(k)) continue;
          if (this.skips(this.find(k), i)) continue;
          this.press(i, pad);
          const to = this.active();
          if (restore) (0, eval)(restore);
          if (to && to !== k && all.indexOf(to) >= 0 && seen.indexOf(to) < 0) { seen.push(to); q.push(to); }
        }
      }
      return { all, seed, missed: all.filter((k) => seen.indexOf(k) < 0) };
    },
    press(i, pad) {
      if (pad) this.padPress(this.DPAD[i]);
      // MenuNav listens on WINDOW in the capture phase; an event dispatched at
      // document passes through window on the way down, exactly as the pad's
      // own synthetic keys do.
      else document.dispatchEvent(new KeyboardEvent("keydown", { key: this.KEYS[i], bubbles: true, cancelable: true }));
    },
  };
`;

async function boot(page) {
  await page.addInitScript(PAD_SETUP);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race && window.MenuNav && window.UiLayers, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(WALKER);
  await page.evaluate(() => window.dispatchEvent(new Event("gamepadconnected")));
}

const click = (page, sel) => page.evaluate((s) => document.querySelector(s).click(), sel);
const openFolds = (page) => page.evaluate(() => { for (const d of UiLayers.top().querySelectorAll("details")) d.open = true; });

async function walk(page, layerId, { restore = "" } = {}) {
  expect(await page.evaluate(() => window.__aud.top()), `#${layerId} is the top layer`).toBe(layerId);
  const kb = await page.evaluate(({ layerId, restore }) => window.__aud.walk(layerId, false, restore), { layerId, restore });
  expect(kb.all, `${layerId}: the first arrow press lands on a control of the layer`).toContain(kb.seed);
  expect(kb.missed, `${layerId}: every control is reachable with the arrow keys`).toEqual([]);
  const pad = await page.evaluate(({ layerId, restore }) => window.__aud.walk(layerId, true, restore), { layerId, restore });
  expect(pad.missed, `${layerId}: every control is reachable with the D-pad`).toEqual([]);
  return kb;
}

// Escape leaves the layer (closes it, or pops its page); reopened, so does B.
// `seed` first: the walk can end in a text field, where the Escape KEY is
// deliberately ignored (js/input/input.js `typing`) — the pad's B is not, it
// presses the layer's own `data-esc-close` control either way.
async function leaves(page, layerId, reopen, seed) {
  const where = () => page.evaluate(() => window.__aud.top() + "/" + ((document.getElementById("dlg-settings") || {}).textContent || ""));
  if (seed) await page.evaluate((k) => window.__aud.focus(k), seed);
  const before = await where();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  expect(await where(), `${layerId}: Escape leaves`).not.toBe(before);
  await reopen();
  expect(await page.evaluate(() => window.__aud.top())).toBe(layerId);
  if (seed) await page.evaluate((k) => window.__aud.focus(k), seed);
  const b0 = await where();
  await page.evaluate(() => window.__aud.padPress(1));
  await page.waitForTimeout(300);
  expect(await where(), `${layerId}: the pad's B leaves`).not.toBe(b0);
}

const toTitle = async (page) => {
  for (let i = 0; i < 8; i++) {
    if ((await page.evaluate(() => window.__aud.top())) === "overlay") return;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }
};

test.describe("Menu traversal — keyboard and controller", () => {
  test.use({ viewport: DESKTOP });

  test("the title menu, and its lack of a door", async ({ page }) => {
    await boot(page);
    await walk(page, "overlay");
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.__aud.padPress(1));
    expect(await page.evaluate(() => window.__aud.top()), "the title has no Escape door").toBe("overlay");
  });

  test("the circuit picker: every flag, the filter tabs, the hero and the foot", async ({ page }) => {
    await boot(page);
    const open = async () => {
      await click(page, "#mb-race");
      await page.waitForFunction(() => !document.getElementById("select").hidden, null, { polling: 100, timeout: 10_000 });
      await page.waitForTimeout(400);
    };
    await open();
    const restore = `const on = document.querySelector('#sel-track-filter .sel-chip.active'); if (on && on.dataset.filter !== 'all') { const a = document.querySelector('#sel-track-filter [data-filter="all"]'); if (a) a.click(); }`;
    const { all, seed } = await walk(page, "select", { restore });
    expect(all.filter((k) => k.startsWith("button.track-row")).length, "the flag strip holds the catalogue").toBeGreaterThan(30);
    await leaves(page, "select", async () => { await toTitle(page); await open(); }, seed);
  });

  test("race settings", async ({ page }) => {
    await boot(page);
    const open = async () => {
      await click(page, "#mb-race");
      await page.waitForFunction(() => !document.getElementById("select").hidden, null, { polling: 100, timeout: 10_000 });
      await click(page, "#sel-go");
      await page.waitForFunction(() => !document.getElementById("race-settings").hidden, null, { polling: 100, timeout: 10_000 });
      await page.waitForTimeout(300);
    };
    await open();
    const { seed } = await walk(page, "race-settings");
    await leaves(page, "race-settings", async () => { await toTitle(page); await open(); }, seed);
  });

  for (const [name, door] of [["CONTROLS", "#pm-open-controls"], ["DISPLAY", "#pm-open-display"], ["STEERING", "#pm-advanced"], ["MUSIC", "#pm-audio"]]) {
    test(`settings › ${name}, every fold open`, async ({ page }) => {
      await boot(page);
      const open = async () => {
        await click(page, "#mb-settings");
        await page.waitForTimeout(250);
        await click(page, door);
        await page.waitForTimeout(250);
        await openFolds(page);
      };
      await open();
      const { all, seed } = await walk(page, "pmsettings");
      expect(all.length, `${name} shows its controls`).toBeGreaterThan(5);
      await leaves(page, "pmsettings", async () => { await toTitle(page); await open(); }, seed);
    });
  }

  test("a fold opens with Enter and with the pad's A; a select keeps its own axis and leaves on Down", async ({ page }) => {
    await boot(page);
    await click(page, "#mb-settings");
    await page.waitForTimeout(250);
    await click(page, "#pm-open-display");
    await page.waitForTimeout(250);
    await page.evaluate(() => { window.__aud.layerId = "pmsettings"; });
    const sum = await page.evaluate(() => {
      const s = MenuNav.items(UiLayers.top()).find((el) => el.tagName === "SUMMARY" && !el.parentElement.open);
      s.focus();
      return { id: s.id, focused: document.activeElement === s };
    });
    expect(sum.focused, "a closed fold offers its header as a control").toBe(true);
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => document.activeElement.parentElement.open), "Enter opens the fold").toBe(true);
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => document.activeElement.parentElement.open), "Enter closes it").toBe(false);
    await page.evaluate(() => window.__aud.padPress(0));
    expect(await page.evaluate(() => document.activeElement.parentElement.open), "the pad's A opens it").toBe(true);

    const sel = await page.evaluate(() => {
      const s = UiLayers.top().querySelector("details[open] select:not([disabled])");
      s.focus();
      return { id: s.id, n: s.options.length, i: s.selectedIndex };
    });
    expect(sel.n, "the fold holds a ‹ value › row").toBeGreaterThan(1);
    await page.evaluate(() => window.__aud.press(1, false));   // ArrowDown
    const down = await page.evaluate((id) => ({ active: document.activeElement.id, i: document.getElementById(id).selectedIndex }), sel.id);
    expect(down.active, "Down leaves the select for the next row").not.toBe(sel.id);
    expect(down.i, "…without changing its value").toBe(sel.i);
    await page.evaluate((id) => document.getElementById(id).focus(), sel.id);
    await page.evaluate(() => window.__aud.padPress(15));      // D-pad Right
    const right = await page.evaluate((id) => ({ active: document.activeElement.id, i: document.getElementById(id).selectedIndex }), sel.id);
    expect(right.active, "D-pad Right stays on the select").toBe(sel.id);
    expect(right.i, "…and steps its value (a synthetic arrow has no UA default)").toBe(Math.min(sel.n - 1, sel.i + 1));
  });

  test("the garage: the category rail reaches every tab, and the panel beside it", async ({ page }) => {
    await boot(page);
    // The garage renders the car in 3D every frame; on SwiftShader that costs
    // seconds a keypress and none of it is what this asserts.
    await page.evaluate(() => window.__apex.headless(true));
    await click(page, "#mb-race");
    await page.waitForFunction(() => !document.getElementById("select").hidden, null, { polling: 100, timeout: 10_000 });
    await click(page, "#sel-car");
    await page.waitForFunction(() => !document.getElementById("carsetup").hidden, null, { polling: 100, timeout: 30_000 });
    await page.waitForTimeout(600);
    // The rail activates on an arrow (automatic activation), so walking it
    // swaps the panel under it — assert the RAIL itself end to end.
    const chain = await page.evaluate(() => {
      window.__aud.layerId = "carsetup";
      const tabs = [...document.querySelectorAll('#cs-tabs [role="tab"]')].map((t) => t.id);
      document.getElementById(tabs[0]).focus();
      const seen = [];
      for (let i = 0; i < tabs.length + 2; i++) { window.__aud.press(1, true); seen.push(document.activeElement.id); }
      return { tabs, seen };
    });
    for (const id of chain.tabs) expect(chain.seen, `the D-pad reaches #${id}`).toContain(id);
    expect(chain.seen[chain.tabs.length - 1], "the rail wraps at its end").toBe(chain.tabs[0]);
  });

  test("in a race: the pause menu, and the DISPLAY page under it", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.__apex.race("bahrain"));
    await page.waitForFunction(() => { const i = window.__apex.info(); return i && i.track != null; }, null, { polling: 100, timeout: TRACK_MS });
    await page.evaluate(() => { window.__apex.park(0.1); window.__apex.headless(true); });
    await page.waitForTimeout(300);
    const closeAll = async () => {
      for (let i = 0; i < 6; i++) {
        if (!(await page.evaluate(() => window.__aud.top()))) return;
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
      }
    };
    const openPause = async () => {
      await closeAll();
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.getElementById("pausemenu").hidden, null, { polling: 100, timeout: 10_000 });
      await page.waitForTimeout(200);
    };
    await openPause();
    const pause = await walk(page, "pausemenu");
    await leaves(page, "pausemenu", openPause, pause.seed);
    const openDisplay = async () => {
      await openPause();
      await click(page, "#pm-settings");
      await page.waitForTimeout(250);
      await click(page, "#pm-open-display");
      await page.waitForTimeout(250);
      await openFolds(page);
    };
    await openDisplay();
    const disp = await walk(page, "pmsettings");
    await leaves(page, "pmsettings", openDisplay, disp.seed);
  });
});
