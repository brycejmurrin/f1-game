/*
 * Apex 26 — WebGL2 renderer.
 * One standard lit shader (hemisphere ambient + lambert sun + exp2 fog +
 * shadow map PCF + up to 32 point lights), a sky shader (fullscreen triangle
 * via gl_VertexID), a blob-shadow quad, and an HDR composite pass (ACES
 * tone-map + bloom + colour grade + vignette).
 */
"use strict";

const GLX = (function () {
  // ── Change 1.1: Pre-allocated light scratch buffers (no per-frame GC) ──
  // UBO data: posRad[32] (128 floats) + col[32] (128 floats) = 1024 bytes
  const _lightUBOData = new Float32Array(256);
  let _lightUBO = null;

  // ── LIT vertex shader ──
  const LIT_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 aCol;
uniform mat4 uModel;
uniform mat4 uViewProj;
uniform mat4 uLightVP;
uniform vec3 uEye;
out vec3 vNrm;
out vec3 vCol;
out vec3 vWorldPos;
out float vDist;
out vec4 vLightPos;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vNrm = mat3(uModel) * aNrm;
  vCol = aCol;
  vWorldPos = wp.xyz;
  vDist = length(wp.xyz - uEye);
  vLightPos = uLightVP * wp;
  gl_Position = uViewProj * wp;
}`;

  // ── LIT fragment shader — shadow map + 32 point lights ──
  // Change 1.3: sqrt-based slope bias (replaces tan(acos()))
  // Change 1.5: dist² early-exit guard in point light loop
  const LIT_FS = `#version 300 es
precision mediump float;
in vec3 vNrm;
in vec3 vCol;
in vec3 vWorldPos;
in float vDist;
in vec4 vLightPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbGround;
uniform vec3 uAmbSky;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uEmissive;
uniform float uAlpha;
uniform sampler2D uShadowMap;
uniform int uNumLights;
// UBO: packed light data. vec4 layout avoids std140 vec3-padding issues.
layout(std140) uniform Lights {
  vec4 uLPosRad[32];  // xyz = position, w = radius
  vec4 uLCol[32];     // xyz = color,    w = unused
};
out vec4 outColor;
float shadow(vec4 lp) {
  vec3 proj = lp.xyz / lp.w * 0.5 + 0.5;
  if (proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0) return 1.0;
  float cosTheta = max(dot(normalize(vNrm), uSunDir), 0.0);
  // Change 1.3: replace tan(acos(cosTheta)) with sqrt formulation
  float ct = max(cosTheta, 0.05);
  float tanTheta = sqrt(1.0 - ct * ct) / ct;
  float slopeBias = 0.0005 * tanTheta;
  float bias = clamp(slopeBias, 0.0002, 0.002);
  float depth = texture(uShadowMap, proj.xy).r;
  return proj.z - bias > depth ? 0.5 : 1.0;
}
void main() {
  vec3 n = normalize(vNrm);
  vec3 amb = mix(uAmbGround, uAmbSky, n.y * 0.5 + 0.5);
  float sh = shadow(vLightPos);
  vec3 lit = vCol * (amb + uSunColor * max(dot(n, uSunDir), 0.0) * sh);
  // Change 1.5: point lights with dist² early-exit guard (no sqrt unless in range)
  for (int i = 0; i < 32; i++) {
    if (i >= uNumLights) break;
    float rad = uLPosRad[i].w;
    vec3 LP = uLPosRad[i].xyz - vWorldPos;
    float dist2 = dot(LP, LP);
    if (dist2 > rad * rad) continue;
    float dist = sqrt(dist2);
    vec3 Ld = LP / max(dist, 0.001);
    float atten = max(0.0, 1.0 - dist / rad);
    atten *= atten;
    lit += vCol * uLCol[i].xyz * max(dot(n, Ld), 0.0) * atten;
  }
  vec3 c = mix(lit, vCol, uEmissive);
  float fd = vDist * uFogDensity;
  float f = 1.0 - exp(-fd * fd);
  outColor = vec4(mix(c, uFogColor, f), uAlpha);
}`;

  // ── Composite (HDR resolve) shaders ──
  const COMP_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

  const COMP_FS = `#version 300 es
precision mediump float;
uniform sampler2D uHDR;
uniform sampler2D uBloom;
uniform float uBloomStrength;
uniform float uGradeStrength;
uniform float uExposure;
out vec4 outColor;
vec3 aces(vec3 x) {
  float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(uHDR, 0));
  vec3 hdr = texture(uHDR, uv).rgb * uExposure;
  vec3 bloom = texture(uBloom, uv).rgb;
  hdr += bloom * uBloomStrength;
  // ACES tone-map
  vec3 col = aces(hdr);
  // Colour grade: vibrance/contrast lift
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 1.0 + uGradeStrength * 0.4);
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 - uGradeStrength * 0.12));
  // Vignette
  vec2 vcuv = uv * 2.0 - 1.0;
  float vig = 1.0 - smoothstep(0.6, 1.3, length(vcuv));
  col *= vig * 0.25 + 0.75;
  outColor = vec4(col, 1.0);
}`;

  // ── Bloom blur shader ──
  const BLUR_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

  const BLUR_FS = `#version 300 es
precision mediump float;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(uTex, 0));
  vec3 c = vec3(0.0);
  float w = 0.0;
  float weights[5];
  weights[0] = 0.2270270270;
  weights[1] = 0.1945945946;
  weights[2] = 0.1216216216;
  weights[3] = 0.0540540541;
  weights[4] = 0.0162162162;
  c += texture(uTex, uv).rgb * weights[0]; w += weights[0];
  for (int i = 1; i <= 4; i++) {
    float fi = float(i);
    c += texture(uTex, uv + uDir * fi).rgb * weights[i]; w += weights[i];
    c += texture(uTex, uv - uDir * fi).rgb * weights[i]; w += weights[i];
  }
  outColor = vec4(c / w, 1.0);
}`;

  // ── Bright-extract shader (threshold for bloom) ──
  const EXTRACT_FS = `#version 300 es
precision mediump float;
uniform sampler2D uTex;
uniform float uThreshold;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(uTex, 0));
  vec3 c = texture(uTex, uv).rgb;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float bright = max(lum - uThreshold, 0.0) / max(lum, 0.001);
  outColor = vec4(c * bright, 1.0);
}`;

  // ── Shadow depth-map shaders ──
  const DEPTHMAP_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uModel;
uniform mat4 uLightVP;
void main() {
  gl_Position = uLightVP * uModel * vec4(aPos, 1.0);
}`;

  const DEPTHMAP_FS = `#version 300 es
precision mediump float;
void main() {}`;

  // ── Sky shaders ──
  const SKY_VS = `#version 300 es
uniform mat4 uInvViewProj;
out vec3 vDir;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  gl_Position = vec4(p, 1.0, 1.0);
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

  // ── Blob shadow shaders ──
  const SHADOW_VS = `#version 300 es
layout(location=0) in vec2 aPos;
uniform mat4 uModel;
uniform mat4 uViewProj;
uniform vec2 uSize;
out vec2 vUV;
void main() {
  vUV = aPos * 2.0;
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

  // ── State ──
  let gl = null;
  let canvas = null;
  let litProg = null, litU = null;
  let skyProg = null, skyU = null;
  let shadowProg = null, shadowU = null;
  let depthProg = null, depthU = null;
  let compProg = null, compU = null;
  let blurProg = null, blurU = null;
  let extractProg = null, extractU = null;
  let skyVAO = null;
  let shadowVAO = null;
  let width = 0, height = 0, aspect = 1;
  let frameViewProj = null;

  // HDR framebuffer
  let hdrFBO = null, hdrTex = null, hdrDepth = null;
  let hdrOk = false;  // Change 3.5: tracks RGBA16F availability

  // Bloom FBOs (ping-pong)
  let bloomFBO = [null, null], bloomTex = [null, null];
  let extractFBO = null, extractTex = null;

  // Shadow depth-map (sun shadow)
  const SHADOW_SIZE = 2048;
  let shadowFBO = null, shadowDepthTex = null;
  let lightVP = new Float32Array(16);

  // Current frame lights (uploaded per-frame)
  let numLights = 0;

  // ── Helpers ──
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

  function makeFBO(w, h, internalFmt, fmt, type, filter) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, w, h, 0, fmt, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { fbo, tex };
  }

  function makeHDR(w, h) {
    // Try RGBA16F first (full HDR), fall back to RGBA8
    const ext = gl.getExtension("EXT_color_buffer_float");
    let internalFmt = gl.RGBA8, fmt = gl.RGBA, type = gl.UNSIGNED_BYTE;
    hdrOk = false;
    if (ext) {
      internalFmt = gl.RGBA16F; fmt = gl.RGBA; type = gl.HALF_FLOAT;
      hdrOk = true;
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, w, h, 0, fmt, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) {
      // Fallback: rebuild as RGBA8
      gl.deleteTexture(tex); gl.deleteRenderbuffer(depth); gl.deleteFramebuffer(fbo);
      hdrOk = false;
      return makeHDRFallback(w, h);
    }
    return { fbo, tex, depth };
  }

  function makeHDRFallback(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex, depth };
  }

  function makeShadowMap() {
    // Change 1.2: LINEAR filter on shadow depth texture (PCF-ready)
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT32F, SHADOW_SIZE, SHADOW_SIZE, 0,
                  gl.DEPTH_COMPONENT, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);   // Change 1.2
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);   // Change 1.2
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { fbo, tex };
  }

  function rebuildPostBuffers(w, h) {
    // HDR buffer
    if (hdrFBO) { gl.deleteFramebuffer(hdrFBO); gl.deleteTexture(hdrTex); if (hdrDepth) gl.deleteRenderbuffer(hdrDepth); }
    const hdr = makeHDR(w, h);
    hdrFBO = hdr.fbo; hdrTex = hdr.tex; hdrDepth = hdr.depth;

    // Bloom buffers (half res)
    const bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
    for (let i = 0; i < 2; i++) {
      if (bloomFBO[i]) { gl.deleteFramebuffer(bloomFBO[i]); gl.deleteTexture(bloomTex[i]); }
      const b = makeFBO(bw, bh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
      bloomFBO[i] = b.fbo; bloomTex[i] = b.tex;
    }
    if (extractFBO) { gl.deleteFramebuffer(extractFBO); gl.deleteTexture(extractTex); }
    const ex = makeFBO(bw, bh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
    extractFBO = ex.fbo; extractTex = ex.tex;
  }

  // ── Init ──
  function init(canvasEl) {
    canvas = canvasEl;
    gl = canvas.getContext("webgl2", {
      antialias: false,  // we do our own compositing
      alpha: false,
      powerPreference: "high-performance",
    });
    if (!gl) return false;

    litProg = link(LIT_VS, LIT_FS);
    skyProg = link(SKY_VS, SKY_FS);
    shadowProg = link(SHADOW_VS, SHADOW_FS);
    depthProg = link(DEPTHMAP_VS, DEPTHMAP_FS);
    compProg = link(COMP_VS, COMP_FS);
    blurProg = link(BLUR_VS, BLUR_FS);
    extractProg = link(COMP_VS, EXTRACT_FS);
    if (!litProg || !skyProg || !shadowProg || !depthProg || !compProg || !blurProg || !extractProg) return false;

    litU = locs(litProg, ["uModel", "uViewProj", "uLightVP", "uEye", "uSunDir", "uSunColor",
      "uAmbGround", "uAmbSky", "uFogColor", "uFogDensity", "uEmissive", "uAlpha",
      "uShadowMap", "uNumLights"]);
    skyU = locs(skyProg, ["uInvViewProj", "uZenith", "uHorizon", "uSunDir", "uSunColor", "uStars"]);
    shadowU = locs(shadowProg, ["uModel", "uViewProj", "uSize"]);
    depthU = locs(depthProg, ["uModel", "uLightVP"]);
    compU = locs(compProg, ["uHDR", "uBloom", "uBloomStrength", "uGradeStrength", "uExposure"]);
    blurU = locs(blurProg, ["uTex", "uDir"]);
    extractU = locs(extractProg, ["uTex", "uThreshold"]);

    skyVAO = gl.createVertexArray();

    // UBO for point lights — 1024 bytes: posRad[32] + col[32] as packed vec4 arrays
    _lightUBO = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, _lightUBO);
    gl.bufferData(gl.UNIFORM_BUFFER, 1024, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
    const _lightsBlockIdx = gl.getUniformBlockIndex(litProg, 'Lights');
    gl.uniformBlockBinding(litProg, _lightsBlockIdx, 0);

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

    // Shadow depth map
    const sm = makeShadowMap();
    shadowFBO = sm.fbo; shadowDepthTex = sm.tex;

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
      rebuildPostBuffers(w, h);
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

  // Compute light-space VP matrix from sun direction + scene centre/radius
  function computeLightVP(sunDir, centre, radius) {
    // Orthographic projection from sun direction
    const sd = sunDir;
    const up = Math.abs(sd[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    // right = up x sunDir
    const rx = up[1]*sd[2] - up[2]*sd[1];
    const ry = up[2]*sd[0] - up[0]*sd[2];
    const rz = up[0]*sd[1] - up[1]*sd[0];
    const rl = Math.sqrt(rx*rx+ry*ry+rz*rz) || 1;
    const r = [rx/rl, ry/rl, rz/rl];
    const ux = sd[1]*r[2] - sd[2]*r[1];
    const uy = sd[2]*r[0] - sd[0]*r[2];
    const uz = sd[0]*r[1] - sd[1]*r[0];
    const eye = [centre[0] - sd[0]*radius*2, centre[1] - sd[1]*radius*2, centre[2] - sd[2]*radius*2];
    // Build ortho view * proj manually into lightVP
    const dx = -( r[0]*eye[0] +  r[1]*eye[1] +  r[2]*eye[2]);
    const dy = -(ux*eye[0]   + uy*eye[1]    + uz*eye[2]);
    const dz = -(sd[0]*eye[0]+ sd[1]*eye[1] + sd[2]*eye[2]);
    const o = radius || 1;
    // Combined ortho view-proj (row-major, transposed for WebGL column-major)
    lightVP.set([
       r[0]/o,  ux/o,   -sd[0]/(o*4),  0,
       r[1]/o,  uy/o,   -sd[1]/(o*4),  0,
       r[2]/o,  uz/o,   -sd[2]/(o*4),  0,
       dx/o,    dy/o,    dz/(o*4),      1,
    ]);
  }

  let _curFrame = null;

  function begin(frame) {
    _curFrame = frame;
    frameViewProj = frame.viewProj;

    // Compute light-space matrix for shadow pass
    const sd = frame.sunDir || [0, 1, 0];
    const eye = frame.eye || [0, 0, 0];
    computeLightVP(sd, eye, 400);

    // ── Shadow pass (depth only) ──
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFBO);
    gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(depthProg);
    gl.uniformMatrix4fv(depthU.uLightVP, false, lightVP);
    // (meshes are drawn by drawDepth() calls from game.js — see present())

    // ── HDR scene pass: switch to HDR FBO ──
    // (game.js calls draw() between begin() and present())
    if (!hdrFBO) rebuildPostBuffers(width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, hdrFBO);
    gl.viewport(0, 0, width, height);
    const fc = frame.fogColor;
    gl.clearColor(fc[0], fc[1], fc[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(litProg);
    gl.uniformMatrix4fv(litU.uViewProj, false, frame.viewProj);
    gl.uniformMatrix4fv(litU.uLightVP, false, lightVP);
    gl.uniform3fv(litU.uEye, frame.eye);
    gl.uniform3fv(litU.uSunDir, sd);
    gl.uniform3fv(litU.uSunColor, frame.sunColor);
    gl.uniform3fv(litU.uAmbGround, frame.ambientGround);
    gl.uniform3fv(litU.uAmbSky, frame.ambientSky);
    gl.uniform3fv(litU.uFogColor, frame.fogColor);
    gl.uniform1f(litU.uFogDensity, frame.fogDensity);

    // Bind shadow map to texture unit 1
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, shadowDepthTex);
    gl.uniform1i(litU.uShadowMap, 1);
    gl.activeTexture(gl.TEXTURE0);
  }

  // ── Change 1.1: Upload point lights using pre-allocated buffers ──
  function setFrameLights(lights) {
    numLights = Math.min(lights ? lights.length : 0, 32);
    if (!litProg) return;
    gl.useProgram(litProg);
    gl.uniform1i(litU.uNumLights, numLights);
    // Fill UBO: posRad[32] at offset 0 (indices 0..127), col[32] at offset 512 (indices 128..255)
    for (let i = 0; i < numLights; i++) {
      const L = lights[i];
      _lightUBOData[i*4]       = L.pos[0]; _lightUBOData[i*4+1] = L.pos[1];
      _lightUBOData[i*4+2]     = L.pos[2]; _lightUBOData[i*4+3] = L.rad;
      _lightUBOData[128+i*4]   = L.col[0]; _lightUBOData[128+i*4+1] = L.col[1];
      _lightUBOData[128+i*4+2] = L.col[2]; _lightUBOData[128+i*4+3] = 0;
    }
    gl.bindBuffer(gl.UNIFORM_BUFFER, _lightUBO);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, _lightUBOData);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, _lightUBO);
  }

  function draw(mesh, modelMat, opts) {
    if (!mesh) return;
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

  // ── present(): bloom + composite to canvas ──
  // Change 1.4: 4 bloom passes (2 pairs of H+V, originally 2)
  function present(opts) {
    opts = opts || {};
    const bloomStrength = opts.bloomStrength !== undefined ? opts.bloomStrength : 0.74;
    const gradeStrength = opts.gradeStrength !== undefined ? opts.gradeStrength : 0.34;
    const exposure      = opts.exposure      !== undefined ? opts.exposure      : 1.0;
    const threshold     = opts.threshold     !== undefined ? opts.threshold     : 0.75;

    const bw = Math.max(1, width >> 1);
    const bh = Math.max(1, height >> 1);
    const iw = 1 / bw;
    const ih = 1 / bh;

    // ── Bright extract ──
    gl.bindFramebuffer(gl.FRAMEBUFFER, extractFBO);
    gl.viewport(0, 0, bw, bh);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(extractProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, hdrTex);
    gl.uniform1i(extractU.uTex, 0);
    gl.uniform1f(extractU.uThreshold, threshold);
    gl.bindVertexArray(skyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Change 1.4: 4 blur passes (2 H+V pairs) instead of original 2
    const passes = [
      [iw, 0],       // pass 1: horizontal
      [0, ih],       // pass 2: vertical
      [iw, 0],       // pass 3: horizontal (extra)
      [0, ih],       // pass 4: vertical (extra)
    ];

    let srcTex = extractTex;
    for (let p = 0; p < passes.length; p++) {
      const dst = p & 1;  // alternate ping-pong (0 or 1)
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO[dst]);
      gl.viewport(0, 0, bw, bh);
      gl.useProgram(blurProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.uniform1i(blurU.uTex, 0);
      gl.uniform2f(blurU.uDir, passes[p][0], passes[p][1]);
      gl.bindVertexArray(skyVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      srcTex = bloomTex[dst];
    }
    const finalBloomTex = srcTex;

    // ── Composite to canvas ──
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.useProgram(compProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, hdrTex);
    gl.uniform1i(compU.uHDR, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, finalBloomTex);
    gl.uniform1i(compU.uBloom, 1);
    gl.uniform1f(compU.uBloomStrength, bloomStrength);
    gl.uniform1f(compU.uGradeStrength, gradeStrength);
    gl.uniform1f(compU.uExposure, exposure);
    gl.bindVertexArray(skyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.enable(gl.DEPTH_TEST);
    gl.activeTexture(gl.TEXTURE0);
  }

  return {
    init,
    resize,
    createMesh,
    begin,
    draw,
    drawSky,
    drawShadow,
    setFrameLights,
    present,
    get width()  { return width; },
    get height() { return height; },
    get aspect() { return aspect; },
    hdrMode: () => hdrOk,  // Change 3.5: expose HDR status
  };
})();
