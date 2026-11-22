// @ts-check
/** Pins read by the spec before goto. three + tlxForceGL so software GL stays on WebGL2. */
export function installSessionPins(win = window) {
  win.__TEST_MODE = true;
  try {
    win.localStorage.setItem("apex26.gfxBackend", "three");
    win.localStorage.setItem("apex26.tlxForceGL", "1");
    win.localStorage.setItem("apex26.gfxBootStepMs", "45000");
  } catch (_) { /* private mode */ }
  const bag = { samples: [], on: false, until: 0, last: 0 };
  win.__perfSessionFrames = bag;
  const tick = (t) => {
    // An in-flight callback can carry a stamp from before the seed
    // (measured −33 ms). Ignore it and keep the seed so the next stamp
    // records the real gap. A backward last would invent a negative frame.
    if (bag.on && bag.last && t > bag.last) {
      bag.samples.push(+(t - bag.last).toFixed(3));
      bag.last = t;
      // Include the entire frame straddling the deadline, then close the window.
      if (t >= bag.until) bag.on = false;
    }
    win.requestAnimationFrame(tick);
  };
  win.requestAnimationFrame(tick);
}
