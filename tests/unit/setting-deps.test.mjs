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
  "turnchase-cam": (h, on) => { h.mode.cam = on ? "cockpit" : "chase"; },
  "photo-scene": (h, on) => { h.mode.scene = on ? "photo" : "garage"; },
};

function boot(extra = {}) {
  const dom = makeDom({ readyState: "complete" });
  const d = dom.document;
  d.getElementById = (id) => d.querySelector("#" + id);
  const el = (tag, id, parent = dom.body) => { const n = dom.makeElement(tag, id); parent.appendChild(n); return n; };
  const mode = { line: "full", motion: "on", touch: true, cam: "cockpit", scene: "photo" };
  const ctx = vm.createContext({
    document: d, setTimeout, Log: { info() {}, warn() {} },
    DrivingLine: { mode: () => mode.line }, TitleFx: { mode: () => mode.motion },
    Input: { touchControlsNeeded: () => mode.touch },
    GameStore: { store: { get: (k, fallback) => (k === "homeScene" ? mode.scene : k === "camMode" ? 0 : fallback) } },
    CamModes: { CAM_MODES: [{ id: "cockpit" }] },
    ...extra,
  });
  // turnchase-cam OFF flips the mode id at the stored camMode index.
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

test("stable dependencies and owner explanations make no metadata or reason writes", () => {
  const h = boot();
  const [tilt] = buildTarget(h, "pm-tiltcurve"), [gears] = buildTarget(h, "pm-gears");
  const p = { id: "pm-steer", want: "tilt", off: "buttons" };
  setParent(h, p, false); gears.disabled = true;
  h.Deps.refresh();
  let writes = 0;
  const observe = (el) => {
    const set = el.setAttribute, remove = el.removeAttribute;
    el.setAttribute = (k, v) => { writes++; set(k, v); };
    el.removeAttribute = (k) => { writes++; remove(k); };
    for (const k of ["hidden", "disabled", "textContent"]) {
      let value = el[k];
      Object.defineProperty(el, k, { get: () => value, set: (v) => { writes++; value = v; } });
    }
    el.children.forEach(observe);
  };
  observe(h.dom.body);
  for (let i = 0; i < 5; i++) h.Deps.refresh();
  assert.equal(writes, 0, "unchanged dependency reasons, owner explanations and aria-describedby remain untouched");
  setParent(h, p, true); gears.disabled = false; h.Deps.refresh();
  assert.equal(tilt.disabled, false);
  assert.equal(h.d.getElementById("pm-tiltcurve-dep").hidden, true);
  assert.equal(h.d.getElementById("pm-tiltcurve-dep").textContent, "");
  assert.equal(gears.getAttribute("aria-describedby"), null);
  assert.equal(h.d.getElementById("pm-gears-why").hidden, true);
  assert.ok(writes > 0, "real changes still update controls, reasons and descriptions");
});

test("disabled observer preserves dynamic owner explanations when disabled remains unchanged", () => {
  const timers = [], observers = [];
  const h = boot({
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    MutationObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} },
  });
  const card = h.el("button", "cs-team-card"), observer = observers[0];
  const description = () => (card.getAttribute("aria-describedby") || "").split(" ")
    .map((id) => h.d.getElementById(id)?.textContent || "").join(" ");
  card.setAttribute("disabled", ""); card.disabled = true; card.title = "Fixed by your career";
  h.Deps.refresh();
  assert.equal(description(), "Fixed by your career");
  // The owner changes its reason while remaining disabled. A same-value
  // reflected write is still its invalidation signal, so it must be followed.
  card.title = "Fixed while in a race"; card.disabled = true;
  observer.fn([{ target: card, attributeName: "disabled", oldValue: "" }]);
  assert.equal(timers.length, 1, "an unchanged disabled value still schedules owner explanation refresh");
  timers.shift()();
  assert.equal(description(), "Fixed while in a race");
  card.removeAttribute("disabled"); card.disabled = false;
  observer.fn([{ target: card, attributeName: "disabled", oldValue: "" }]);
  assert.equal(timers.length, 1, "a real owner transition still refreshes");
  timers.shift()();
  assert.equal(card.getAttribute("aria-describedby"), null);
  h.dom.dispatch(card, { type: "input", bubbles: true });
  assert.equal(timers.length, 1, "normal settings interaction keeps its deferred refresh");
});

// A refresh runs after EVERY input event anywhere (capture listener), so a pass
// that changes nothing must write nothing: each redundant write is a DOM
// mutation record that wakes AriaState and ScrollFade (B·H30 G3, a colour-picker
// drag in the garage paid for ~20 reason spans and ~30 describedby rewrites a step).
test("a refresh that changes nothing writes nothing to the DOM", () => {
  for (const rule of boot().Deps.RULES) {
    const h = boot();
    const live = rule.ids.flatMap((id) => buildTarget(h, id));
    for (const p of parentsOf(rule)) setParent(h, p, false);
    if (WHEN[rule.key]) WHEN[rule.key](h, false);
    h.Deps.refresh();
    const writes = [];
    const walk = (n) => {
      if (n.nodeType !== 1) return;
      const set = n.setAttribute, rm = n.removeAttribute;
      n.setAttribute = (k, v) => { writes.push(`${n.id || n.tagName} setAttribute ${k}`); return set(k, v); };
      n.removeAttribute = (k) => { if (n.hasAttribute(k)) writes.push(`${n.id || n.tagName} removeAttribute ${k}`); return rm(k); };
      for (const prop of ["textContent", "hidden", "disabled"]) {
        let v = n[prop];
        Object.defineProperty(n, prop, { configurable: true, enumerable: true, get: () => v, set: (x) => { writes.push(`${n.id || n.tagName} ${prop}=${x}`); v = x; } });
      }
      n.children.forEach(walk);
    };
    walk(h.dom.body);
    h.Deps.refresh();
    assert.deepEqual(writes, [], `${rule.key}: an idempotent refresh wrote ${writes.length} times: ${writes.slice(0, 4).join("; ")}`);
    assert.ok(live.length > 0);
  }
});
