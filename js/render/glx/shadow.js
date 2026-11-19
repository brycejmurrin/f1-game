"use strict";

const GLXShadow = (function () {

  function init(core) {
    const gl = core.gl;
    const { useProg, bindVAO, setBlend, setDepthMask, link, locs } = core;
    const { DEPTH_VS, DEPTH_FS, POST_VS, BLOCKER_FS } = GLXShaders;
    const SHADOW_SIZE = core.IS_MOBILE ? 1024 : 2048;
    const CAR_SHADOW_SIZE = 1024;
    const LAMP_SHADOW_SIZE = 512;

    let depthProg = null;
    let shadowMapFBO = null;
    let carShadowFBO = null;
    let lampShadowFBO = null;
    let blockerProg = null, blockerU = null, blockerFBO = null, blockerSampler = null;

    const S = {
      SIZE: SHADOW_SIZE,
      enabled: false,
      mapTex: null,
      lightVP: new Float32Array(16),
      pcssEnabled: false,
      blockerTex: null,
      depthU: null,
      depthPassOn: false,
      castCullVP: null,
      carEnabled: false, carTex: null, carLightVP: new Float32Array(16),
      carBoxScale: 1,
      carArmed: false,
      carArms: 0,
      lampEnabled: false, lampTex: null, lampLightVP: new Float32Array(16),
      lampArmed: false,
      lampIdx: -1,
      lampArms: 0,
      shadowBegin, castShadow, castShadowInstanced, shadowEnd,
      carShadowBegin, carShadowEnd,
      lampShadowBegin, lampShadowEnd,
      carShadowKeep, lampShadowKeep,
    };

    function carShadowKeep() {
      if (!S.carEnabled || S.carArms <= 0) return false;
      S.carArmed = true;
      return true;
    }
    function lampShadowKeep(lightIdx) {
      if (!S.lampEnabled || S.lampArms <= 0 || !(lightIdx >= 0)) return false;
      S.lampIdx = lightIdx | 0;
      S.lampArmed = true;
      return true;
    }

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

      S.carEnabled = false;
      if (ok && !core.IS_MOBILE) {
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
      if (ok && !core.IS_MOBILE) {
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
      if (ok && !core.IS_MOBILE) {
        blockerProg = link(POST_VS, BLOCKER_FS);
        if (blockerProg) {
          blockerU = locs(blockerProg, ["uDepthTex"]);
          S.blockerTex = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, S.blockerTex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 512, 512, 0, gl.RED, gl.FLOAT, null);
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

    function gone() { return !!(core.ctxGone && core.ctxGone()); }
    function disarmPass() { S.depthPassOn = false; S.castCullVP = null; }

    function shadowBegin(lightVP) {
      if (!S.enabled || gone()) { disarmPass(); return; }
      setDepthMask(true);
      S.castCullVP = null;
      S.lightVP.set(lightVP);
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowMapFBO);
      gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      useProg(depthProg);
      gl.uniformMatrix4fv(S.depthU.uLightVP, false, lightVP);
      if (S.depthU.uInstanced) gl.uniform1f(S.depthU.uInstanced, 0);
      gl.disable(gl.CULL_FACE);
      S.depthPassOn = true;
    }

    function castShadow(mesh, model) {
      if (gone() || !S.depthPassOn || !mesh) return;
      bindVAO(mesh.vao);
      gl.uniformMatrix4fv(S.depthU.uModel, false, model);
      gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
    }

    function _shadowVAO(batch) {
      if (batch._shVao) return batch._shVao;
      if (!batch.vbo || !batch.ib || !batch.shadowIbo) return null;
      const v = gl.createVertexArray();
      if (!v) return null;
      gl.bindVertexArray(v);
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.vbo);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, batch.trk ? VertexPack.STRIDE_TRK : VertexPack.STRIDE, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, batch.ib);
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.shadowIbo);
      for (let c = 0; c < 4; c++) {
        gl.enableVertexAttribArray(5 + c);
        gl.vertexAttribPointer(5 + c, 4, gl.FLOAT, false, 64, c * 16);
        gl.vertexAttribDivisor(5 + c, 1);
      }
      gl.bindVertexArray(null);
      core.invalidateVAO();
      batch._shVao = v;
      return v;
    }

    function castShadowInstanced(batch, count) {
      if (gone() || !S.depthPassOn || !batch || !batch.instances) return;
      const n = count === undefined ? batch.instances : Math.min(count, batch.instances);
      if (n <= 0) return;
      if (count === undefined && batch.srcMatrices && batch.ibo) {
        gl.bindBuffer(gl.ARRAY_BUFFER, batch.ibo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, batch.srcMatrices);
        batch._cullPlanes = null;
        batch._cellKeyN = -1;
        batch.visible = batch.instances;
      } else if (count !== undefined && batch.shadowIbo && batch._shadowN === n) {
        const sv = _shadowVAO(batch);
        if (sv) {
          bindVAO(sv);
          if (S.depthU.uInstanced) gl.uniform1f(S.depthU.uInstanced, 1);
          gl.drawElementsInstanced(gl.TRIANGLES, batch.count, batch.indexType, 0, n);
          if (S.depthU.uInstanced) gl.uniform1f(S.depthU.uInstanced, 0);
        }
        return;
      }
      bindVAO(batch.vao);
      if (S.depthU.uInstanced) gl.uniform1f(S.depthU.uInstanced, 1);
      gl.drawElementsInstanced(gl.TRIANGLES, batch.count, batch.indexType, 0, n);
      if (S.depthU.uInstanced) gl.uniform1f(S.depthU.uInstanced, 0);
    }

    function shadowEnd() {
      S.depthPassOn = false;
      if (!S.enabled || gone()) return;
      gl.enable(gl.CULL_FACE);
      if (S.pcssEnabled) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, blockerFBO);
        gl.viewport(0, 0, 512, 512);
        useProg(blockerProg);
        bindVAO(core.skyVAO);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, S.mapTex);
        gl.bindSampler(0, blockerSampler);
        gl.uniform1i(blockerU.uDepthTex, 0);
        gl.disable(gl.DEPTH_TEST); setBlend(false);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindSampler(0, null);
        gl.enable(gl.DEPTH_TEST);
      }
      core.post.bindSceneTarget();
    }

    function carShadowBegin(lightVP, boxScale) {
      if (!S.carEnabled || gone()) { disarmPass(); return; }
      setDepthMask(true);
      S.carLightVP.set(lightVP);
      S.carBoxScale = boxScale || 1;
      gl.bindFramebuffer(gl.FRAMEBUFFER, carShadowFBO);
      gl.viewport(0, 0, CAR_SHADOW_SIZE, CAR_SHADOW_SIZE);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      useProg(depthProg);
      gl.uniformMatrix4fv(S.depthU.uLightVP, false, lightVP);
      if (S.depthU.uInstanced) gl.uniform1f(S.depthU.uInstanced, 0);
      gl.disable(gl.CULL_FACE);
      S.castCullVP = S.carLightVP;
      S.depthPassOn = true;
      S.carArmed = true;
      S.carArms++;
    }

    function carShadowEnd() {
      S.depthPassOn = false;
      S.castCullVP = null;
      if (!S.carEnabled || gone()) return;
      gl.enable(gl.CULL_FACE);
      core.post.bindSceneTarget();
    }

    function lampShadowBegin(lightVP, lightIdx) {
      if (!S.lampEnabled || gone()) { disarmPass(); return; }
      setDepthMask(true);
      S.lampLightVP.set(lightVP);
      S.lampIdx = lightIdx | 0;
      gl.bindFramebuffer(gl.FRAMEBUFFER, lampShadowFBO);
      gl.viewport(0, 0, LAMP_SHADOW_SIZE, LAMP_SHADOW_SIZE);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      useProg(depthProg);
      gl.uniformMatrix4fv(S.depthU.uLightVP, false, lightVP);
      if (S.depthU.uInstanced) gl.uniform1f(S.depthU.uInstanced, 0);
      gl.disable(gl.CULL_FACE);
      S.castCullVP = S.lampLightVP;
      S.depthPassOn = true;
      S.lampArmed = true;
      S.lampArms++;
    }

    function lampShadowEnd() {
      S.depthPassOn = false;
      S.castCullVP = null;
      if (!S.lampEnabled || gone()) return;
      gl.enable(gl.CULL_FACE);
      core.post.bindSceneTarget();
    }

    S.enabled = setup();
    Log.info("gfx", "GLX shadow init on=" + (S.enabled ? 1 : 0));
    return S;
  }

  return { init };
})();
Object.freeze(GLXShadow);
