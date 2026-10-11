// Round-2 shell hunt S1: the prefers-reduced-transparency and prefers-contrast
// "solid surface" remedies sat in @layer components ahead of rules that
// repainted the same selector (later source, or a later layer), so they never
// applied. This is the node port of the hunter's dead_decl.py: every declaration
// inside a preference/device `@media` block (prefers-*, pointer, hover,
// orientation: S1 reduced-transparency/contrast, S3 short-landscape tray, S8
// coarse-pointer file button) must survive the cascade, i.e. no
// UNCONDITIONAL declaration of the same property on the same selector may come
// later (higher layer, or same layer and later in stylesheet order).
//
// Scope, deliberately narrow: same selector string, same property name, the
// overrider unconditional. It does not compare different selectors by
// specificity; it catches the "restated below" class, which is what broke.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const MANIFEST = createRequire(import.meta.url)("../../tools/manifest.cjs");

/** Rules as {line, ctx[], selector, body}; at-rule blocks other than the
 *  grouping ones (@media/@supports/@layer/@container) are recorded as rules
 *  whose selector starts with "@" and skipped by the checker. */
export function parseCss(src) {
  const s = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const n = s.length;
  const rules = [];
  // Line starts, so a rule's line number is a binary search, not a rescan.
  const starts = [0];
  for (let i = 0; i < n; i++) if (s.charCodeAt(i) === 10) starts.push(i + 1);
  const fastLine = (pos) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; } return lo + 1; };
  const GROUP = new Set(["@media", "@supports", "@layer", "@container", "@scope", "@starting-style"]);
  function block(i, ctx) {
    while (i < n) {
      while (i < n && /\s/.test(s[i])) i++;
      if (i >= n) return i;
      if (s[i] === "}") return i + 1;
      let j = i, depth = 0;
      while (j < n && !((s[j] === "{" || s[j] === ";") && depth === 0)) {
        if (s[j] === "(") depth++; else if (s[j] === ")") depth--;
        j++;
      }
      if (j >= n) return n;
      const prelude = s.slice(i, j).trim().replace(/\s+/g, " ");
      if (s[j] === ";") { i = j + 1; continue; }
      if (prelude.startsWith("@") && GROUP.has(prelude.split(" ")[0])) { i = block(j + 1, [...ctx, prelude]); continue; }
      let d = 1, k = j + 1;
      while (k < n && d > 0) { if (s[k] === "{") d++; else if (s[k] === "}") d--; k++; }
      rules.push({ line: fastLine(i), pos: i, ctx, selector: prelude, body: s.slice(j + 1, k - 1) });
      i = k;
    }
    return i;
  }
  block(0, []);
  return rules;
}

const splitTop = (str, sep) => {
  const out = []; let depth = 0, cur = "";
  for (const ch of str) {
    if (ch === "(" || ch === "[") depth++; else if (ch === ")" || ch === "]") depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean);
};

function* declarations(body) {
  for (const d of splitTop(body, ";")) {
    const at = d.indexOf(":");
    if (at < 0) continue;
    const prop = d.slice(0, at).trim().toLowerCase();
    if (!prop || prop.startsWith("--")) continue;
    yield [prop, d.slice(at + 1).trim().replace(/\s+/g, " ")];
  }
}

const layerOf = (ctx) => { for (const c of ctx) { const m = /^@layer\s+([\w-]+)/.exec(c); if (m) return m[1]; } return null; };

/** Media conditions that express a user preference or a device class: the ones
 *  whose remedy silently never applies when a later rule restates the property.
 *  Width/height breakpoints are left out (they are ordinary responsive overrides). */
const DEVICE_OR_PREFERENCE = /prefers-|\bpointer\b|\bhover\b|\borientation\b/;

/** files: [{name, text}] in stylesheet link order; layers: the @layer order. */
export function deadPrefersDeclarations(files, layers) {
  const rank = (L) => (L === null ? layers.length : layers.indexOf(L));
  const db = new Map();
  files.forEach((f, fileIdx) => {
    for (const r of parseCss(f.text)) {
      if (r.selector.startsWith("@")) continue;
      const L = rank(layerOf(r.ctx));
      const media = r.ctx.filter((c) => !c.startsWith("@layer"));
      for (const sel of splitTop(r.selector, ",")) {
        for (const [prop, value] of declarations(r.body)) {
          const k = `${sel}\u0000${prop}`;
          if (!db.has(k)) db.set(k, []);
          db.get(k).push({ L, fileIdx, line: r.line, pos: r.pos, media, value, file: f.name, sel, prop });
        }
      }
    }
  });
  const dead = [];
  const after = (b, a) => b.L !== a.L ? b.L > a.L : b.fileIdx !== a.fileIdx ? b.fileIdx > a.fileIdx : b.pos > a.pos;
  for (const list of db.values()) {
    for (const a of list) {
      if (!a.media.some((m) => DEVICE_OR_PREFERENCE.test(m)) || /!important/.test(a.value)) continue;
      for (const b of list) {
        if (b === a || b.media.length || !after(b, a) || b.value === a.value) continue;
        dead.push(`${a.file}:${a.line} ${a.sel} { ${a.prop} } under ${a.media.join(" ")} is overridden by ${b.file}:${b.line}`);
        break;
      }
    }
  }
  return dead;
}

test("detector: a later unconditional rule on the same selector kills a prefers-* declaration", () => {
  const css = (t) => [{ name: "a.css", text: t }];
  const layers = ["base", "top"];
  assert.equal(deadPrefersDeclarations(css("@layer base { @media (prefers-contrast: more) { .x { color: red; } } .x { color: blue; } }"), layers).length, 1);
  assert.equal(deadPrefersDeclarations(css("@layer base { .x { color: blue; } @media (prefers-contrast: more) { .x { color: red; } } }"), layers).length, 0);
  const two = [{ name: "a.css", text: "@layer base { @media (prefers-reduced-motion: reduce) { .x { animation: none; } } }" }, { name: "b.css", text: "@layer top { .x { animation: spin 1s; } }" }];
  assert.equal(deadPrefersDeclarations(two, layers).length, 1, "a higher layer wins regardless of order");
});

// Declarations known dead and deliberately left: each needs a reason, and the
// test fails when one stops being dead so the list cannot rot.
const KNOWN_DEAD = {
  // css/hud.css is mid-edit in another PR; the reduced-motion remedy is backstopped
  // by `#hud * { animation: none !important }` (hud.css) and html[data-motion=reduce].
  "hud.css .sec-row.sec-flash animation": "backstopped by the !important #hud reduce-motion rule",
};

const layers = (() => {
  const m = /@layer\s+([\w\s,-]+);/.exec(readFileSync(join(ROOT, "css/tokens.css"), "utf8"));
  assert.ok(m, "css/tokens.css declares the layer order");
  return m[1].split(",").map((x) => x.trim());
})();
const files = MANIFEST.CSS.map((f) => ({ name: f.replace(/^css\//, ""), text: readFileSync(join(ROOT, f), "utf8") }));

test("every prefers-*/pointer/hover/orientation @media declaration in css/ survives the cascade", () => {
  const dead = deadPrefersDeclarations(files, layers);
  const key = (d) => { const m = /^(\S+):\d+ (.+) \{ (\S+) \} under/.exec(d); return `${m[1]} ${m[2]} ${m[3]}`; };
  const unexpected = dead.filter((d) => !(key(d) in KNOWN_DEAD));
  assert.deepEqual(unexpected, [], "a prefers-* remedy is overridden: move it after the rule that beats it (or into the higher layer's sheet)");
  const stale = Object.keys(KNOWN_DEAD).filter((k) => !dead.some((d) => key(d) === k));
  assert.deepEqual(stale, [], "KNOWN_DEAD entry is no longer dead: delete it");
});

test("the solid-surface remedies exist for sheet, hub card and dim scrim", () => {
  const find = (file, sel) => {
    const f = files.find((x) => x.name === file);
    return parseCss(f.text).filter((r) => r.ctx.some((c) => /prefers-reduced-transparency/.test(c)) && r.ctx.some((c) => /prefers-contrast/.test(c)) && splitTop(r.selector, ",").includes(sel));
  };
  assert.equal(find("components.css", ".sheet").length, 1);
  assert.equal(find("data.css", ".dh-card").length, 1);
  assert.equal(find("dialogs.css", ".screen.dim").length, 1);
  assert.equal(find("dialogs.css", "#pausemenu.screen.dim").length, 1);
});
