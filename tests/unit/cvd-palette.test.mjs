/* cvd-palette — COLOUR VISION semantic colours.
 *
 * off matches today's tokens. CVD modes are distinguishable under Machado 2009
 * (linear RGB, severity 1.0) by CIEDE2000, and each ink clears 4.5:1 on the
 * HUD plate. Sharma's published vectors self-check dE2000 before any palette
 * assertion, so a broken implementation cannot grade itself.
 *
 * Run: node --test tests/unit/cvd-palette.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function load(stored) {
  const style = new Map();
  const el = {
    style: {
      setProperty: (k, v) => style.set(k, v),
      removeProperty: (k) => style.delete(k),
      getPropertyValue: (k) => style.get(k) || "",
    },
  };
  const sb = {
    Math, console, Object, Array, JSON, String, Number, parseInt,
    GameStore: { store: { get: (k, d) => (stored && k in stored ? stored[k] : d), set() {} } },
    document: { documentElement: el },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(read("js/ui/cvd-palette.js").replace(/^const\b/gm, "var"), ctx, { filename: "js/ui/cvd-palette.js" });
  return { P: vm.runInContext("CvdPalette", ctx), style };
}

const GOLDEN_OFF = {
  good: "#a3e635", warn: "#f6d200", bad: "#ff3b30", best: "#dfa3ff", you: "#aeea00",
  zone: "#26a5f5", ghost: "#78dcff",
  sec1: "#ffd700", sec2: "#c0c0c0", sec3: "#cd9b5a",
  cmpS: "#e8002d", cmpM: "#f6d200", cmpH: "#f0f0f0", cmpI: "#3fb950", cmpW: "#1e90ff",
};

// Sharma, Wu & Dalal 2005 supplementary pairs (L*a*b* ref, L*a*b* sample, dE00).
// https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/
const SHARMA = `
50.0000 2.6772 -79.7751 50.0000 0.0000 -82.7485 2.0425
50.0000 3.1571 -77.2803 50.0000 0.0000 -82.7485 2.8615
50.0000 2.8361 -74.0200 50.0000 0.0000 -82.7485 3.4412
50.0000 -1.3802 -84.2814 50.0000 0.0000 -82.7485 1.0000
50.0000 -1.1848 -84.8006 50.0000 0.0000 -82.7485 1.0000
50.0000 -0.9009 -85.5211 50.0000 0.0000 -82.7485 1.0000
50.0000 0.0000 0.0000 50.0000 -1.0000 2.0000 2.3669
50.0000 -1.0000 2.0000 50.0000 0.0000 0.0000 2.3669
50.0000 2.4900 -0.0010 50.0000 -2.4900 0.0009 7.1792
50.0000 2.4900 -0.0010 50.0000 -2.4900 0.0010 7.1792
50.0000 2.4900 -0.0010 50.0000 -2.4900 0.0011 7.2195
50.0000 2.4900 -0.0010 50.0000 -2.4900 0.0012 7.2195
50.0000 -0.0010 2.4900 50.0000 0.0009 -2.4900 4.8045
50.0000 -0.0010 2.4900 50.0000 0.0010 -2.4900 4.8045
50.0000 -0.0010 2.4900 50.0000 0.0011 -2.4900 4.7461
50.0000 2.5000 0.0000 50.0000 0.0000 -2.5000 4.3065
50.0000 2.5000 0.0000 73.0000 25.0000 -18.0000 27.1492
50.0000 2.5000 0.0000 61.0000 -5.0000 29.0000 22.8977
50.0000 2.5000 0.0000 56.0000 -27.0000 -3.0000 31.9030
50.0000 2.5000 0.0000 58.0000 24.0000 15.0000 19.4535
50.0000 2.5000 0.0000 50.0000 3.1736 0.5854 1.0000
50.0000 2.5000 0.0000 50.0000 3.2972 0.0000 1.0000
50.0000 2.5000 0.0000 50.0000 1.8634 0.5757 1.0000
50.0000 2.5000 0.0000 50.0000 3.2592 0.3350 1.0000
60.2574 -34.0099 36.2677 60.4626 -34.1751 39.4387 1.2644
63.0109 -31.0961 -5.8663 62.8187 -29.7946 -4.0864 1.2630
61.2901 3.7196 -5.3901 61.4292 2.2480 -4.9620 1.8731
35.0831 -44.1164 3.7933 35.0232 -40.0716 1.5901 1.8645
22.7233 20.0904 -46.6940 23.0331 14.9730 -42.5619 2.0373
36.4612 47.8580 18.3852 36.2715 50.5065 21.2231 1.4146
90.8027 -2.0831 1.4410 91.1528 -1.6435 0.0447 1.4441
90.9257 -0.5406 -0.9208 88.6381 -0.8985 -0.7239 1.5381
6.7747 -0.2908 -2.4247 5.8714 -0.0985 -2.2286 0.6377
2.0776 0.0795 -1.1350 0.9033 -0.0636 -0.5514 0.9082
`.trim().split("\n").map((line) => line.trim().split(/\s+/).map(Number));

test("off palette equals today's token and canvas values", () => {
  const { P, style } = load();
  assert.equal(P.mode(), "off");
  for (const [key, hex] of Object.entries(GOLDEN_OFF)) {
    assert.equal(P.hex(key), hex, key);
    assert.equal(P.css(key), hex, key);
  }
  const [r, g, b] = P.rgb01("you");
  assert.ok(Math.abs(r - 0xae / 255) < 1e-9 && Math.abs(g - 0xea / 255) < 1e-9 && b === 0);
  assert.equal(style.size, 0, "off removes inline overrides so :root stays the source");
});

test("CIEDE2000 matches Sharma's published vectors", () => {
  const { P } = load();
  assert.equal(SHARMA.length, 34);
  for (const [L1, a1, b1, L2, a2, b2, exp] of SHARMA) {
    const got = P.dE2000([L1, a1, b1], [L2, a2, b2]);
    assert.ok(Math.abs(got - exp) < 0.0002, `dE ${exp} computed ${got}`);
  }
});

test("Machado simulation is the severity-1 matrix on linear RGB", () => {
  const { P } = load();
  // #ff0000 is linear (1, 0, 0). Deutan row 0, column 0 is 0.367322.
  const lin = P.simulateLinear([1, 0, 0], "deutan");
  assert.ok(Math.abs(lin[0] - 0.367322) < 1e-6, lin[0]);
  assert.ok(Math.abs(lin[1] - 0.280085) < 1e-6, lin[1]);
  assert.ok(Math.abs(lin[2] - -0.011820) < 1e-6 || lin[2] === 0, "negative linear channel clamps at 0");
  const shown = P.simulate([1, 0, 0], "deutan");
  assert.ok(shown[0] > 0 && shown[0] <= 1, "simulate returns encoded sRGB");
  assert.equal(P.MACHADO.protan[0][0], 0.152286);
  assert.equal(P.MACHADO.tritan[2][1], 0.691367);
});

test("co-visible states stay apart under every CVD simulation", () => {
  const { P } = load();
  const types = ["deutan", "protan", "tritan"];
  for (const mode of types) {
    P.set(mode);
    for (const group of P.COVISIBLE[mode]) {
      const labs = group.map((key) => {
        const rgb = P.hex(key).match(/[0-9a-f]{2}/gi).map((h) => parseInt(h, 16) / 255);
        return P.labFromLinear(P.simulateLinear(rgb, mode));
      });
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const d = P.dE2000(labs[i], labs[j]);
          assert.ok(d >= 10, `${mode} ${group[i]}/${group[j]} dE00 ${d.toFixed(2)} under its own type`);
        }
      }
      for (const other of types) {
        if (other === mode) continue;
        const otherLabs = group.map((key) => {
          const rgb = P.hex(key).match(/[0-9a-f]{2}/gi).map((h) => parseInt(h, 16) / 255);
          return P.labFromLinear(P.simulateLinear(rgb, other));
        });
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const d = P.dE2000(otherLabs[i], otherLabs[j]);
            assert.ok(d >= 6, `${mode} ${group[i]}/${group[j]} dE00 ${d.toFixed(2)} under ${other}`);
          }
        }
      }
    }
  }
});

test("CVD inks clear 4.5:1 on the HUD plate and match tokens.css", () => {
  const { P } = load();
  const tokens = read("css/tokens.css");
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const relL = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a, b) => { const x = relL(a), y = relL(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const plate = [8, 8, 14].map((c) => c * 0.72 + 128 * 0.28);
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const block = (mode) => {
    const re = new RegExp(':root\\[data-cvd="' + mode + '"\\][^{]*\\{([^}]*)\\}');
    const m = tokens.match(re);
    assert.ok(m, mode);
    const out = {};
    for (const [, name, val] of m[1].matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[name] = val.toLowerCase();
    return out;
  };
  for (const mode of ["deutan", "protan", "tritan"]) {
    P.set(mode);
    const css = block(mode);
    for (const [key, name] of Object.entries(P.CSS_OF)) {
      const h = P.hex(key);
      assert.equal(css[name], h, `${mode} ${name}`);
      const r = ratio(hex(h), plate);
      assert.ok(r >= 4.5, `${mode} ${key} ${h} is ${r.toFixed(2)}:1`);
    }
  }
});

test("set persists through AppearanceOpts and paints the tokens", () => {
  const app = read("js/ui/appearance-opts.js");
  assert.match(app, /function setCvdMode\(v\) \{[\s\S]*?store\.set\(K_CVD, cvdMode\);[\s\S]*?CvdPalette\.set\(cvdMode\)/);
  const style = new Map();
  const dataset = {};
  const stored = {};
  const rows = new Map();
  const el = {
    dataset,
    className: "",
    getAttribute: (k) => (k.startsWith("data-") ? (dataset[k.slice(5)] ?? null) : null),
    setAttribute: (k, v) => { if (k.startsWith("data-")) dataset[k.slice(5)] = v; },
    style: {
      setProperty: (k, v) => style.set(k, v),
      removeProperty: (k) => style.delete(k),
      getPropertyValue: (k) => style.get(k) || "",
    },
  };
  const sb = {
    Math, console, Object, Array, JSON, String, Number, parseInt,
    GameStore: { store: { get: (k, d) => (k in stored ? stored[k] : d), set: (k, v) => { stored[k] = v; } } },
    document: {
      documentElement: el, readyState: "loading",
      getElementById: () => null, createElement: () => ({ id: "", className: "", textContent: "" }),
      addEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
    },
    SettingRow: undefined,
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(read("js/ui/cvd-palette.js").replace(/^const\b/gm, "var"), ctx, { filename: "js/ui/cvd-palette.js" });
  vm.runInContext(app.replace(/^const\b/gm, "var"), ctx, { filename: "js/ui/appearance-opts.js" });
  const A = vm.runInContext("AppearanceOpts", ctx);
  const P = vm.runInContext("CvdPalette", ctx);
  assert.equal(A.setCvdMode("tritan"), "tritan");
  assert.equal(stored.cvdMode, "tritan");
  assert.equal(dataset.cvd, "tritan");
  assert.equal(P.mode(), "tritan");
  assert.equal(style.get("--you"), "#ff5c96");
  assert.equal(style.get("--zone"), "#00e0c0");
  A.setCvdMode("off");
  assert.equal(stored.cvdMode, "off");
  assert.equal(dataset.cvd, undefined);
  assert.equal(style.has("--you"), false);
  assert.equal(rows.size, 0);
});

test("minimap, DRS and ghost cues are shapes and read the palette", () => {
  const hud = read("css/hud.css");
  assert.match(hud, /#minimap\s*\{[^}]*inset 0 0 0 2px var\(--you/);
  assert.match(hud, /#hud-aero\s*\{[^}]*--aero-hue:\s*var\(--zone\)/);
  assert.match(hud, /#hud-aero\.ax-armed\s*\{[^}]*repeating-linear-gradient/);
  assert.match(hud, /#hud-delta\[data-ref="ghost"\] \.hud-label::after\s*\{[^}]*content:\s*"\\25CB"/);
  assert.match(hud, /#hud-delta\[data-ref="ghost"\] \.hud-label::after\s*\{[^}]*var\(--ghost\)/);
});

test("the palette module does not read the track, physics or the player", () => {
  const src = read("js/ui/cvd-palette.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.doesNotMatch(src, /\bTracks\b|\bcurvature\b|\bphysics\b|\bplayer\./);
});
