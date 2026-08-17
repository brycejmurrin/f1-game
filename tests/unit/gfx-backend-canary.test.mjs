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
  assert.match(wgx, /pBlurHDR = fsPipe\(_Post\.BLUR, POST_HDR_FORMAT/);
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
