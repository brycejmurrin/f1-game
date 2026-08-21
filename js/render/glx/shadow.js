/* Apex 26 — GLX shadow subsystem (split out of js/render/glx.js). Owns the static sun shadow map, the per-frame dynamic CAR map, the nearest-floodlight spot map, … */
"use strict";

const GLXShadow = (function () {

  function init(core) {
    const gl = core.gl;
    const { useProg, bindVAO, setBlend, setDepthMask, link, locs } = core;
    const { DEPTH_VS, DEPTH_FS, POST_VS, BLOCKER_FS } = GLXShaders;
    // Keyed on the DEVICE (IS_MOBILE), not the memory tier: GRAPHICS: HIGH on a
    // phone must not 4x the snap-cache redraw cost (terrain+road+whole city into
    // the map roughly every 10 m of travel) - that redraw frame was the periodic
    // HIGH-tier stall. 1024² also saves 12 MB on every phone.
    const SHADOW_SIZE = core.IS_MOBILE ? 1024 : 2048;
    const CAR_SHADOW_SIZE = 1024;                         // dynamic car-only shadow map (desktop tier)
    const LAMP_SHADOW_SIZE = 512;                         // nearest-floodlight spot map (desktop tier)

    let depthProg = null;
    let shadowMapFBO = null;
    let carShadowFBO = null;
    let lampShadowFBO = null;
    let blockerProg = null, blockerU = null, blockerFBO = null, blockerSampler = null;

    const S = {
      SIZE: SHADOW_SIZE,
      enabled: false,          // was shadowEnabled
      mapTex: null,            // was shadowMapTex
      lightVP: new Float32Array(16),   // was shadowLightVP
      pcssEnabled: false,
      blockerTex: null,
      depthU: null,
      // True only between a shadow/carShadow/lampShadow Begin that actually bound
      // its depth FBO + program and the matching End. castShadow/castShadowChunked
      // gate on THIS, not enabled: on the mobile tier the car/lamp maps are
      // never created, so their Begins no-op — but game.js still issues the caster
      // draws, which previously ran under whatever program/framebuffer was left
      // bound (per-draw GL errors + stray fills every frame = the "standard tier
      // is buggy and laggy" report). Mirrors WGX, whose casts no-op when no pass
      // is open.
      depthPassOn: false,      // was _depthPassOn
      castCullVP: null,        // was _castCullVP
      carEnabled: false, carTex: null, carLightVP: new Float32Array(16),
      carBoxScale: 1,          // cBox / default-42m — see carShadowBegin
      carArmed: false,         // set by carShadowBegin, cleared each present()
      carArms: 0,              // lifetime carShadowBegin count (debug introspection)
      lampEnabled: false, lampTex: null, lampLightVP: new Float32Array(16),
      lampArmed: false,        // set by lampShadowBegin, cleared each present()
      lampIdx: -1,             // frame.lights record index of the mapped lamp
      lampArms: 0,             // lifetime lampShadowBegin count (debug introspection)
      shadowBegin, castShadow, castShadowInstanced, shadowEnd,
      carShadowBegin, carShadowEnd,
      lampShadowBegin, lampShadowEnd,
    };

    function setup() {
      depthProg = link(DEPTH_VS, DEPTH_FS);
      if (!depthProg) return false;
      S.depthU = locs(depthProg, ["uModel", "uInstanced", "uLightVP"]);

      S.mapTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, S.mapTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE, 0,
        gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);

      shadowMapFBO = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowMapFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, S.mapTex, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      // ── Dynamic CAR shadow map: cars are NOT in the cached static map above (it
      // only re-renders on a snap-cell change, so a moving car would leave a stale
      // smear). This small map holds ONLY the car meshes and re-renders every
      // frame (~22 tiny body meshes — trivial), giving real sun-projected car
      // shadows with correct direction/length and car-on-car shadowing; the blob
      // decal stays as the contact-AO term. Desktop only: the mobile tier keeps
      // blob-only (memory + fill cost), and WGX has no car pass yet (game.js
      // guards on gfx.carShadowBegin).
      S.carEnabled = false;
      if (ok && !core.IS_MOBILE) {   // true desktop only - a per-frame pass is the HIGH-tier lag, not a memory cap
        S.carTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, S.carTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, CAR_SHADOW_SIZE, CAR_SHADOW_SIZE, 0,
          gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
        carShadowFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, carShadowFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, S.carTex, 0);
        S.carEnabled = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      S.lampEnabled = false;
      if (ok && !core.IS_MOBILE) {   // true desktop only - a per-frame pass is the HIGH-tier lag, not a memory cap
        S.lampTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, S.lampTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, LAMP_SHADOW_SIZE, LAMP_SHADOW_SIZE, 0,
          gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
        lampShadowFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, lampShadowFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, S.lampTex, 0);
        S.lampEnabled = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      S.pcssEnabled = false;
      if (ok) {
        blockerProg = link(POST_VS, BLOCKER_FS);
        if (blockerProg) {
          blockerU = locs(blockerProg, ["uDepthTex", "uSrcTexel"]);
          S.blockerTex = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, S.blockerTex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, 512, 512, 0, gl.RED, gl.HALF_FLOAT, null);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          blockerFBO = gl.createFramebuffer();
          gl.bindFramebuffer(gl.FRAMEBUFFER, blockerFBO);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, S.blockerTex, 0);
          S.pcssEnabled = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          if (S.pcssEnabled) {
            blockerSampler = gl.createSampler();
            gl.samplerParameteri(blockerSampler, gl.TEXTURE_COMPARE_MODE, gl.NONE);
            gl.samplerParameteri(blockerSampler, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.samplerParameteri(blockerSampler, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          }
        }
      }
      return ok;
    }

    function shadowBegin(lightVP) {
      if (!S.enabled) return;
      // Depth must be writable to clear/render the shadow map. This pass runs
      // before begin(), so declare the state explicitly rather than assuming it.
      setDepthMask(true);
      S.lightVP.set(lightVP);
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowMapFBO);
      gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      useProg(depthProg);
      gl.uniformMatrix4fv(S.depthU.uLightVP, false, lightVP);
      if (S.depthU.uInstanced) gl.uniform1f(S.depthU.uInstanced, 0);
      gl.disable(gl.CULL_FACE);  // render back faces to avoid peter-panning
      S.depthPassOn = true;
    }

    function castShadow(mesh, model) {
      if ((core.ctxGone && core.ctxGone()) || !S.depthPassOn || !mesh) return;
      bindVAO(mesh.vao);
      gl.uniformMatrix4fv(S.depthU.uModel, false, model);
      gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
    }

    function castShadowInstanced(batch, count) {
      if (!S.depthPassOn || !batch || !batch.instances) return;
      const n = count === undefined ? batch.instances : Math.min(count, batch.instances);
      if (n <= 0) return;
      // Full-set cast (default): the lit pass may have camera-repacked ibo to
      // only the visible slice — restore srcMatrices so casters behind the eye
      // that still hit the light frustum are present (TLX/WGX same contract).
      if (count === undefined && batch.srcMatrices && batch.ibo) {
        gl.bindBuffer(gl.ARRAY_BUFFER, batch.ibo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, batch.srcMatrices);
        batch._cullPlanes = null;
        // The buffer now holds the FULL set in source order — a stale repack
        // count would draw the wrong N props until the next cullInstances.
        batch.visible = batch.instances;
      }
      bindVAO(batch.vao);
      if (S.depthU.uInstanced) gl.uniform1f(S.depthU.uInstanced, 1);
      gl.drawElementsInstanced(gl.TRIANGLES, batch.count, batch.indexType, 0, n);
      if (S.depthU.uInstanced) gl.uniform1f(S.depthU.uInstanced, 0);
    }

    function shadowEnd() {
      S.depthPassOn = false;
      if (!S.enabled) return;
      gl.enable(gl.CULL_FACE);
      if (S.pcssEnabled) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, blockerFBO);
        gl.viewport(0, 0, 512, 512);
        useProg(blockerProg);
        // Attribute-less fullscreen triangle: bind the shared empty-ish VAO like
        // every other fullscreen pass (post.js) — whatever VAO the last caster
        // left bound may carry divisor-1 instanced attributes, and a strict
        // driver can reject enabled arrays the program never reads.
        bindVAO(core.skyVAO);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, S.mapTex);
        gl.bindSampler(0, blockerSampler);
        gl.uniform1i(blockerU.uDepthTex, 0);
        gl.uniform2f(blockerU.uSrcTexel, 1 / SHADOW_SIZE, 1 / SHADOW_SIZE);
        gl.disable(gl.DEPTH_TEST); setBlend(false);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindSampler(0, null);
        gl.enable(gl.DEPTH_TEST);
      }
      core.post.bindSceneTarget();
    }

    // Dynamic CAR shadow pass — same depth program/caster as shadowBegin, but
    // into the small per-frame car map. Runs before begin() each frame (game.js
    // guards on this method existing, so WGX silently keeps blob-only shadows).
    function carShadowBegin(lightVP, boxScale) {
      if (!S.carEnabled) return;
      setDepthMask(true);
      S.carLightVP.set(lightVP);
      S.carBoxScale = boxScale || 1;
      gl.bindFramebuffer(gl.FRAMEBUFFER, carShadowFBO);
      gl.viewport(0, 0, CAR_SHADOW_SIZE, CAR_SHADOW_SIZE);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      useProg(depthProg);
      gl.uniformMatrix4fv(S.depthU.uLightVP, false, lightVP);
      if (S.depthU.uInstanced) gl.uniform1f(S.depthU.uInstanced, 0);
      gl.disable(gl.CULL_FACE);   // back faces too, like the static pass
      S.depthPassOn = true;
      S.carArmed = true;
      S.carArms++;
    }

    function carShadowEnd() {
      S.depthPassOn = false;
      if (!S.carEnabled) return;
      gl.enable(gl.CULL_FACE);
      core.post.bindSceneTarget();
    }

    // Nearest-floodlight spot shadow pass — same depth program as the passes
    // above, into the 512² lamp map from a PERSPECTIVE lamp frustum. `lightIdx`
    // is the lamp's record index in this frame's frame.lights (the lit pass
    // gates its PCF to that loop slot; the godray pass re-maps it to its own
    // nearest-N ordering). game.js guards on this method existing, so WGX
    // silently keeps unshadowed lamp cones.
    function lampShadowBegin(lightVP, lightIdx) {
      if (!S.lampEnabled) return;
      setDepthMask(true);
      S.lampLightVP.set(lightVP);
      S.lampIdx = lightIdx | 0;
      gl.bindFramebuffer(gl.FRAMEBUFFER, lampShadowFBO);
      gl.viewport(0, 0, LAMP_SHADOW_SIZE, LAMP_SHADOW_SIZE);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      useProg(depthProg);
      gl.uniformMatrix4fv(S.depthU.uLightVP, false, lightVP);
      if (S.depthU.uInstanced) gl.uniform1f(S.depthU.uInstanced, 0);
      gl.disable(gl.CULL_FACE);   // back faces too, like the static pass
      S.castCullVP = S.lampLightVP;   // chunked casters cull to the lamp cone
      S.depthPassOn = true;
      S.lampArmed = true;
      S.lampArms++;
    }

    function lampShadowEnd() {
      S.depthPassOn = false;
      if (!S.lampEnabled) return;
      S.castCullVP = null;
      gl.enable(gl.CULL_FACE);
      core.post.bindSceneTarget();
    }

    S.enabled = setup();
    Log.info("gfx", "GLX shadow init on=" + (S.enabled ? 1 : 0));
    return S;
  }

  return { init };
})();
