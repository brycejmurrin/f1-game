// A pass-through RenderRate + XrBoot for tests that run the REAL game.js tickBody in a VM
// (js/perf/render-rate.js gates the tail of tickBody; here every frame draws with its own dt/ms).
export function renderRateStubs() {
  let d = 0, m = 0;
  return {
    RenderRate: { observe() {}, gate(dt, ms) { d = dt; m = ms; return true; }, dt: () => d, ms: () => m },
    XrBoot: { comfort: () => false },
  };
}
