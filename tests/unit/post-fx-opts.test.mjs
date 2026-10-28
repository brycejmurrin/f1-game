/* post-fx-opts — GRAPHICS › AMBIENT OCCLUSION and GOD-RAYS, two independent
 * switches that skip their pass's GPU work.
 *
 * Runs the REAL module over a stub SettingRow and the shipped SettingsDefaults:
 * both rows exist in the shell, both default ON, each flips without moving the
 * other, and each persists through its own apex26.* raw key. The "skip the
 * work" half is pinned at its one gate in game.js — every backend (GLX, TLX,
 * WGX) already drops a pass whose strengths are all 0, so OFF must zero ALL of
 * them: ssao + contact for the AO pass, godray + lampVol for the god-ray march.
 *
 * Run: node --test tests/unit/post-fx-opts.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = "js/ui/post-fx-opts.js";
const SRC = fs.readFileSync(path.join(ROOT, FILE), "utf8").replace(/^const\b/gm, "var");
const DEFAULTS = (() => {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/data/settings-defaults.js"), "utf8").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/data/settings-defaults.js") });
  return vm.runInContext("SettingsDefaults", ctx);
})();
const SHELL = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const GAME = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");

function load(stored = {}) {
  const rows = new Map();
  const sb = {
    Math, console, Object, Array, JSON, String, Number,
    GameStore: { store: {
      raw: (k) => (k in stored ? stored[k] : DEFAULTS.has(k.replace(/^apex26\./, "")) ? DEFAULTS.get(k.replace(/^apex26\./, "")) : null),
      rawSet: (k, v) => { stored[k] = String(v); return true; },
    } },
    SettingRow: { wire: (id, spec) => rows.set(id, spec), labels: (vals) => vals.map((v) => [v, v.toUpperCase()]) },
    document: { readyState: "complete", addEventListener() {} },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(SRC, ctx, { filename: absSrc(FILE) });
  return { M: vm.runInContext("PostFxOpts", ctx), rows, stored };
}

test("it claims pm-ssao and pm-godrays, and the shell declares both rows with their selects", () => {
  const { rows } = load();
  assert.deepEqual([...rows.keys()], ["pm-ssao", "pm-godrays"]);
  for (const [id, label] of [["pm-ssao", "AMBIENT OCCLUSION"], ["pm-godrays", "GOD-RAYS"]]) {
    assert.ok(SHELL.includes(`id="${id}"`), id + " must exist in index.html");
    assert.ok(SHELL.includes(`id="${id}-sel"`), id + "-sel must exist — SettingRow needs the select");
    assert.ok(new RegExp(`id="${id}-label"[^>]*>${label}<`).test(SHELL), id + " must be labelled " + label);
  }
  // Both live in GRAPHICS, beside the other renderer levers.
  const gfx = SHELL.slice(SHELL.indexOf('id="pm-panel-graphics"'));
  assert.ok(gfx.indexOf('id="pm-ssao"') > 0 && gfx.indexOf('id="pm-ssao"') < gfx.indexOf("</section>"));
  assert.ok(gfx.indexOf('id="pm-godrays"') > 0 && gfx.indexOf('id="pm-godrays"') < gfx.indexOf("</section>"));
});

test("both ship ON: an unset key reads ON from the shipped SettingsDefaults", () => {
  assert.equal(DEFAULTS.get("gfxSsao"), "1");
  assert.equal(DEFAULTS.get("gfxGodrays"), "1");
  const { M, rows } = load();
  assert.equal(M.ssaoOn(), true);
  assert.equal(M.godraysOn(), true);
  assert.equal(rows.get("pm-ssao").read(), "on");
  assert.equal(rows.get("pm-godrays").read(), "on");
});

test("each row flips its own pass only, and persists through its own key", () => {
  const { M, rows, stored } = load();
  rows.get("pm-ssao").write("off");
  assert.equal(M.ssaoOn(), false);
  assert.equal(M.godraysOn(), true, "AO off leaves god-rays on");
  assert.equal(stored["apex26.gfxSsao"], "0");
  assert.equal(stored["apex26.gfxGodrays"], undefined, "the other key is untouched");
  rows.get("pm-godrays").write("off");
  rows.get("pm-ssao").write("on");
  assert.equal(M.ssaoOn(), true);
  assert.equal(M.godraysOn(), false, "god-rays off leaves AO on");
  assert.deepEqual({ ...stored }, { "apex26.gfxSsao": "1", "apex26.gfxGodrays": "0" });
  // A fresh boot reads what was stored.
  const again = load({ ...stored });
  assert.equal(again.M.ssaoOn(), true);
  assert.equal(again.M.godraysOn(), false);
  assert.equal(again.rows.get("pm-godrays").read(), "off");
  // Only the raw string "0" is off.
  for (const [raw, want] of [["0", false], ["1", true], ["", true], ["off", true]]) {
    assert.equal(load({ "apex26.gfxSsao": raw }).M.ssaoOn(), want, `raw ${JSON.stringify(raw)} must read ${want}`);
  }
});

test("gate() zeroes EVERY strength a switched-off pass is gated on, and nothing of the other pass", () => {
  // Each backend runs AO while ssao || contact > 0 and the god-ray march while godray || lampVol > 0,
  // so OFF has to clear both members of the pair or the GPU work survives.
  const full = () => ({ ssao: 0.8, contact: 0.5, godray: 0.6, lampVol: 0.3, bloom: 1 });
  const { M } = load();
  assert.deepEqual({ ...M.gate(full()) }, full(), "both ON: untouched");
  M.set("ssao", false);
  assert.deepEqual({ ...M.gate(full()) }, { ssao: 0, contact: 0, godray: 0.6, lampVol: 0.3, bloom: 1 });
  M.set("ssao", true); M.set("godrays", false);
  assert.deepEqual({ ...M.gate(full()) }, { ssao: 0.8, contact: 0.5, godray: 0, lampVol: 0, bloom: 1 });
  M.set("ssao", false);
  assert.deepEqual({ ...M.gate(full()) }, { ssao: 0, contact: 0, godray: 0, lampVol: 0, bloom: 1 });
  // game.js routes look-post shed then the GRAPHICS AO/god-ray switches.
  assert.ok(GAME.includes("PostFxOpts.applyLookShed(po,"));
  assert.ok(GAME.includes("PostFxOpts.gate(po);"));
});

test("applyLookShed zeros look-defining strengths when lookPostShed is true", () => {
  const stored = {};
  const rows = new Map();
  const sb = {
    Math, console, Object, Array, JSON, String, Number,
    GameStore: { store: {
      raw: (k) => (k in stored ? stored[k] : DEFAULTS.has(k.replace(/^apex26\./, "")) ? DEFAULTS.get(k.replace(/^apex26\./, "")) : null),
      rawSet: (k, v) => { stored[k] = String(v); return true; },
    } },
    SettingRow: { wire: (id, spec) => rows.set(id, spec), labels: (vals) => vals.map((v) => [v, v.toUpperCase()]) },
    document: { readyState: "complete", addEventListener() {} },
    PerfGov: {
      lookPostShed: () => true,
      autoTier: () => 0,
    },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(SRC, ctx, { filename: absSrc(FILE) });
  const M = vm.runInContext("PostFxOpts", ctx);
  const po = { bloom: 1, ssao: 0.8, godray: 0.5, contact: 0.3, lampVol: 0.2 };
  const v = { bloom: 1, ssao: 0.8, godray: 0.5, contact: 0.3, lampVol: 0.2, flareMul: 1 };
  M.applyLookShed(po, v);
  // flareMul too (phoneperf 2026-10-24): its depthAt(sunUV) tap was the one reader that kept the
  // full-res scene depth store on a shed LOW frame (tlx-post needsDepth, GLX needDepth).
  assert.deepEqual(po, { bloom: 0, ssao: 0, godray: 0, contact: 0, lampVol: 0, flareMul: 0 });
  sb.PerfGov.lookPostShed = () => false;
  assert.deepEqual(M.applyLookShed({}, v), v, "not shed: every strength passes through, the flare included");
  assert.ok(GAME.includes("flareMul: LT.flareMul });"), "game.js hands LT.flareMul to applyLookShed");
  assert.ok(!/po\.flareMul = LT\.flareMul/.test(GAME), "and no later write puts the flare back");
});
