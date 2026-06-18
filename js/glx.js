/*
 * Apex 26 — WebGL2 renderer.
 * One standard lit shader (hemisphere ambient + lambert sun + exp2 fog),
 * a sky shader (fullscreen triangle via gl_VertexID) and a blob-shadow quad.
 */
"use strict";

const GLX = (function () {
  const LIT_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 aCol;
uniform mat4 uModel;
uniform mat4 uViewProj;
uniform vec3 uEye;
out vec3 vNrm;
out vec3 vCol;
out float vDist;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vNrm = mat3(uModel) * aNrm;
  vCol = aCol;
  vDist = length(wp.xyz - uEye);
  gl_Position = uViewProj * wp;
}`;

  const LIT_FS = `#version 300 es
precision mediump float;
in vec3 vNrm;
in vec3 vCol;
in float vDist;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbGround;
uniform vec3 uAmbSky;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uEmissive;
uniform float uAlpha;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNrm);
  vec3 amb = mix(uAmbGround, uAmbSky, n.y * 0.5 + 0.5);
  vec3 lit = vCol * (amb + uSunColor * max(dot(n, uSunDir), 0.0));
  vec3 c = mix(lit, vCol, uEmissive);
  float fd = vDist * uFogDensity;
  float f = 1.0 - exp(-fd * fd);
  outColor = vec4(mix(c, uFogColor, f), uAlpha);
}`;

  const SKY_VS = `#version 300 es
uniform mat4 uInvViewProj;
out vec3 vDir;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  gl_Position = vec4(p, 1.0, 1.0); // z = w -> depth 1.0 (far plane)
  vec4 a = uInvViewProj * vec4(p, -1.0, 1.0);
  vec4 b = uInvViewProj * vec4(p, 1.0, 1.0);
  vDir = b.xyz / b.w - a.xyz / a.w;
}`;

  const SKY_FS = `#version 300 es
precision mediump float;
in vec3 vDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uStars;
out vec4 outColor;
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
void main() {
  vec3 dir = normalize(vDir);
  vec3 c = mix(uHorizon, uZenith, pow(max(dir.y, 0.0), 0.6));
  c += pow(max(dot(dir, uSunDir), 0.0), 350.0) * uSunColor;
  if (uStars > 0.5 && dir.y > 0.05) {
    float h = hash3(floor(dir * 180.0));
    c += vec3(smoothstep(0.9975, 1.0, h)) * 0.9;
  }
  outColor = vec4(c, 1.0);
}`;

  const SHADOW_VS = `#version 300 es
layout(location=0) in vec2 aPos; // unit quad, -0.5..0.5 in x/z
uniform mat4 uModel;
uniform mat4 uViewProj;
uniform vec2 uSize; // w, l in meters
out vec2 vUV;
void main() {
  vUV = aPos * 2.0; // -1..1
  vec4 wp = uModel * vec4(aPos.x * uSize.x, 0.02, aPos.y * uSize.y, 1.0);
  gl_Position = uViewProj * wp;
}`;

  const SHADOW_FS = `#version 300 es
precision mediump float;
in vec2 vUV;
out vec4 outColor;
void main() {
  float r = length(vUV);
  float a = 0.45 * (1.0 - smoothstep(0.25, 1.0, r));
  outColor = vec4(0.0, 0.0, 0.0, a);
}`;

  // Flat rectangular skid-mark stamp (x=lateral, y=along-travel in normalised -1..1 space)
  const MARK_FS = `#version 300 es
precision mediump float;
in vec2 vUV;
out vec4 outColor;
void main() {
  float a = 0.38 * smoothstep(1.0, 0.4, abs(vUV.x)) * smoothstep(1.0, 0.3, abs(vUV.y));
  outColor = vec4(0.0, 0.0, 0.0, a);
}`;

  let gl = null;
  let canvas = null;
  let litProg = null, litU = null;
  let skyProg = null, skyU = null;
  let shadowProg = null, shadowU = null;
  let markProg = null, markU = null;
  let skyVAO = null;     // empty VAO (WebGL2 still needs one bound)
  let shadowVAO = null;
  let width = 0, height = 0, aspect = 1;
  let frameViewProj = null;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error("GLX shader compile failed:\n" + gl.getShaderInfoLog(sh) + "\n" + src);
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function link(vsSrc, fsSrc) {
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("GLX program link failed: " + gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }

  function locs(prog, names) {
    const u = {};
    for (const n of names) u[n] = gl.getUniformLocation(prog, n);
    return u;
  }

  function init(canvasEl) {
    canvas = canvasEl;
    gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    if (!gl) return false;

    litProg = link(LIT_VS, LIT_FS);
    skyProg = link(SKY_VS, SKY_FS);
    shadowProg = link(SHADOW_VS, SHADOW_FS);
    markProg = link(SHADOW_VS, MARK_FS);
    if (!litProg || !skyProg || !shadowProg || !markProg) return false;

    litU = locs(litProg, ["uModel", "uViewProj", "uEye", "uSunDir", "uSunColor",
      "uAmbGround", "uAmbSky", "uFogColor", "uFogDensity", "uEmissive", "uAlpha"]);
    skyU = locs(skyProg, ["uInvViewProj", "uZenith", "uHorizon", "uSunDir", "uSunColor", "uStars"]);
    shadowU = locs(shadowProg, ["uModel", "uViewProj", "uSize"]);
    markU = locs(markProg, ["uModel", "uViewProj", "uSize"]);

    skyVAO = gl.createVertexArray();

    // Cached unit quad for blob shadows (xz plane, CCW seen from +Y).
    shadowVAO = gl.createVertexArray();
    gl.bindVertexArray(shadowVAO);
    const qv = new Float32Array([-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5]);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, qv, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const qi = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, qi);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    resize();
    return true;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    width = w;
    height = h;
    aspect = w / h;
  }

  function toF32(a) {
    return a instanceof Float32Array ? a : new Float32Array(a);
  }

  function createMesh(data) {
    const pos = toF32(data.pos);
    const nrm = toF32(data.nrm);
    const col = toF32(data.col);
    let idx = data.idx;
    const big = pos.length / 3 > 65535;
    if (idx instanceof Uint16Array || idx instanceof Uint32Array) {
      if (big && idx instanceof Uint16Array) idx = new Uint32Array(idx);
    } else {
      idx = big ? new Uint32Array(idx) : new Uint16Array(idx);
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const attribs = [pos, nrm, col];
    for (let i = 0; i < 3; i++) {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, attribs[i], gl.STATIC_DRAW);
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 0, 0);
    }
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    return {
      vao,
      count: idx.length,
      indexType: idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
    };
  }

  function begin(frame) {
    frameViewProj = frame.viewProj;
    const fc = frame.fogColor;
    gl.clearColor(fc[0], fc[1], fc[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(litProg);
    gl.uniformMatrix4fv(litU.uViewProj, false, frame.viewProj);
    gl.uniform3fv(litU.uEye, frame.eye);
    gl.uniform3fv(litU.uSunDir, frame.sunDir);
    gl.uniform3fv(litU.uSunColor, frame.sunColor);
    gl.uniform3fv(litU.uAmbGround, frame.ambientGround);
    gl.uniform3fv(litU.uAmbSky, frame.ambientSky);
    gl.uniform3fv(litU.uFogColor, frame.fogColor);
    gl.uniform1f(litU.uFogDensity, frame.fogDensity);
  }

  function draw(mesh, modelMat, opts) {
    gl.useProgram(litProg);
    gl.uniformMatrix4fv(litU.uModel, false, modelMat);
    const emissive = opts && opts.emissive !== undefined ? opts.emissive : 0;
    const alpha = opts && opts.alpha !== undefined ? opts.alpha : 1;
    gl.uniform1f(litU.uEmissive, emissive);
    gl.uniform1f(litU.uAlpha, alpha);
    const blend = alpha < 1;
    if (blend) gl.enable(gl.BLEND);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType, 0);
    gl.bindVertexArray(null);
    if (blend) gl.disable(gl.BLEND);
  }

  function drawSky(sky) {
    gl.useProgram(skyProg);
    gl.uniformMatrix4fv(skyU.uInvViewProj, false, sky.invViewProj);
    gl.uniform3fv(skyU.uZenith, sky.zenith);
    gl.uniform3fv(skyU.uHorizon, sky.horizon);
    gl.uniform3fv(skyU.uSunDir, sky.sunDir);
    gl.uniform3fv(skyU.uSunColor, sky.sunColor);
    gl.uniform1f(skyU.uStars, sky.stars ? 1 : 0);
    gl.depthMask(false);
    gl.bindVertexArray(skyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.depthMask(true);
  }

  function drawShadow(modelMat, w, l) {
    gl.useProgram(shadowProg);
    gl.uniformMatrix4fv(shadowU.uViewProj, false, frameViewProj);
    gl.uniformMatrix4fv(shadowU.uModel, false, modelMat);
    gl.uniform2f(shadowU.uSize, w, l);
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gl.bindVertexArray(shadowVAO);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  function drawMark(modelMat, w, l) {
    gl.useProgram(markProg);
    gl.uniformMatrix4fv(markU.uViewProj, false, frameViewProj);
    gl.uniformMatrix4fv(markU.uModel, false, modelMat);
    gl.uniform2f(markU.uSize, w, l);
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gl.bindVertexArray(shadowVAO);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  return {
    init,
    resize,
    createMesh,
    begin,
    draw,
    drawSky,
    drawShadow,
    drawMark,
    get width() { return width; },
    get height() { return height; },
    get aspect() { return aspect; },
  };
})();
