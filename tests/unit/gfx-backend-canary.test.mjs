/* gfx-backend-canary.test.mjs — the RENDERER pick must survive the title menu.
 *
 * Title SETTINGS never presents a world frame (`render()` returns on !track
 * until the deferred flyby builds). A canary that stayed armed until present()
 * reverted THREE/WEBGPU to WEBGL2 on every refresh — computer and phone.
 *
 * Run: node --test tests/unit/gfx-backend-canary.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("#pm-renderer is visible in the SETTINGS markup (not hidden)", () => {
  const html = read("index.html");
  const m = html.match(/<button id="pm-renderer"[^>]*>/);
  assert.ok(m, "pm-renderer button exists");
  assert.doesNotMatch(m[0], /\bhidden\b/, "hidden on the tag hid RENDERER until game.js finished an async backend load");
});

test("boot canary disarms after a successful bind, not only after present()", () => {
  const game = read("js/game.js");
  const bind = game.indexOf("Object.defineProperties(GLX, Object.getOwnPropertyDescriptors(backend))");
  const present = game.indexOf("gfx.present(po);");
  const disarmAfterBind = game.indexOf("localStorage.removeItem(PROBE_KEY)", bind);
  assert.ok(bind > 0 && present > bind, "bind then present");
  assert.ok(disarmAfterBind > bind && disarmAfterBind < present,
    "PROBE_KEY must be cleared after Gfx.create() binds, before the first present — title has no track");
});

test("first world present re-arms the canary so a jetsam mid-frame still reverts", () => {
  const game = read("js/game.js");
  const present = game.indexOf("gfx.present(po);");
  const window = game.slice(present - 400, present + 280);
  assert.match(window, /setItem\("apex26\.gfxBackendProbe"/);
  assert.match(window, /removeItem\("apex26\.gfxBackendProbe"\)/);
});

test("RENDERER picker lives in gfx-quality.js and always names WEBGPU", () => {
  const src = read("js/game/gfx-quality.js");
  assert.match(src, /getElementById\("pm-renderer"\)/);
  assert.match(src, /WEBGPU \(UNAVAILABLE\)/);
  assert.match(src, /createElement\("select"\)/);
  assert.match(src, /pm-renderer-prev/);
  assert.match(src, /pm-renderer-next/);
  assert.doesNotMatch(read("js/game.js"), /getElementById\("pm-renderer"\)|\$\("pm-renderer"\)/);
});

test("TLX pins WebKit (Safari Mac + iOS) to three's WebGL2 backend", () => {
  const src = read("js/render/three/tlx.js");
  assert.match(src, /isWebKit/);
  assert.match(src, /forceWebGL = _glPin === "1" \? true : _glPin === "0" \? false : !!\(isMobile \|\| isWebKit\)/);
  assert.match(read("js/render/three/tsl-lit.js"), /cubeTexture\(envCubeNode, Rg, rough\.mul\(2\.5\)\)/);
});

test("a refused WGX/TLX create does not persist WEBGL2 over the user's pick", () => {
  const game = read("js/game.js");
  assert.match(game, /apex26\.gfxClaimFail/);
  assert.match(game, /armed && !skipClaim/);
  // The claim-fail reload must READ THE SKIP BACK first: with sessionStorage
  // blocked, removing the probe + reloading replays the claim-and-die boot
  // forever (the probe was the only other escape).
  assert.match(game, /skipped = sessionStorage\.getItem\("apex26\.gfxClaimFail"\) === "1"/);
  assert.match(game, /Live tab, create\(\) refused[\s\S]{0,400}removeItem\("apex26\.gfxBackendProbe"\)/);
  assert.match(game, /gfxClaimFail[\s\S]{0,220}removeItem\("apex26\.gfxBackendProbe"\)/);
  assert.doesNotMatch(game, /create\(\) refused[\s\S]{0,250}setItem\("apex26\.gfxBackend", "webgl2"\)/);
  const wgx = read("js/render/webgpu/wgx.js");
  assert.match(wgx, /device\.lost[\s\S]{0,400}_wgxEscalate/);
  assert.match(wgx, /function _wgxEscalate[\s\S]{0,2500}apex26\.gfxClaimFail/);
  assert.doesNotMatch(wgx, /device\.lost[\s\S]{0,2200}setItem\("apex26\.gfxBackend", "webgl2"\)/);
  assert.match(wgx, /WGX_LITE/);
  assert.match(wgx, /IS_WEBKIT/);
  assert.match(wgx, /WGX_LITE && format === "rgba16float"\) format = "bgra8unorm"/);
  assert.match(wgx, /const _sceneProbeOn = !_outProbeOff && !WGX_LITE/);
  assert.match(wgx, /_canTimestamp = !WGX_LITE/);
  assert.match(wgx, /apex26\.gfxWgxLite/);
  assert.match(wgx, /apex26\.gfxBound/);
  // begin/present throws land in the strike counter — never tick()'s overlay,
  // and never the old freeze-forever `_lost = true` latch for a healthy device.
  assert.match(wgx, /_jsStrike\("begin", e\)/);
  assert.match(wgx, /_jsStrike\("present", e\)/);
  assert.match(wgx, /JS_STRIKE_CAP/);
  // The ladder heals: a streak of clean sessions steps the rung back down.
  assert.match(wgx, /apex26\.gfxWgxOk/);
  assert.match(wgx, /HEAL_SESSIONS/);
  // Lazy mesh creation on the render path must degrade to inert, not throw.
  assert.match(wgx, /_allocFail\("createMesh", e\)/);
  assert.match(wgx, /_allocFail\("createChunkedMesh", e\)/);
  // The loss ladder: full → lite → minimal → GLX session skip. A loss must
  // climb a rung (persisted) and reload, never re-run the identical config.
  assert.match(wgx, /apex26\.gfxWgxLevel/);
  assert.match(wgx, /WGX_MINIMAL = _wgxLevel >= 2/);
  assert.match(wgx, /if \(!WGX_MINIMAL\) _buildPost\(\)/);
  assert.match(wgx, /if \(_lost \|\| WGX_MINIMAL \|\| !skyPipeline\) return null/);
  // A hand re-pick of WEBGPU resets the ladder so the player can retry full.
  const gq = read("js/game/gfx-quality.js");
  assert.match(gq, /removeItem\("apex26\.gfxWgxLevel"\)/);
  assert.match(gq, /removeItem\("apex26\.gfxWgxLite"\)/);
  assert.match(gq, /removeItem\("apex26\.gfxWgxFail"\)/);
});

test("RENDERER label names the live backend when WEBGPU fell back to GLX", () => {
  const src = read("js/game/gfx-quality.js");
  assert.match(src, /WEBGPU \(WEBGL2\)|backendLabel\(pref\) \+ " \(WEBGL2\)"/);
  assert.match(src, /apex26\.gfxBound/);
  assert.match(src, /apex-gfx-live/);
});

test("TLX HDR accepts iOS half-float and a refused create records why", () => {
  const post = read("js/render/three/tlx-post.js");
  assert.match(post, /EXT_color_buffer_half_float/);
  assert.match(post, /EXT_color_buffer_float/);
  assert.doesNotMatch(post, /keep hdr=true \(WebGPU is always half-float\)/);
  const tlx = read("js/render/three/tlx.js");
  assert.match(tlx, /apex26\.gfxTlxFail/);
  assert.match(tlx, /isMobile && !post\.hdrOk\(\)/);
  assert.match(tlx, /TLX: present failed/);
  assert.match(tlx, /MeshBasicMaterial/);
  assert.match(tlx, /apex26\.gfxClaimFail/);
  // The third context loss in a tab surrenders to GLX (TLX has a floor below
  // it, unlike GLX) instead of freezing on the last frame with the label lying.
  assert.match(tlx, /context lost x/);
  const present = tlx.indexOf("present(opts) {");
  const presentEnd = tlx.indexOf("// debug — the __tlx tooling", present);
  const body = tlx.slice(present, presentEnd);
  assert.ok(present > 0 && presentEnd > present, "present() body found");
  assert.doesNotMatch(body, /post = null;\s*renderer\.setRenderTarget\(null\);\s*renderer\.render/);
  assert.match(read("js/render/three/tlx-shadow.js"), /TLX: shadow pass failed/);
});

test("TLX material-map ownership keeps placeholders and reports pack state", () => {
  // Placeholders are always bound so nodes stay complete; materialMapState must
  // key off owned pack textures, and unload must dispose those without killing
  // the placeholders (GLX deleteTexture parity).
  const tlx = read("js/render/three/tlx.js");
  assert.match(tlx, /matPlaceAlbedo/);
  assert.match(tlx, /matOwnedAlbedo/);
  assert.match(tlx, /albedo: !!matOwnedAlbedo/);
  assert.doesNotMatch(tlx, /albedo: !!\(matMaps && matMaps\.albedo\)/);
  assert.match(tlx, /t\.dispose\(\)/);
  const wgx = read("js/render/webgpu/wgx.js");
  assert.match(wgx, /_matOwnedAlbedo/);
  assert.match(wgx, /matPlaceAlbedoView/);
  assert.match(wgx, /_releaseOwnedMatMaps/);
});

test("nextBackend / prevBackend wrap both ways around webgl2 → three → webgpu", () => {
  const src = read("js/game/gfx-quality.js");
  const ctx = vm.createContext({ window: {}, document: undefined, localStorage: undefined });
  vm.runInContext(src, ctx, { filename: "js/game/gfx-quality.js" });
  const G = vm.runInContext("GfxQuality", ctx);
  assert.equal(G.nextBackend("webgl2"), "three");
  assert.equal(G.nextBackend("three"), "webgpu");
  assert.equal(G.nextBackend("webgpu"), "webgl2");
  assert.equal(G.prevBackend("webgl2"), "webgpu");
  assert.equal(G.prevBackend("webgpu"), "three");
  assert.equal(G.prevBackend("three"), "webgl2");
  assert.equal(G.backendLabel("three"), "THREE");
  assert.equal(G.backendLabel("webgpu"), "WEBGPU");
});

function makeStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}

test("RESET RENDERER is injected next to #pm-renderer, not written into the shell", () => {
  const html = read("index.html");
  const src = read("js/game/gfx-quality.js");
  assert.doesNotMatch(html, /id="pm-renderer-reset"/);
  assert.match(src, /getElementById\("pm-renderer-reset"\)/);
  assert.match(src, /createElement\("button"\)/);
  assert.match(src, /RESET RENDERER/);
  assert.match(src, /insertBefore\(btn, slot\.nextSibling\)/);
});

test("clearRendererStorage drops backend crash flags and leaves GRAPHICS quality", () => {
  const src = read("js/game/gfx-quality.js");
  const ls = makeStorage({
    "apex26.gfxBackend": "three",
    "apex26.gfxBackendProbe": "three",
    "apex26.gfxWgxLevel": "2",
    "apex26.gfxWgxLite": "1",
    "apex26.gfxWgxOk": "0",
    "apex26.gfxWgxFail": "device lost",
    "apex26.gfxTlxFail": "present failed",
    "apex26.envProbeOff": "1",
    "apex26.perChunkOff": "1",
    "apex26.tlxForceGL": "0",
    "apex26.tlxViz": "lit",
    "apex26.gfxHigh": "1",
    "apex26.uiScale": "110",
  });
  const ss = makeStorage({
    "apex26.gfxClaimFail": "1",
    "apex26.gfxBound": "webgl2",
    "apex26.ctxLostReloads": "2",
  });
  const ctx = vm.createContext({ window: {}, document: undefined, localStorage: ls, sessionStorage: ss });
  vm.runInContext(src, ctx, { filename: "js/game/gfx-quality.js" });
  const G = vm.runInContext("GfxQuality", ctx);
  assert.ok(G.RENDERER_LS_KEYS.includes("apex26.gfxBackend"));
  assert.ok(G.RENDERER_LS_KEYS.includes("apex26.gfxTlxFail"));
  assert.ok(G.RENDERER_LS_KEYS.includes("apex26.envProbeOff"), "context-loss latches are renderer crash state");
  assert.ok(G.RENDERER_LS_KEYS.includes("apex26.perChunkOff"));
  assert.ok(G.RENDERER_SS_KEYS.includes("apex26.ctxLostReloads"));
  assert.ok(!G.RENDERER_LS_KEYS.includes("apex26.gfxHigh"), "GRAPHICS quality is not renderer state");
  const removed = G.clearRendererStorage();
  assert.ok(removed.includes("apex26.gfxBackend"));
  assert.equal(ls.getItem("apex26.gfxBackend"), null);
  assert.equal(ls.getItem("apex26.gfxBackendProbe"), null);
  assert.equal(ls.getItem("apex26.gfxWgxLevel"), null);
  assert.equal(ls.getItem("apex26.gfxTlxFail"), null);
  assert.equal(ls.getItem("apex26.envProbeOff"), null);
  assert.equal(ls.getItem("apex26.perChunkOff"), null);
  assert.equal(ls.getItem("apex26.tlxForceGL"), null);
  assert.equal(ls.getItem("apex26.tlxViz"), null);
  assert.equal(ls.getItem("apex26.gfxHigh"), "1", "mobile GRAPHICS: ULTRA bit must survive");
  assert.equal(ls.getItem("apex26.uiScale"), "110", "unrelated settings must survive");
  assert.equal(ss.getItem("apex26.gfxClaimFail"), null);
  assert.equal(ss.getItem("apex26.gfxBound"), null);
  assert.equal(ss.getItem("apex26.ctxLostReloads"), null);
  assert.equal(G.readBackend(), "webgl2");
});

test("blocked sessionStorage skips the opt-in so this tab never claims the canvas", () => {
  const game = read("js/game.js");
  const boot = game.slice(game.indexOf("let skipClaim = false"), game.indexOf("const PROBE_KEY"));
  assert.match(boot, /catch \(_\) \{ skipClaim = true;/);
  assert.doesNotMatch(boot, /try the opt-in as usual/);
});

test("RESET RENDERER click wipes storage, disarms the sentinel, and reloads", () => {
  const src = read("js/game/gfx-quality.js");
  const ls = makeStorage({ "apex26.gfxBackend": "webgpu", "apex26.gfxHigh": "0" });
  const ss = makeStorage({ "apex26.gfxClaimFail": "1" });
  const kids = [];
  const resetHost = {
    insertBefore(node, _ref) { kids.push(node); return node; },
  };
  const rendererBtn = { id: "pm-renderer", parentNode: resetHost, nextSibling: null };
  const gfxBtn = { id: "pm-gfx", textContent: "", hidden: true, onclick: null };
  const byId = { "pm-renderer": rendererBtn, "pm-gfx": gfxBtn };
  let reloaded = 0;
  let sentinel = true;
  const timers = [];
  const ctx = vm.createContext({
    window: { addEventListener() {} },
    document: {
      getElementById: (id) => byId[id] || null,
      createElement: (tag) => {
        const el = { tagName: tag, id: "", textContent: "", title: "", onclick: null };
        if (tag === "button") {
          Object.defineProperty(el, "id", {
            get() { return this._id || ""; },
            set(v) { this._id = v; byId[v] = this; },
          });
        }
        return el;
      },
      readyState: "complete",
      addEventListener() {},
    },
    localStorage: ls,
    sessionStorage: ss,
    location: { reload() { reloaded += 1; } },
    setTimeout: (fn) => { timers.push(fn); return 1; },
    PerfGov: { setUserTier() {}, sentinelArm(on) { sentinel = !!on; } },
    GameStore: { store: { get() { return null; }, set() {} } },
    GLX: { isMobile: true },
  });
  vm.runInContext(src, ctx, { filename: "js/game/gfx-quality.js" });
  const G = vm.runInContext("GfxQuality", ctx);
  G.init();
  const btn = byId["pm-renderer-reset"];
  assert.ok(btn, "reset button was injected");
  assert.equal(btn.textContent, "RESET RENDERER");
  assert.equal(kids[0], btn);
  btn.onclick();
  assert.equal(ls.getItem("apex26.gfxBackend"), null);
  assert.equal(ss.getItem("apex26.gfxClaimFail"), null);
  assert.equal(ls.getItem("apex26.gfxHigh"), "0");
  assert.equal(sentinel, false, "settings reload must not count as a crash strike");
  assert.match(btn.textContent, /RELOADING/);
  assert.equal(reloaded, 0);
  timers.forEach((fn) => fn());
  assert.equal(reloaded, 1);
});

test("GLX forwards tail-lights through per-chunk uploadLightSet and no-ops when the context is lost", () => {
  const glx = read("js/render/glx.js");
  assert.match(glx, /uploadLightSet:\s*\(L, idx, n, L2, o2, n2\)\s*=>\s*uploadLightSet\(L, idx, n, L2, o2, n2\)/);
  assert.match(glx, /function ctxGone\(\)/);
  const draw = glx.slice(glx.indexOf("function draw(mesh, modelMat, opts)"), glx.indexOf("function drawSky"));
  assert.match(draw, /ctxGone\(\)/);
  const present = glx.slice(glx.indexOf("present:"));
  assert.match(present, /ctxGone\(\)/);
});

test("WGX sky ports GLX overcast grey-shift, horizon bank, and azimuthal variation", () => {
  const sky = read("js/render/webgpu/wgsl-chunks.js");
  assert.match(sky, /nightLid/);
  assert.match(sky, /greyZ/);
  assert.match(sky, /bankThresh/);
  assert.match(sky, /atan2\(dir\.z,\s*dir\.x\)/);
  assert.doesNotMatch(sky, /Deliberately reduced vs GLX SKY_FS/);
});

test("WGX phone post targets use the slim GLX-equivalent formats", () => {
  const wgx = read("js/render/webgpu/wgx.js");
  assert.match(wgx, /SSAO_FORMAT\s*=\s*"r8unorm"/);
  assert.match(wgx, /POST_HDR_FORMAT\s*=\s*"rg11b10ufloat"/);
  // Blur pipelines use an explicit dynamic-offset layout (not fsPipe) so H/V
  // passes do not share one writeBuffer slot before submit.
  assert.match(wgx, /pBlurHDR\s*=\s*blurPipe\(POST_HDR_FORMAT\)/);
  assert.match(wgx, /pBlur\s*=\s*blurPipe\(SSAO_FORMAT\)/);
});

test("TLX present() records gfxBound when a fallback still paints", () => {
  const tlx = read("js/render/three/tlx.js");
  const persist = tlx.slice(tlx.indexOf("const persistFail"), tlx.indexOf("const paintCanvas"));
  assert.match(persist, /apex26\.gfxBound/);
});

function makePickerDom(byId, hostKids) {
  const makeEl = (tag) => {
    const kids = [];
    const el = {
      tagName: String(tag).toUpperCase(),
      textContent: "",
      title: "",
      type: "",
      value: "",
      hidden: false,
      onclick: null,
      parentNode: null,
      nextSibling: null,
      children: kids,
      options: String(tag).toUpperCase() === "SELECT" ? kids : undefined,
      _listeners: {},
      setAttribute() {},
      appendChild(c) { kids.push(c); c.parentNode = this; return c; },
      addEventListener(type, fn) {
        (this._listeners[type] || (this._listeners[type] = [])).push(fn);
      },
      dispatchEvent(type) {
        const list = this._listeners[type] || [];
        for (let i = 0; i < list.length; i++) list[i]();
      },
      replaceWith(node) {
        const host = this.parentNode;
        if (host && host.children) {
          const i = host.children.indexOf(this);
          if (i >= 0) host.children[i] = node;
        }
        node.parentNode = host;
        node.nextSibling = this.nextSibling;
        if (this._id && byId[this._id] === this) delete byId[this._id];
      },
    };
    Object.defineProperty(el, "id", {
      get() { return this._id || ""; },
      set(v) {
        if (this._id && byId[this._id] === this) delete byId[this._id];
        this._id = v;
        if (v) byId[v] = this;
      },
    });
    return el;
  };
  const host = {
    children: hostKids,
    insertBefore(node, ref) {
      const i = ref ? hostKids.indexOf(ref) : -1;
      if (i >= 0) hostKids.splice(i, 0, node);
      else hostKids.push(node);
      node.parentNode = host;
      return node;
    },
    replaceChild(node, old) {
      const i = hostKids.indexOf(old);
      if (i >= 0) hostKids[i] = node;
      node.parentNode = host;
      return old;
    },
  };
  const btn = makeEl("button");
  btn.id = "pm-renderer";
  btn.parentNode = host;
  hostKids.push(btn);
  return { host, btn, makeEl };
}

function bootPicker(opts) {
  const src = read("js/game/gfx-quality.js");
  const ls = makeStorage(opts.ls || {});
  const ss = makeStorage(opts.ss || {});
  const hostKids = [];
  const byId = {};
  const { makeEl } = makePickerDom(byId, hostKids);
  const gfxBtn = makeEl("button");
  gfxBtn.id = "pm-gfx";
  gfxBtn.hidden = true;
  let reloaded = 0;
  const timers = [];
  const ctx = vm.createContext({
    window: { addEventListener() {} },
    document: {
      getElementById: (id) => byId[id] || null,
      createElement: makeEl,
      readyState: "complete",
      addEventListener() {},
    },
    localStorage: ls,
    sessionStorage: ss,
    location: { reload() { reloaded += 1; } },
    setTimeout: (fn) => { timers.push(fn); return 1; },
    navigator: { gpu: opts.gpu || undefined },
    PerfGov: { setUserTier() {}, sentinelArm() {} },
    GameStore: { store: { get() { return null; }, set() {} } },
    GLX: { isMobile: true },
  });
  vm.runInContext(src, ctx, { filename: "js/game/gfx-quality.js" });
  const G = vm.runInContext("GfxQuality", ctx);
  // readyState is "complete", so the IIFE already called init().
  return { G, ls, ss, byId, hostKids, reloaded: () => reloaded, timers };
}

test("RENDERER control becomes a select with prev/next, not a one-way cycle", () => {
  const { byId, hostKids } = bootPicker({ ls: { "apex26.gfxBackend": "webgl2" } });
  const sel = byId["pm-renderer"];
  assert.equal(sel.tagName, "SELECT");
  assert.equal(sel.value, "webgl2");
  assert.equal(sel.options.length, 3);
  assert.equal(sel.options[0].value, "webgl2");
  assert.equal(sel.options[1].value, "three");
  assert.equal(sel.options[2].value, "webgpu");
  assert.ok(byId["pm-renderer-prev"], "‹ steps backward");
  assert.ok(byId["pm-renderer-next"], "› steps forward");
  assert.equal(byId["pm-renderer-row"].children.length, 3);
  assert.ok(hostKids.some((n) => n.id === "pm-renderer-reset"));
});

test("selecting THREE persists the pick and reloads; WEBGPU without gpu does not", () => {
  const a = bootPicker({ ls: { "apex26.gfxBackend": "webgl2" } });
  const sel = a.byId["pm-renderer"];
  sel.value = "three";
  sel.dispatchEvent("change");
  assert.equal(a.ls.getItem("apex26.gfxBackend"), "three");
  assert.equal(a.reloaded(), 0);
  a.timers.forEach((fn) => fn());
  assert.equal(a.reloaded(), 1);

  const b = bootPicker({ ls: { "apex26.gfxBackend": "webgl2" }, gpu: undefined });
  const selB = b.byId["pm-renderer"];
  selB.value = "webgpu";
  selB.dispatchEvent("change");
  assert.equal(b.ls.getItem("apex26.gfxBackend"), "webgl2", "unavailable WEBGPU must not persist");
  assert.match(selB.options[2].textContent, /UNAVAILABLE/);
  assert.equal(b.reloaded(), 0);
});

test("‹ from WEBGL2 jumps to WEBGPU without opening THREE", () => {
  const { byId, ls, timers, reloaded } = bootPicker({
    ls: { "apex26.gfxBackend": "webgl2" },
    gpu: {},
  });
  byId["pm-renderer-prev"].onclick();
  assert.equal(ls.getItem("apex26.gfxBackend"), "webgpu");
  assert.equal(ls.getItem("apex26.gfxWgxFail"), null);
  timers.forEach((fn) => fn());
  assert.equal(reloaded(), 1);
});

/* ── TLX canvas opacity — the "transparent cars on iPhone" guard ─────────
 *
 * The defect this pins, end to end:
 *
 *   1. The lit fragment writes the SSR car-paint TAG — 0.35 — into ALPHA
 *      (js/render/three/tsl-lit.js, gated on ctx.ssrTag). It is a CHANNEL for
 *      the post chain, not an opacity, and the post chain's own passes all
 *      output alpha 1.0, so the canvas never normally sees it.
 *   2. present() has a "post-only death" path: when the post chain throws it
 *      sets post = null and paints the scene STRAIGHT TO THE CANVAS with the
 *      same lit materials. Nothing rebuilds them, so from that frame on the tag
 *      is written to the canvas — for the rest of the session.
 *   3. three's canvas is alpha-composited by default. So the browser reads that
 *      0.35 as opacity and the painted bodywork of every car goes 35%
 *      see-through. Only the bodywork: tyres, carbon, glass and wings keep
 *      alpha = the material's own, which is 1.
 *
 * GLX cannot hit this because it asks for `alpha: false` (js/render/glx.js), so
 * the compositor ignores whatever it writes to alpha. TLX has to say the same
 * thing, and — the part worth a test — it has to say it TWICE, because three's
 * two backends read different inputs and neither reads the other's. Those two
 * vendor behaviours are asserted against the bundled three below, so a three
 * upgrade that changes either one fails HERE, next to the reason, instead of
 * turning back into a bug report from a phone.
 *
 */
const TLX = read("js/render/three/tlx.js");
const GLX = read("js/render/glx.js");
const TSL_LIT = read("js/render/three/tsl-lit.js");
const THREE_BUNDLE = read("vendor/three-0.185.1/three.webgpu.min.js");

/** The object literal passed to `new THREE.WebGPURenderer({...})`, brace-matched
 *  (it spans ~40 lines of comment, so a regex over one line cannot see it). */
function rendererParams() {
  const at = TLX.indexOf("new THREE.WebGPURenderer(");
  assert.notEqual(at, -1, "the renderer construction moved");
  const open = TLX.indexOf("{", at);
  let depth = 0;
  let i = open;
  for (; i < TLX.length; i++) {
    if (TLX[i] === "{") depth++;
    else if (TLX[i] === "}" && --depth === 0) break;
  }
  // Comments quote `alpha: false` when explaining it; only code may answer.
  return TLX.slice(open, i + 1).replace(/^[ \t]*\/\/.*$/gm, "");
}

test("GLX asks for an opaque canvas — the behaviour TLX has to match", () => {
  const src = GLX.replace(/^[ \t]*\/\/.*$/gm, "");
  const at = src.indexOf('getContext("webgl2"');
  assert.notEqual(at, -1, "GLX's context creation moved");
  assert.match(src.slice(at, at + 300), /alpha:\s*false/,
    "GLX dropped `alpha: false` — then the tag can ghost cars on BOTH backends " +
    "and this whole guard needs rethinking, not updating");
});

test("the alpha tag that makes canvas opacity load-bearing still exists", () => {
  // If this ever stops being true the coupling is gone and the two assertions
  // below are merely tidy rather than load-bearing. Worth knowing which.
  const src = TSL_LIT.replace(/^[ \t]*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");
  assert.match(src, /SSR_TAG\s*\?[\s\S]{0,160}float\(0\.35\)/,
    "the SSR car-paint alpha tag moved — re-derive whether an alpha canvas can " +
    "still ghost the cars before touching the guards below");
});

test("TLX asks for an opaque canvas on the WebGPU backend", () => {
  assert.match(rendererParams(), /(^|[{,\s])alpha:\s*false/,
    "TLX must pass alpha:false — three's WebGPU backend turns it into " +
    'alphaMode "opaque"');
});

test("TLX copies matrix → matrixWorld on every pooled mesh (cars otherwise sit at origin)", () => {
  // scene.matrixWorldAutoUpdate is false; three uploads matrixWorld as the
  // model matrix. Writing only `.matrix` left cars/flaps/shadows at identity —
  // invisible on track (world-space chase cam), fine in the garage (car near
  // origin). World-baked track still looked correct with identity.
  const src = TLX.replace(/^[ \t]*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");
  assert.match(src, /matrixWorldAutoUpdate\s*=\s*false/,
    "matrixWorldAutoUpdate latch moved — re-check whether acquireMesh still must promote");
  const acq = src.indexOf("function acquireMesh");
  assert.notEqual(acq, -1, "acquireMesh moved");
  const body = src.slice(acq, acq + 900);
  assert.match(body, /matrixWorld\.copy\(\s*m\.matrix\s*\)/,
    "acquireMesh must promote m.matrix into matrixWorld — without it every " +
    "draw() with a non-identity model (cars) renders at the world origin");
});

test("three's WebGPU backend still maps the alpha parameter to the canvas alphaMode", () => {
  // Makes the assertion above SUFFICIENT for that backend. If three stops
  // reading the parameter, alpha:false becomes a no-op and cars ghost again on
  // desktop WebGPU with nothing failing.
  assert.match(THREE_BUNDLE, /alpha\s*\?\s*"premultiplied"\s*:\s*"opaque"/,
    "bundled three no longer derives alphaMode from the alpha parameter");
});

test("TLX supplies its own WebGL2 context, because three hardcodes alpha there", () => {
  const params = rendererParams();
  assert.match(params, /context:/,
    "the WebGL path needs a caller-supplied context: three ignores alpha:false there");

  // The context TLX makes must itself be opaque, and must only be made for the
  // WebGL path — three's WebGPU backend reads parameters.context too and would
  // try to configure a WebGL2 context as a WebGPU one.
  const at = TLX.indexOf('getContext("webgl2"');
  assert.notEqual(at, -1, "TLX no longer creates its own WebGL2 context");
  const call = TLX.slice(at, at + 500);
  assert.match(call, /alpha:\s*false/, "TLX's own context must be opaque");
  const guard = TLX.slice(Math.max(0, at - 400), at);
  assert.match(guard, /if\s*\(\s*forceWebGL\s*\)/,
    "the hand-made WebGL2 context must be gated on forceWebGL");
});

test("the hand-made WebGL2 context still matches three's own attribute set", () => {
  // Supplying `context` means three stops deriving the attributes and we own
  // ALL of them, not just the one we came to change. Today ours is three's set
  // byte for byte except alpha:
  //   three: { antialias: currentSamples > 0, alpha: !0, depth: e.depth, stencil: e.stencil }
  //   ours:  { antialias: !isMobile,           alpha: false, depth: true,  stencil: false }
  // and those agree only because TLX overrides neither depth nor stencil, so
  // the renderer holds three's defaults — depth true, stencil false. Should a
  // three bump default stencil back to true, its passes would want a stencil
  // buffer that our context never asked for, and nothing else would notice.
  assert.match(THREE_BUNDLE, /depth:\w+=!0,stencil:\w+=!1/,
    "three's depth/stencil defaults moved — re-derive the context TLX hands it");

  const tlx = read("js/render/three/tlx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  const ctx = tlx.match(/getContext\("webgl2",\s*\{([^}]*)\}/);
  assert.ok(ctx, "TLX no longer makes its own WebGL2 context");
  assert.match(ctx[1], /depth:\s*true/, "context must request depth (three's default)");
  assert.match(ctx[1], /stencil:\s*false/, "context must match three's stencil default");
  // Not cosmetic either: three's antialias becomes samples>0 on the DEFAULT
  // canvas target, so a context that disagrees with the renderer gets a
  // multisample resolve mismatch on the very path this fix exists to protect.
  assert.match(ctx[1], /antialias:\s*!isMobile/, "context AA must track the renderer's");
  assert.match(tlx, /antialias:\s*!isMobile,\s*forceWebGL/, "renderer AA must track the context's");
});

test("WGX's canvas is opaque too — it writes the same tag with NO gate", () => {
  // The tag is not a TLX idea: WGX writes it from the same GLX lineage —
  //   return vec4<f32>(color, select(alpha, 0.35, carPaint > 0.001));
  // — and unlike TLX's, that line has no ssrTag gate at all, so EVERY WGX frame
  // carries 0.35 over car paint whether or not anything reads it. What makes
  // that safe is one word in the context configure, and nothing was checking
  // it. All three backends now hold the same invariant for the same reason:
  // GLX `alpha: false`, WGX `alphaMode: "opaque"`, TLX both spellings.
  const wgx = read("js/render/webgpu/wgx.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(wgx, /\.configure\(\{[^}]*alphaMode:\s*"opaque"/,
    "WGX must configure an OPAQUE canvas — it tags alpha on every frame");

  const chunks = read("js/render/webgpu/wgsl-chunks.js").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.match(chunks, /select\(alpha,\s*0\.35,\s*carPaint\s*>\s*0\.001\)/,
    "the ungated WGX car-paint tag moved — recheck what its canvas opacity is carrying");
});

test("three's WebGL backend still hardcodes an alpha canvas (why we pass a context)", () => {
  // Makes the assertion above NECESSARY. When three starts honouring the
  // parameter on this backend, the hand-made context can go — and this is the
  // test that says so, instead of it sitting there forever as cargo cult.
  const at = THREE_BUNDLE.indexOf('getContext("webgl2",');
  assert.notEqual(at, -1, "three's WebGL context creation moved");
  const attrs = THREE_BUNDLE.slice(Math.max(0, at - 260), at);
  assert.match(attrs, /alpha:\s*!0/,
    "bundled three no longer hardcodes alpha:true for WebGL — drop TLX's " +
    "hand-made context and pass alpha:false alone");
  assert.match(THREE_BUNDLE.slice(at, at + 60), /getContext\("webgl2",\s*\w+\)/);
});
