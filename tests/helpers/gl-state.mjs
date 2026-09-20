/* gl-state — record WebGL2 context state on a stub gl, snapshot it, diff it.
 *
 * WHY THIS EXISTS. A renderer pass that changes global GL state and restores it
 * wrongly is invisible to every tier this project has. The symptom is not an
 * error; it is the NEXT pass drawing under someone else's state — coplanar
 * geometry vanishing, a texture unit sampling an unbound slot, a draw landing
 * with the wrong program. Two of exactly that shape shipped in js/render/glx/:
 * the occlusion pass restored `depthFunc(LESS)` when the context baseline is
 * LEQUAL (glx.js sets it once at init and nothing resets it per frame), and a
 * mid-frame texture upload restored unit 0 to null when shadows were off.
 *
 * THE POINT: none of this needs a GPU. It is GL *state*, not pixels, and state
 * is driver-independent — so a CPU box answers it exactly as a real GPU would.
 * That is not a workaround for lacking hardware; it is how ANGLE does it. ANGLE
 * builds with ANGLE_CAPTURE_SERIALIZE_STATE and replays traces with
 * `--validation`, comparing the SERIALIZED STATE against the capture at
 * checkpoints, and its docs note that this is "normally used with SwiftShader".
 * Pixel goldens are the thing that needs real hardware. State diffs are not.
 *
 * HOW TO USE IT. Mix `stateRecorder()` into whatever stub gl a suite already
 * builds, then bracket the pass under test:
 *
 *     const gl = Object.assign(makeGL(), stateRecorder());
 *     const before = snapshot(gl);
 *     runThePass(gl);
 *     assert.deepEqual(diff(before, snapshot(gl)), {});
 *
 * A pass that legitimately changes state names what it changed, so the
 * assertion stays a statement about intent rather than a list of enums:
 *
 *     assert.deepEqual(diff(before, snapshot(gl)), { depthMask: [true, false] });
 *
 * WHAT IT DOES NOT DO. This records calls made THROUGH the stub; it cannot see
 * a real driver. For the shipped backends the same shape belongs behind a
 * `__apex` hook reading real `getParameter` values — and for TLX specifically,
 * three.js's WebGLState CACHES state, so a leak desyncs the cache silently and
 * the cache must be compared against the real context, not trusted.
 */

/** The state this records. Each entry: the setter name, and how to fold its
 *  arguments into one comparable value. Kept to the state Apex's passes
 *  actually touch — a longer list is not more truthful, just noisier. */
const SETTERS = {
  depthFunc: (s, f) => { s.depthFunc = f; },
  depthMask: (s, m) => { s.depthMask = !!m; },
  colorMask: (s, r, g, b, a) => { s.colorMask = [!!r, !!g, !!b, !!a]; },
  cullFace: (s, m) => { s.cullFace = m; },
  frontFace: (s, m) => { s.frontFace = m; },
  blendFunc: (s, srcF, dstF) => { s.blendFunc = [srcF, dstF]; },
  blendEquation: (s, m) => { s.blendEquation = m; },
  useProgram: (s, p) => { s.program = p || null; },
  bindVertexArray: (s, v) => { s.vao = v || null; },
  bindFramebuffer: (s, t, fb) => { s.framebuffer = fb || null; },
  activeTexture: (s, u) => { s.activeTexture = u; },
  viewport: (s, x, y, w, h) => { s.viewport = [x, y, w, h]; },
  scissor: (s, x, y, w, h) => { s.scissor = [x, y, w, h]; },
  depthRange: (s, n, f) => { s.depthRange = [n, f]; },
  polygonOffset: (s, factor, units) => { s.polygonOffset = [factor, units]; },
};

/** enable()/disable() capabilities, tracked as a set of enum -> bool. */
const CAPS = "caps";

/**
 * Returns an object to Object.assign onto a stub gl. It defines the state
 * setters above plus enable/disable/bindTexture, each recording into
 * `gl.__state`. Assign it AFTER the stub's own definitions so it wins, or
 * before and let the stub override what it needs to do extra work — either
 * way, call `snapshot()` to read.
 */
export function stateRecorder(initial, enums) {
  const state = Object.assign({ [CAPS]: {}, textures: {} }, initial || null);
  const out = { __state: state };
  // A RECORDER THAT CANNOT ANSWER READS IS NOT A MODEL OF A CONTEXT. Real
  // passes save state with `getParameter` and put it back in a `finally`
  // (chunked.js:643 does exactly this for CURRENT_PROGRAM). A stub whose
  // getParameter returns null makes that restore silently skip, and the
  // resulting diff reports a leak the shipped renderer does not have — a false
  // red that would teach the next reader to distrust this helper. Pass the
  // stub's enum values and reads are answered from the same state writes go to.
  if (enums) {
    out.getParameter = (pname) => {
      for (const [key, value] of Object.entries(enums)) {
        if (value === pname) return state[key] === undefined ? null : state[key];
      }
      return null;
    };
  }
  for (const [name, fold] of Object.entries(SETTERS)) {
    out[name] = (...args) => fold(state, ...args);
  }
  out.enable = (cap) => { state[CAPS][cap] = true; };
  out.disable = (cap) => { state[CAPS][cap] = false; };
  // Texture bindings are per-unit, and the unit is whatever activeTexture last
  // named — which is exactly why the GLX unit-0 bug was possible: the restore
  // ran with unit 0 active and bound null.
  out.bindTexture = (target, tex) => {
    const unit = state.activeTexture == null ? "0" : String(state.activeTexture);
    state.textures[`${unit}:${target}`] = tex || null;
  };
  return out;
}

/** A deep copy of the recorded state, safe to hold across a pass. */
export function snapshot(gl) {
  const s = (gl && gl.__state) || {};
  return JSON.parse(JSON.stringify(s, (_k, v) => (v === undefined ? null : v)));
}

/**
 * Keys whose value changed, as `{ key: [before, after] }`. An empty object
 * means the pass left the context exactly as it found it.
 *
 * Objects are compared structurally, so a program or VAO handle must be
 * JSON-representable in a stub (`{ id: 1 }`, not a bare `{}` — two distinct
 * empty objects serialize identically and a swap would read as no change).
 */
export function diff(before, after) {
  const out = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const k of keys) {
    const a = JSON.stringify(before ? before[k] : undefined);
    const b = JSON.stringify(after ? after[k] : undefined);
    if (a !== b) out[k] = [before ? before[k] : undefined, after ? after[k] : undefined];
  }
  return out;
}
