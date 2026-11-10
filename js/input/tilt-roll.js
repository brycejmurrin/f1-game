/* TiltRoll — the one roll-from-orientation function, in degrees, shared by input.js and controller.html.
   deviceorientation reports beta (front-back) and gamma (left-right) in the
   DEVICE frame, and a phone held sideways swaps which one is the roll the
   player means. js/input/input.js has always resolved that by rebuilding the
   gravity vector and taking the angle between screen-right and the rest,
   per the screen rotation (screenAngle, below). The PHONE AS CONTROLLER page
   (controller.html, js/input/phone-pad.js) needs the identical number on the
   phone, where input.js does not load, so the math lives here and both call
   it: a fix to one orientation case cannot drift between the two ends. */
"use strict";

const TiltRoll = (function () {
  const DEG = Math.PI / 180;

  /** Signed roll in degrees (+ = screen-right edge down = steer right) from the
   *  deviceorientation angles and the screen rotation (0/90/180/270). Null
   *  when the event carries no angles at all (a device with no sensor). */
  function rollDeg(beta, gamma, angle) {
    if (beta == null && gamma == null) return null;
    const b = (beta || 0) * DEG, g = (gamma || 0) * DEG;
    const cb = Math.cos(b), sb = Math.sin(b);
    const cg = Math.cos(g), sg = Math.sin(g);
    const gx = sg * cb;   // gravity along device right
    const gy = -sb;       // gravity along device top
    const gz = -cg * cb;  // gravity along device out-of-screen
    let h, v;             // gravity along screen-right (h) vs the rest (v)
    switch ((((angle || 0) % 360) + 360) % 360) {
      case 90:  h = -gy; v = Math.hypot(gx, gz); break;
      case 180: h = -gx; v = Math.hypot(gy, gz); break;
      case 270: h =  gy; v = Math.hypot(gx, gz); break;
      default:  h =  gx; v = Math.hypot(gy, gz); break;
    }
    return Math.atan2(h, v) / DEG;
  }

  /** Screen rotation 0/90/180/270 (0 if unknown). Numeric window.orientation FIRST: iOS 16.4
   *  Safari's screen.orientation swapped the landscape angles (WebKit 254863), reversing tilt. */
  function screenAngle(win, scr) {
    const w = win !== undefined ? win : (typeof window !== "undefined" ? window : null);
    const s = scr !== undefined ? scr : (typeof screen !== "undefined" ? screen : null);
    if (w && typeof w.orientation === "number" && Number.isFinite(w.orientation)) {
      return ((w.orientation % 360) + 360) % 360;
    }
    if (s && s.orientation && typeof s.orientation.angle === "number" && Number.isFinite(s.orientation.angle)) {
      return ((s.orientation.angle % 360) + 360) % 360;
    }
    return 0;
  }

  return { rollDeg, screenAngle };
})();
Object.freeze(TiltRoll);
