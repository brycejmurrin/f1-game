/* Apex 26 — GLSL sources for the WebGL2 renderer (js/render/glx/glx.js): the small effect programs — blob shadow (SHADOW_*), skid-mark stamps (MARK_*), racing-line de… */
"use strict";

(function () {
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

  const MARK_BATCH_VS = `#version 300 es
layout(location=0) in vec3 aPos;   // world position (metres)
layout(location=1) in vec2 aUV;    // -1..1 across the stamp
uniform mat4 uViewProj;
out vec2 vUV;
void main() {
  vUV = aUV;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

  const DECAL_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec2 aUV;
uniform mat4 uModel;
uniform mat4 uViewProj;
out vec2 vUV;
out vec3 vNrm;
void main() {
  vUV = aUV;
  vNrm = mat3(uModel) * aNrm;
  gl_Position = uViewProj * uModel * vec4(aPos, 1.0);
}`;
  const DECAL_FS = `#version 300 es
precision mediump float;
in vec2 vUV;
in vec3 vNrm;
uniform sampler2D uTex;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbSky;
uniform vec3 uAmbGround;
uniform float uGlow;
out vec4 outColor;
void main() {
  vec4 t = texture(uTex, vUV);
  if (t.a < 0.02) discard;
  vec3 N = normalize(vNrm);
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 amb = mix(uAmbGround, uAmbSky, N.y * 0.5 + 0.5);
  vec3 lit = t.rgb * (amb + uSunColor * ndl) + t.rgb * uGlow;
  outColor = vec4(lit, t.a);
}`;

  const GLOW_VS = `#version 300 es
layout(location=0) in vec2 aCorner;   // x in {-1,+1}, y in {0,1}
layout(location=1) in vec3 aCenter;   // lamp head world position
layout(location=2) in vec3 aColor;    // HDR lamp colour
layout(location=3) in float aRadius;  // halo radius (m)
uniform mat4 uViewProj;
uniform vec3 uEye;
out vec2 vUV;
out vec3 vColor;
void main() {
  vec3 fwd = normalize(uEye - aCenter);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd) + vec3(1e-4, 0.0, 0.0));
  vec3 upv = cross(fwd, right);
  vec2 c = vec2(aCorner.x, aCorner.y * 2.0 - 1.0);   // corner buffer is x±1, y 0..1
  vec3 wp = aCenter + (right * c.x + upv * c.y) * aRadius;
  vUV = c;
  vColor = aColor;
  gl_Position = uViewProj * vec4(wp, 1.0);
}`;

  const GLOW_FS = `#version 300 es
precision highp float;
in vec2 vUV;        // -1..1 across the halo quad
in vec3 vColor;
uniform float uStr;
out vec4 outColor;
void main() {
  float r2 = dot(vUV, vUV);
  float core = exp(-r2 * 28.0);   // hot centre right at the lens
  float veil = exp(-r2 * 5.0);    // broad soft glare veil (≈0 by the quad edge)
  float a = (core * 0.75 + veil * 0.28) * uStr;
  outColor = vec4(vColor * a, 1.0);   // additive (blendFunc ONE, ONE)
}`;

  const PARTICLE_VS = `#version 300 es
layout(location=0) in vec2 aCorner;   // quad corner in {-1,+1}²
layout(location=1) in vec3 aCenter;   // particle world position
layout(location=2) in vec3 aColor;    // tint (HDR allowed for the additive group)
layout(location=3) in float aSize;    // half-size (m)
layout(location=4) in float aAlpha;   // per-particle opacity
uniform mat4 uViewProj;
uniform vec3 uEye;
out vec2 vUV;
out vec3 vColor;
out float vAlpha;
void main() {
  vec3 fwd = normalize(uEye - aCenter);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd) + vec3(1e-4, 0.0, 0.0));
  vec3 upv = cross(fwd, right);
  vec3 wp = aCenter + (right * aCorner.x + upv * aCorner.y) * aSize;
  vUV = aCorner;
  vColor = aColor;
  vAlpha = aAlpha;
  gl_Position = uViewProj * vec4(wp, 1.0);
}`;

  const PARTICLE_FS = `#version 300 es
precision mediump float;
in vec2 vUV;        // -1..1 across the quad
in vec3 vColor;
in float vAlpha;
uniform float uAdditive;
out vec4 outColor;
void main() {
  float r2 = dot(vUV, vUV);
  float fall = max(1.0 - r2, 0.0);
  fall *= fall;                       // smooth soft-disc falloff, zero at the rim
  float a = vAlpha * fall;
  outColor = mix(vec4(vColor, a), vec4(vColor * a, 1.0), uAdditive);
}`;
  // DRIVING LINE ribbon (js/render/shared/driving-line.js builds the strip).
  // The colour is F1's dynamic grammar against the PLAYER's speed: green where
  // the car is at or under the line's speed here, amber a little over, red
  // clearly over (brake). The ribbon is emissive above 1.0 so the HDR bloom
  // gives it the glow every racing game's line has; a soft-edged core keeps it
  // a line and not a slab. CORNERS mode fades the straights out through the
  // per-vertex zone the builder smoothed.
  const LINE_VS = `#version 300 es
layout(location=0) in vec3 aPos;     // world position (metres)
layout(location=1) in float aAcross; // -1 | +1 across the ribbon
layout(location=2) in float aSpeed;  // the line's speed here (m/s)
layout(location=3) in float aZone;   // 0 straight … 1 corner / braking
layout(location=4) in float aAlong;  // metres along the lap (the dash pattern's clock)
uniform mat4 uViewProj;
out float vAcross;
out float vSpeed;
out float vZone;
out float vAlong;
void main() {
  vAcross = aAcross; vSpeed = aSpeed; vZone = aZone; vAlong = aAlong;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;
  const LINE_FS = `#version 300 es
precision mediump float;
in float vAcross;
in float vSpeed;
in float vZone;
in float vAlong;
uniform float uPlayerSpeed;   // m/s
uniform float uCornersOnly;   // 1 = fade the straights out
uniform float uPalette;       // 0 = F1 green/amber/red, 1 = colour-blind safe
uniform float uOpacity;       // 0.65 subtle … 1 as shipped … 1.35 solid
uniform float uStr;           // emissive strength (bloom feed)
out vec4 outColor;
// ARROWS: a chevron every PERIOD m pointing the way the lap runs — the tip on
// the ribbon's centre, the wings trailing SWEEP m behind it at the edges, the
// stroke THICK m along. Pattern space is (along, across), so the chevrons bend
// with the road, need no derivatives for their soft edge, and are identical on
// WGX / TLX. The F1 games' line is drawn this way.
const float PERIOD = 5.0;
const float SWEEP = 1.6;
const float THICK = 1.1;
void main() {
  float over = uPlayerSpeed / max(vSpeed, 1.0);          // 1.0 = on the line's pace
  // Two palettes, mixed rather than branched (uPalette is 0 or 1 and uniform,
  // but a mix is free here and keeps every backend's version identical).
  // F1's own grammar is green/amber/red, which is the WORST pair for the
  // common red-green deficiencies — the two ends of the scale are the two
  // colours a deuteranope or protanope cannot separate, on a cue that only
  // means anything if you can read it at a glance. The alternative is the IBM
  // design library's colour-blind-safe triple (blue #648FFF, orange #FE6100,
  // magenta #DC267F): blue against orange is the classic safe pair, and orange
  // against magenta separates on the BLUE channel, which both deficiencies
  // keep. SETTINGS › LINE COLOUR picks; F1 25 ships the same choice.
  vec3 onPace = mix(vec3(0.10, 0.95, 0.35), vec3(0.392, 0.561, 1.000), uPalette);
  vec3 lift   = mix(vec3(1.00, 0.72, 0.10), vec3(0.996, 0.380, 0.000), uPalette);
  vec3 brake  = mix(vec3(1.00, 0.12, 0.10), vec3(0.863, 0.149, 0.498), uPalette);
  vec3 col = mix(onPace, lift, smoothstep(0.98, 1.06, over));
  col = mix(col, brake, smoothstep(1.06, 1.16, over));
  float tip = PERIOD * 0.6 - SWEEP * abs(vAcross);       // the stroke's centre line, per across
  float d = mod(vAlong - tip, PERIOD);                   // metres past that centre line, wrapped
  d = min(d, PERIOD - d);
  float arrow = 1.0 - smoothstep(THICK * 0.5 - 0.18, THICK * 0.5, d);
  float rim = 1.0 - smoothstep(0.85, 1.0, abs(vAcross));  // soft ribbon edge
  float zone = mix(1.0, smoothstep(0.05, 0.75, vZone), uCornersOnly);   // the whole smoothed ramp is the fade
  float a = arrow * rim * zone;
  if (a < 0.01) discard;
  // SETTINGS › LINE OPACITY scales the emissive feed and the coverage together,
  // so SUBTLE loses its bloom too. The alpha is clamped because SOLID takes the
  // 0.85 base past 1 and a source alpha over 1 over-blends.
  outColor = vec4(col * uStr * a * uOpacity, min(a * 0.85 * uOpacity, 1.0));
}`;
  window.GLXShaders = Object.assign(window.GLXShaders || {}, { SHADOW_VS, SHADOW_FS, MARK_FS, MARK_BATCH_VS, DECAL_VS, DECAL_FS, GLOW_VS, GLOW_FS, PARTICLE_VS, PARTICLE_FS, LINE_VS, LINE_FS });
})();
