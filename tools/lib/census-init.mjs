// @doc Shared page-serializable backend and shader-stub setup for WebGL census tools.
// Internal to the census CLIs: wrappers and measurement policy stay at their callers.
// No module-scope references: Playwright serializes this function into the page.
/** Pick the census backend; GLX and --real-link keep native shader operations. */
export function initCensusPage({ backend, stub, mobile }) {
  try {
    if (mobile) localStorage.setItem("apex26.forceMobileTier", "1");
    if (backend === "tlx") {
      localStorage.setItem("apex26.gfxBackend", "three");
      localStorage.setItem("apex26.tlxForceGL", "1");
    } else {
      localStorage.setItem("apex26.gfxBackend", "glx");
    }
    localStorage.setItem("apex26.gfxBootStepMs", "45000");
    sessionStorage.setItem("apex26.wgxCapture", "0");
  } catch (_) { /* blocked storage */ }
  window.__TEST_MODE = true;
  if (!(backend === "tlx" && stub)) return;
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue;
    const P = C.prototype;
    P.linkProgram = function () {};
    P.compileShader = function () {};
    P.validateProgram = function () {};
    const gp = P.getProgramParameter, gs = P.getShaderParameter;
    P.getProgramParameter = function (p, k) {
      return k === this.LINK_STATUS || k === this.VALIDATE_STATUS || k === this.COMPLETION_STATUS_KHR
        ? true : gp.call(this, p, k);
    };
    P.getShaderParameter = function (s, k) {
      return k === this.COMPILE_STATUS ? true : gs.call(this, s, k);
    };
    P.getProgramInfoLog = function () { return ""; };
    P.getShaderInfoLog = function () { return ""; };
  }
}

