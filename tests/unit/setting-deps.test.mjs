/* setting-deps.test.mjs — SettingDeps (js/ui/setting-deps.js), the one
 * dependency map that greys a setting another setting makes inert. Walks EVERY
 * rule: builds its targets in the shape index.html gives them, turns each
 * parent OFF, and asserts every dependent control is disabled with a reason
 * its aria-describedby reads; turns the parents back ON and asserts the
 * control is live again with its value kept. Also pins that each id exists in
 * the shell, and that an owner's own disable is never undone.
 * Run: node --test tests/unit/setting-deps.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";

const read = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const SRC = read("js/ui/setting-deps.js").replace(/^const SettingDeps\b/m, "var SettingDeps");
const SHELL = read("index.html");

// The parent a rule reads, as data: { id, want, off } — the values that make it live and inert.
const parentsOf = (rule) => (rule.parent && !rule.values && !rule.except
  ? [].concat(rule.parent).map((id) => ({ id, want: "on", off: "off" }))
  : [parentOf(rule)].filter(Boolean));
const parentOf = (rule) => {
  if (!rule.parent) return null;
  if (rule.values) return { id: rule.parent, want: rule.values[0], off: "__not-" + rule.values[0] };
  if (rule.except) return { id: rule.parent, want: "__not-" + rule.except[0], off: rule.except[0] };
  return { id: rule.parent, want: "on", off: "off" };
};
// A when() rule reads module state; each one names how the test turns it off and on.
const WHEN = {
  "line-off": (h, on) => { h.mode.line = on ? "full" : "off"; },
  "intro-motion": (h, on) => { h.mode.motion = on ? "on" : "reduce"; },
  "vignette-motion": (h, on) => { h.mode.motion = on ? "on" : "reduce"; },
  "touch-dock": (h, on) => { h.mode.touch = on; },
  "panel-contrast": (h, on) => { h.d.documentElement.setAttribute("data-ui-contrast", on ? "normal" : "high"); },
  "turnchase-cam": (h, on) => { h.mode.cam = on ? "cockpit" : "chase"; h.mode.camIdx = 0; },
  "photo-scene": (h, on) => { h.mode.scene = on ? "photo" : "garage"; },
};

function boot() {
  const dom = makeDom({ readyState: "complete" });
  const d = dom.document;
  d.getElementById = (id) => d.querySelector("#" + id);
  const el = (tag, id, parent = dom.body) => { const n = dom.makeElement(tag, id); parent.appendChild(n); return n; };
  const mode = { line: "full", motion: "on", touch: true, cam: "cockpit", camIdx: 0, scene: "photo" };
  const ctx = vm.createContext({
    document: d, setTimeout, Log: { info() {}, warn() {} },
    DrivingLine: { mode: () => mode.line }, TitleFx: { mode: () => mode.motion },
    Input: { touchControlsNeeded: () => mode.touch },
    GameStore: { store: { get: (k, fallback) => (k === "homeScene" ? mode.scene : k === "camMode" ? mode.camIdx : fallback) } },
    CamModes: { CAM_MODES: [{ id: "cockpit" }, { id: "chase" }] },
  });
  // turnchase-cam OFF flips the stored mode id via camIdx 0's slot.
  Object.defineProperty(ctx.CamModes.CAM_MODES[0], "id", { get: () => mode.cam, enumerable: true });
  vm.runInContext(SRC, ctx);
  return { dom, d, el, ctx, mode, Deps: ctx.SettingDeps };
}

// A target in the shape the shell gives it: a SettingRow, a labelled range, a
// toggle button, or a <details> section holding controls.
function shellShape(id) {
  const tag = (SHELL.match(new RegExp(`<(\\w+)[^>]*\\bid="${id}"`)) || [])[1];
  const row = new RegExp(`id="${id}"[^>]*class="set-row`).test(SHELL);
  return row ? "row" : tag;
}

function buildTarget(h, id) {
  const shape = shellShape(id);
  if (shape === "row") {
    const row = h.el("div", id); row.classList.add("set-row");
    const lab = h.el("span", id + "-label", row); lab.classList.add("tune-label"); lab.textContent = "LABEL";
    const wrap = h.el("div", null, row);
    const sel = h.el("select", id + "-sel", wrap); sel.value = "kept";
    return [sel];
  }
  if (shape === "input") {
    const lab = h.el("label"); lab.classList.add("tune-row");
    const name = h.el("span", null, lab); name.classList.add("tune-label");
    const input = h.el("input", id, lab); input.type = "range"; input.value = "7";
    return [input];
  }
  if (shape === "details") {
    const det = h.el("details", id);
    h.el("summary", null, det);
    const a = h.el("input", id + "-a", det); a.value = "3";
    const b = h.el("button", id + "-b", det);
    return [a, b];
  }
  if (!shape) { // runtime-built: a labelled range (sliders) or a checkbox row
    const lab = h.el("label"); lab.classList.add("tune-row");
    const name = h.el("span", null, lab); name.classList.add("tune-label");
    const input = h.el("input", id, lab); input.value = "4";
    return [input];
  }
  const btn = h.el(shape, id); return [btn];
}

function setParent(h, p, on) {
  let el = h.d.getElementById(p.id) || null;
  if (p.id.startsWith("as-l-")) {
    if (!el) el = h.el("button", p.id);
    el.setAttribute("aria-pressed", on ? "true" : "false");
    return;
  }
  let sel = h.d.getElementById(p.id + "-sel");
  if (!sel) { const row = h.el("div", p.id); row.classList.add("set-row"); sel = h.el("select", p.id + "-sel", row); }
  // OFF = a value no rule accepts; ON = the value(s) the rule asks for.
  sel.value = on ? p.want : p.off;
}

test("every rule target and parent id exists in the shell", () => {
  const h = boot();
  for (const rule of h.Deps.RULES) {
    for (const id of rule.runtime ? [] : rule.ids) assert.match(SHELL, new RegExp(`id="${id}"`), `${rule.key}: target #${id} missing from index.html`);
    const ps = parentsOf(rule);
    for (const p of ps) if (!/^pm-(metrics|xr-mode)$/.test(p.id)) assert.match(SHELL, new RegExp(`id="${p.id}"`), `${rule.key}: parent #${p.id} missing`);
    if (!ps.length) assert.equal(typeof WHEN[rule.key], "function", `${rule.key}: a when() rule needs a WHEN entry in this test`);
    assert.ok(rule.reason && rule.reason.length <= 28, `${rule.key}: reason must fit a one-line label (≤ 28 chars)`);
  }
});

test("each parent OFF greys every dependent with a described reason; ON restores it", () => {
  for (const rule of boot().Deps.RULES) {
    const h = boot();
    const live = rule.ids.flatMap((id) => buildTarget(h, id));
    const before = live.map((c) => c.value);
    const parents = parentsOf(rule);
    for (const p of parents) setParent(h, p, false);
    if (WHEN[rule.key]) WHEN[rule.key](h, false);
    h.Deps.refresh();
    for (const c of live) {
      assert.equal(c.disabled, true, `${rule.key}: #${c.id} not disabled with its parent off`);
      assert.equal(c.getAttribute("aria-disabled"), "true", `${rule.key}: #${c.id} aria-disabled`);
      const ids = (c.getAttribute("aria-describedby") || "").split(" ");
      const reason = ids.map((x) => h.d.getElementById(x)).find((r) => r && r.textContent === rule.reason);
      assert.ok(reason, `${rule.key}: #${c.id} has no aria-describedby reason "${rule.reason}"`);
      assert.equal(reason.hidden, false, `${rule.key}: reason hidden`);
    }
    for (const p of parents) setParent(h, p, true);
    if (WHEN[rule.key]) WHEN[rule.key](h, true);
    h.Deps.refresh();
    live.forEach((c, i) => {
      assert.equal(c.disabled, false, `${rule.key}: #${c.id} still disabled with its parent on`);
      assert.equal(c.getAttribute("aria-disabled"), null);
      assert.equal(c.value, before[i], `${rule.key}: #${c.id} lost its value`);
      assert.ok(!(c.getAttribute("aria-describedby") || "").includes("-dep"), `${rule.key}: stale reason reference`);
    });
  }
});

test("an owner's own disable survives a dependency turning back on", () => {
  const h = boot();
  const [sel] = buildTarget(h, "pm-linecolor");
  sel.disabled = true; // the owner locked it for its own reason
  h.mode.line = "off"; h.Deps.refresh();
  h.mode.line = "full"; h.Deps.refresh();
  assert.equal(sel.disabled, true, "SettingDeps re-enabled a control it did not disable");
});

test("a parent missing from the DOM greys nothing (lazy panels)", () => {
  const h = boot();
  const [input] = buildTarget(h, "pm-tiltcurve");
  h.Deps.refresh();
  assert.equal(input.disabled, false);
});

test("two rules on one control: lifting one keeps the other's grey (PANEL OPACITY: HUD OFF + HIGH CONTRAST)", () => {
  const h = boot();
  const [input] = buildTarget(h, "pm-panelopacity");
  setParent(h, { id: "pm-hidehud", want: "on", off: "off" }, false);
  h.d.documentElement.setAttribute("data-ui-contrast", "high");
  h.Deps.refresh();
  assert.equal(input.disabled, true);
  setParent(h, { id: "pm-hidehud", want: "on", off: "off" }, true); // HUD back on; contrast still high
  h.Deps.refresh();
  assert.equal(input.disabled, true, "HUD ON re-enabled a control HIGH CONTRAST still overrides");
  const reason = h.d.getElementById(input.getAttribute("aria-describedby"));
  assert.equal(reason && reason.textContent, "Solid under HIGH CONTRAST");
  h.d.documentElement.setAttribute("data-ui-contrast", "normal");
  h.Deps.refresh();
  assert.equal(input.disabled, false);
});

test("a list of parents greys when ANY is off (ENGINE TONE: SOUND row and master button)", () => {
  const h = boot();
  const [a] = buildTarget(h, "as-engine-details");
  setParent(h, { id: "as-sound", want: "on", off: "off" }, true);
  setParent(h, { id: "soundbtn", want: "on", off: "off" }, false);
  h.Deps.refresh();
  assert.equal(a.disabled, true, "master sound off must grey the engine fold");
  setParent(h, { id: "soundbtn", want: "on", off: "off" }, true);
  h.Deps.refresh();
  assert.equal(a.disabled, false);
});

/* EXPLAIN: controls their OWNER greys. SettingDeps never disables these; while
   the owner has one disabled it shows why (or links the owner's status line). */
const TREE = (() => {
  const out = [read("index.html")];
  const walk = (d) => {
    for (const e of fs.readdirSync(new URL("../../" + d, import.meta.url), { withFileTypes: true })) {
      if (e.isDirectory()) walk(d + "/" + e.name); else if (e.name.endsWith(".js")) out.push(read(d + "/" + e.name));
    }
  };
  walk("js");
  return out.join("\n");
})();

test("every EXPLAIN id is a real control id somewhere in the shell or js/", () => {
  for (const rule of boot().Deps.EXPLAIN) {
    for (const id of rule.ids || []) {
      assert.ok(TREE.includes(`"${id}"`) || TREE.includes(`id="${id}"`) || TREE.includes(`'${id}'`),
        `${rule.key}: #${id} appears nowhere in index.html or js/`);
    }
    if (typeof rule.why === "string") assert.ok(rule.why.length <= 28, `${rule.key}: reason too long for one line`);
  }
});

test("an owner-greyed control shows its reason (or links the owner's status) and drops it when re-enabled", () => {
  for (const rule of boot().Deps.EXPLAIN) {
    for (const id of rule.ids || []) {
      const h = boot();
      if (rule.link) h.el("p", rule.link).textContent = "owner status";
      const [c] = buildTarget(h, id);
      c.disabled = true; // the owner greyed it
      h.Deps.refresh();
      const ids = (c.getAttribute("aria-describedby") || "").split(" ").filter(Boolean);
      const texts = ids.map((x) => h.d.getElementById(x)).filter((r) => r && !r.hidden && r.textContent);
      assert.ok(texts.length, `${rule.key}: #${id} greyed by its owner has no visible described reason`);
      assert.equal(c.disabled, true, `${rule.key}: SettingDeps must not change an owner's disable`);
      c.disabled = false;
      h.Deps.refresh();
      const left = (c.getAttribute("aria-describedby") || "").split(" ").filter(Boolean)
        .map((x) => h.d.getElementById(x)).filter((r) => r && !r.hidden && r.textContent && r.textContent !== "owner status");
      assert.equal(left.length, 0, `${rule.key}: #${id} live again but still described by a reason`);
      assert.ok(!(c.getAttribute("aria-describedby") || "").includes(rule.link || "\u0000"), `${rule.key}: #${id} still linked to the status line`);
    }
  }
});

test("EXPLAIN never speaks for a control SettingDeps greyed itself", () => {
  const h = boot();
  // pm-smooth: a steer-tilt row (TILT RANGE / pm-tiltdeg left the rule with #2883's jump).
  const [input] = buildTarget(h, "pm-smooth");
  setParent(h, { id: "pm-steer", want: "tilt", off: "buttons" }, false);
  h.Deps.refresh();
  const reasons = (input.getAttribute("aria-describedby") || "").split(" ").filter(Boolean);
  assert.deepEqual(reasons, ["pm-smooth-dep"]);
});
