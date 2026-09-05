// flags.test.mjs — every circuit's country has a flag, and the markup is sane.
//
// js/ui/flags.js maps the `country` string each js/circuits/<id>.js writes to a
// drawn flag. A circuit whose country is missing from that table falls back to
// the chequered placeholder — which is fine at runtime and exactly the drift
// this test exists to catch: adding a circuit for a new country must add its
// flag, or the strip shows a chequered tile with a real name under it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
// The file is an IIFE assigning one const; evaluating it with a trailing
// `return` hands the global back without a browser.
const Flags = new Function(read("js/ui/flags.js") + "; return Flags;")();

function circuitCountries() {
  const dir = path.join(ROOT, "js", "circuits");
  const out = new Map();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".js"))) {
    const m = read(path.join("js", "circuits", f)).match(/country:\s*"([^"]+)"/);
    if (m) out.set(f.replace(/\.js$/, ""), m[1]);
  }
  return out;
}

test("every circuit country resolves to a drawn flag, not the placeholder", () => {
  const missing = [];
  for (const [id, country] of circuitCountries()) {
    const code = Flags.code(country);
    if (!code || !Flags.codes().includes(code)) missing.push(`${id} (${country})`);
  }
  assert.deepEqual(missing, [], "add the country to CODES and a recipe to RECIPES in js/ui/flags.js");
});

test("svg() is one self-contained <svg> with the code stamped on it", () => {
  for (const c of Flags.codes()) {
    const s = Flags.svg(c);
    assert.match(s, /^<svg data-flag="[a-z]{2}" viewBox="0 0 60 40"[^>]*aria-hidden="true">/, c);
    assert.ok(s.endsWith("</svg>"), c);
    assert.equal((s.match(/<svg/g) || []).length, 1, `${c}: no nested svg`);
    // Every fill is a colour literal — no url(), no script, nothing external.
    for (const m of s.matchAll(/fill="([^"]*)"/g)) assert.match(m[1], /^(#[0-9a-f]{3,6}|none)$/i, `${c}: ${m[1]}`);
  }
});

test("a country name works as well as a code; an unknown one is the chequered fallback", () => {
  assert.equal(Flags.svg("UK"), Flags.svg("gb"));
  assert.match(Flags.svg("Atlantis"), /data-flag="xx"/);
  assert.equal(Flags.code("Atlantis"), null);
  assert.match(Flags.svg("gb", { label: "United Kingdom" }), /role="img" aria-label="United Kingdom"/);
});
