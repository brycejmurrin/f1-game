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
};

function boot() {
  const dom = makeDom({ readyState: "complete" });
  const d = dom.document;
  d.getElementById = (id) => d.querySelector("#" + id);
  const el = (tag, id, parent = dom.body) => { const n = dom.makeElement(tag, id); parent.appendChild(n); return n; };
  const mode = { line: "full", motion: "on" };
  const ctx = vm.createContext({
    document: d, setTimeout, Log: { info() {}, warn() {} },
    DrivingLine: { mode: () => mode.line }, TitleFx: { mode: () => mode.motion },
  });
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
    const p = parentOf(rule);
    if (p) assert.match(SHELL, new RegExp(`id="${p.id}"`), `${rule.key}: parent #${p.id} missing`);
    else assert.equal(typeof WHEN[rule.key], "function", `${rule.key}: a when() rule needs a WHEN entry in this test`);
    assert.ok(rule.reason && rule.reason.length <= 28, `${rule.key}: reason must fit a one-line label (≤ 28 chars)`);
  }
});

test("each parent OFF greys every dependent with a described reason; ON restores it", () => {
  for (const rule of boot().Deps.RULES) {
    const h = boot();
    const live = rule.ids.flatMap((id) => buildTarget(h, id));
    const before = live.map((c) => c.value);
    const parents = [parentOf(rule)].filter(Boolean);
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
  const [input] = buildTarget(h, "pm-tiltdeg");
  h.Deps.refresh();
  assert.equal(input.disabled, false);
});
