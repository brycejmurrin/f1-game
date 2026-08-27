// backend-surface-parity — every name GLX publishes must be an OWN property of
// every other renderer backend. `undefined` is a fine value; ABSENT is not.
//
// WHY ABSENCE IS THE BUG. game.js installs an alternate backend by copying its
// descriptors onto GLX:
//
//     Object.defineProperties(GLX, Object.getOwnPropertyDescriptors(backend))
//
// so a name the backend does not carry KEEPS GLX'S OWN FUNCTION. That function
// closes over `gl` / `SHD` / `CHK`, which stay null because GLX.init() never
// ran under this backend. The result is the worst shape a missing feature can
// take: the value is a live function, so every feature test written the obvious
// way —
//
//     if (gfx.lampShadowBegin) …            // truthy!
//     if (!GLX.makeFrustumPlanes) return …  // never taken!
//
// — PASSES, and the call dies one line later inside GLX. A backend that
// declares the name `undefined` overwrites the inherited function, and the
// feature test tells the truth again.
//
// This has bitten twice, in the same shape. WGX inherited lampShadowBegin and
// threw inside a null SHD on every night frame, aborting tickBody before
// present() (js/game.js lampShadowBegin guard). Then TLX, which defined neither
// makeFrustumPlanes nor aabbInFrustum, made __apex.scene({visible}) throw on
// the three.js backend — past a guard that was checking for exactly this and
// could not see it. Both were found by reading, months apart. This test is so
// the third one is found by running.
//
// HOW IT READS THE SURFACE. The backends cannot be instantiated here — each
// needs a real GL/GPU context — so the surface is read from the source: the
// keys of the object literal each file returns, found from a shared anchor and
// bounded by that object's own indentation. Both key forms are recognised
// (`name:`/`name(` and bare `name,` shorthand, with or without a trailing
// comment). The counts asserted below are the tripwire for a scanner that
// silently stops matching — without them a regex that finds nothing reads as
// "no gaps".
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Present in all three backends, so it anchors the scan in each. (It is also
// the member whose absence from TLX is what prompted this file.)
const ANCHOR = "makeFrustumPlanes";

function surfaceOf(relPath) {
  const lines = fs.readFileSync(path.join(ROOT, relPath), "utf8").split("\n");
  const anchorRe = new RegExp(`^\\s+${ANCHOR}\\s*[:(]`);
  const i = lines.findIndex((l) => anchorRe.test(l));
  assert.ok(i >= 0, `${relPath}: no ${ANCHOR} declaration to anchor on`);

  // Keys of the enclosing object literal are the lines at exactly the anchor's
  // indentation; the object ends at the first line indented two less that
  // closes a block. Walking out in both directions from the anchor keeps this
  // bounded to the one object rather than the whole file.
  const ind = lines[i].match(/^\s*/)[0];
  const keyRe = new RegExp(`^${ind}([A-Za-z_$][\\w$]*)\\s*[:(]`);
  const shorthandRe = new RegExp(`^${ind}([A-Za-z_$][\\w$]*)\\s*,\\s*(//.*)?$`);
  const closeRe = new RegExp(`^${ind.slice(0, -2)}[}\\)]`);

  const out = new Set();
  for (const dir of [1, -1]) {
    for (let j = i; j >= 0 && j < lines.length; j += dir) {
      if (j !== i && closeRe.test(lines[j])) break;
      const m = keyRe.exec(lines[j]) || shorthandRe.exec(lines[j]);
      if (m) out.add(m[1]);
    }
  }
  return out;
}

const GLX_FILE = "js/render/glx.js";
const BACKENDS = [
  ["WGX (WebGPU)", "js/render/webgpu/wgx.js"],
  ["TLX (three.js/TSL)", "js/render/three/tlx.js"],
];

test("the scanner actually finds a surface in each backend", () => {
  // A scanner that matches nothing would report perfect parity. These are
  // deliberately loose floors — they catch "the regex broke", not growth.
  const glx = surfaceOf(GLX_FILE);
  assert.ok(glx.size >= 50, `GLX surface scan found only ${glx.size} keys`);   // actual 54 (2026-08-27)
  for (const [name, file] of BACKENDS) {
    const s = surfaceOf(file);
    assert.ok(s.size >= 55, `${name} surface scan found only ${s.size} keys`);   // actuals 64/61 (2026-08-27)
  }
});

test("every GLX member is declared by every other backend", () => {
  const glx = surfaceOf(GLX_FILE);
  for (const [name, file] of BACKENDS) {
    const theirs = surfaceOf(file);
    const missing = [...glx].filter((k) => !theirs.has(k)).sort();
    assert.deepEqual(missing, [],
      `${name} does not declare ${missing.length} GLX member(s): ${missing.join(", ")}\n\n` +
      `Because game.js installs a backend by descriptor-copy onto GLX, an absent\n` +
      `name keeps GLX's OWN function — which runs against a null gl/SHD/CHK\n` +
      `because GLX.init() never ran here. Every feature test for it passes and\n` +
      `then throws inside GLX.\n\n` +
      `Fix it in ${file} by either implementing the member, or declaring it\n` +
      `absent — \`${missing[0] || "name"}: undefined,\` — which is a real fix, not\n` +
      `a silencer: it makes \`if (gfx.${missing[0] || "name"})\` answer honestly.`);
  }
});
