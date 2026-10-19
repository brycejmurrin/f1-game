/* Apex 26 — the opt-in INPUTS trace for GameHud (learning braking points).
   SETTINGS › DISPLAY › HUD › INPUTS (js/ui/hud-elements.js, shipped
   off), placed by MOVE & SIZE (js/ui/hud-layout.js "inputs").

   The last ~3 s of THROTTLE (green, solid), BRAKE (red, filled under its line)
   and STEERING (white, about a dashed centre line; up = right) as a small
   canvas trace, plus the current gear. A T / B / S legend sits at the right
   end of each trace, so the three never read by colour alone, and the canvas'
   aria-label says the same in words (refreshed about once a second).

   THE VALUES ARE THE ONES THE CAR WAS DRIVEN WITH: c.throttleDemand,
   c.brakeDemand and c.steerCommand, written by js/game.js after the input,
   assists and auto-throttle have been resolved (the same three
   js/race/driving-coach.js reads). Read only — nothing here touches driving.

   Sampled every frame into a fixed-step ring (STEP_S, so the trace scrolls at
   the same rate at 30 or 144 fps) and redrawn at the HUD tick (DRAW_MS). The
   canvas is sized like the minimap: CSS box x devicePixelRatio x the band
   zoom x MOVE & SIZE's --hl-s, re-measured only when that key changes.
   REDUCED MOTION (OS flag or APPEARANCE › MOTION: REDUCED): no scrolling
   trace — three still bars of the current values instead.

   Pure core (tests/unit/hud-inputs.test.mjs): createTrace (Float32Array ring,
   allocation-free push/get), steerY, levelY. frame(G, player, dtMs) is the
   one js/ui/hud.js call, above the HUD throttle. */
const HudInputs = (function () {
  "use strict";

  const WINDOW_S = 3;
  const STEP_S = 1 / 30;
  const N = Math.round(WINDOW_S / STEP_S);   // 90 samples
  const DRAW_MS = 100;
  const LABEL_MS = 1000;

  /** A ring of n samples x 3 channels. get(ch, i): i = 0 is the OLDEST. */
  function createTrace(n) {
    const thr = new Float32Array(n), brk = new Float32Array(n), str = new Float32Array(n);
    const t = { n, head: 0, count: 0, thr, brk, str };
    t.push = function (a, b, s) {
      thr[t.head] = a; brk[t.head] = b; str[t.head] = s;
      t.head = (t.head + 1) % n;
      if (t.count < n) t.count++;
    };
    t.get = function (arr, i) {
      return arr[(t.head - t.count + i + n * 2) % n];
    };
    t.clear = function () { t.head = 0; t.count = 0; };
    return t;
  }
  const clamp01 = (v) => (v > 1 ? 1 : v > 0 ? v : 0);
  /** Canvas y of a 0..1 pedal level in a box of height h (1 = top), with a pad. */
  const levelY = (v, h, pad) => h - pad - clamp01(v) * (h - 2 * pad);
  /** Canvas y of a -1..1 steer (+ = right, drawn UP) about the centre. */
  const steerY = (v, h, pad) => h / 2 - (v > 1 ? 1 : v < -1 ? -1 : v || 0) * (h / 2 - pad);

  const trace = createTrace(N);
  let acc = 0, drawT = 0, labelT = 0;
  let sampledPlayer = null, sampledGear = null, sampledLap = null;
  let review = null, reviewCanvas = null, reviewNote = null;

  // ---- the DOM ------------------------------------------------------------
  const doc = typeof document !== "undefined" ? document : null;
  const win = typeof window !== "undefined" ? window : null;
  let root = null, cv = null, ctx2 = null, gearEl = null, lastGear = null;
  const mKey = [0, 0, 0, 0, 0];   // innerWidth, innerHeight, dpr, --hl-s, CSS zoom (HUD SIZE / fit cap) of the last measure
  let cssW = 128, cssH = 48, ratio = 1;
  const _rmq = win && win.matchMedia ? win.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const reduced = () => !!(_rmq && _rmq.matches) || !!(doc && doc.documentElement && doc.documentElement.dataset.motion === "reduce");
  const isOn = () => typeof HudElements === "undefined" || HudElements.isOn("inputs");

  function bind() {
    root = doc && doc.getElementById("hud-inputs");
    cv = doc && doc.getElementById("hud-inputs-cv");
    gearEl = doc && doc.getElementById("hud-inputs-gear");
    ctx2 = cv && cv.getContext ? cv.getContext("2d") : null;
    return !!(root && ctx2);
  }
  /** DPR-aware bitmap, like js/ui/hud.js drawMinimap: re-measured on a key change only. */
  function measure() {
    const dpr = (win && win.devicePixelRatio) || 1;
    const hl = parseFloat(root.style.getPropertyValue("--hl-s")) || 1;
    const iw = win ? win.innerWidth : 0, ih = win ? win.innerHeight : 0;
    const z = cv.currentCSSZoom || 1;
    if (iw === mKey[0] && ih === mKey[1] && dpr === mKey[2] && hl === mKey[3] && z === mKey[4]) return;
    mKey[0] = iw; mKey[1] = ih; mKey[2] = dpr; mKey[3] = hl; mKey[4] = z;
    cssW = cv.clientWidth || 128; cssH = cv.clientHeight || 48;
    ratio = Math.max(1, Math.min(4, z * dpr * hl));
    const W = Math.round(cssW * ratio), H = Math.round(cssH * ratio);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  }

  const C_THR = "#2ecc71", C_BRK = "#ff3b3b", C_STR = "#ffffff", C_MID = "rgba(255,255,255,0.28)";
  function draw(c) {
    const w = cssW, h = cssH, pad = 2, lx = w - 9;   // the legend's column at the right
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.clearRect(0, 0, w, h);
    c.font = "bold 8px sans-serif"; c.textBaseline = "middle";
    // centre line (steer zero)
    c.strokeStyle = C_MID; c.lineWidth = 1; c.setLineDash([3, 3]);
    c.beginPath(); c.moveTo(0, h / 2); c.lineTo(lx - 2, h / 2); c.stroke(); c.setLineDash([]);
    const n = trace.count;
    const thrNow = n ? trace.get(trace.thr, n - 1) : 0, brkNow = n ? trace.get(trace.brk, n - 1) : 0, strNow = n ? trace.get(trace.str, n - 1) : 0;
    if (reduced()) {
      // Still bars: throttle and brake from the bottom, steer from the centre line.
      const bw = (lx - 8) / 3;
      c.fillStyle = C_THR; c.fillRect(2, levelY(thrNow, h, pad), bw - 2, h - pad - levelY(thrNow, h, pad));
      c.fillStyle = C_BRK; c.fillRect(2 + bw, levelY(brkNow, h, pad), bw - 2, h - pad - levelY(brkNow, h, pad));
      const sy = steerY(strNow, h, pad);
      c.fillStyle = C_STR; c.fillRect(2 + 2 * bw, Math.min(sy, h / 2), bw - 2, Math.max(1, Math.abs(sy - h / 2)));
    } else if (n > 1) {
      const dx = (lx - 2) / (trace.n - 1), x0 = (lx - 2) - (n - 1) * dx;
      // BRAKE: a translucent fill under the line, then the line.
      c.fillStyle = "rgba(255,59,59,0.25)";
      c.beginPath(); c.moveTo(x0, h - pad);
      for (let i = 0; i < n; i++) c.lineTo(x0 + i * dx, levelY(trace.get(trace.brk, i), h, pad));
      c.lineTo(x0 + (n - 1) * dx, h - pad); c.closePath(); c.fill();
      line(c, trace.brk, n, x0, dx, h, pad, C_BRK, false);
      line(c, trace.thr, n, x0, dx, h, pad, C_THR, false);
      line(c, trace.str, n, x0, dx, h, pad, C_STR, true);
    }
    // LEGEND: T / B / S beside where each trace ends — the glyph, not the hue, names it.
    c.fillStyle = C_THR; c.fillText("T", lx, Math.max(6, Math.min(h - 6, levelY(thrNow, h, pad))));
    c.fillStyle = C_BRK; c.fillText("B", lx, Math.max(6, Math.min(h - 6, levelY(brkNow, h, pad) + (Math.abs(brkNow - thrNow) < 0.15 ? 8 : 0))));
    c.fillStyle = C_STR; c.fillText("S", lx, Math.max(6, Math.min(h - 6, steerY(strNow, h, pad))));
  }
  function line(c, arr, n, x0, dx, h, pad, col, steer) {
    c.strokeStyle = col; c.lineWidth = 1.5;
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const v = trace.get(arr, i);
      const y = steer ? steerY(v, h, pad) : levelY(v, h, pad);
      if (i) c.lineTo(x0 + i * dx, y); else c.moveTo(x0, y);
    }
    c.stroke();
  }
  const pct = (v) => Math.round(clamp01(v) * 100);

  /** Detached, bounded copy: consumers cannot mutate the live ring or car. */
  function snapshot() {
    const samples = [];
    if (isOn()) for (let i = 0; i < trace.count; i++) samples.push({
      seconds: (i - trace.count + 1) * STEP_S,
      throttle: trace.get(trace.thr, i), brake: trace.get(trace.brk, i), steering: trace.get(trace.str, i),
    });
    return { stepS: STEP_S, durationS: Math.max(0, samples.length - 1) * STEP_S,
      gear: samples.length ? sampledGear : null, lap: samples.length ? sampledLap : null, samples };
  }
  function paintReview() {
    if (!reviewCanvas) return;
    const data = snapshot(), samples = data.samples, c = reviewCanvas.getContext("2d");
    reviewCanvas.hidden = !samples.length;
    reviewNote.textContent = samples.length
      ? "Last continuous " + data.durationS.toFixed(2) + " s · lap " + data.lap + " · gear " + (data.gear > 0 ? data.gear : "N") + ". T: throttle · B: brake · S: steering (+ right). Reading does not resume or change driving."
      : "No continuous input samples. Enable INPUTS in Settings → Display → HUD and drive in Standard view, then pause to review.";
    if (!c || !samples.length) return;
    const w = reviewCanvas.clientWidth || 640, h = 180;
    const dpr = Math.max(1, Math.min(3, win && win.devicePixelRatio || 1));
    reviewCanvas.width = Math.round(w * dpr); reviewCanvas.height = Math.round(h * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const left = 36, right = w - 52, top = 28, bottom = h - 28;
    c.clearRect(0, 0, w, h); c.fillStyle = "#10131b"; c.fillRect(0, 0, w, h);
    c.font = "16px sans-serif"; c.textBaseline = "middle";
    const y = (v, channel) => channel === "steering" ? (top + bottom) / 2 - Math.max(-1, Math.min(1,v)) * (bottom-top)/2 : bottom - clamp01(v) * (bottom-top);
    for (const [channel,label,color,legendY] of [["throttle","T",C_THR,top],["brake","B",C_BRK,top+24],["steering","S",C_STR,top+48]]) {
      c.strokeStyle = color; c.lineWidth = 2; c.beginPath();
      samples.forEach((sample,i) => { const x = right + sample.seconds / WINDOW_S * (right-left), py = y(sample[channel],channel); if(i)c.lineTo(x,py);else c.moveTo(x,py); }); c.stroke();
      c.fillStyle = color; c.fillText(label,right+12,legendY);
    }
    c.fillStyle = "#f1f3fa";
    for (const seconds of [-3,-2,-1,0]) c.fillText(seconds + " s", right + seconds/WINDOW_S*(right-left)-12,h-10);
    reviewCanvas.setAttribute("aria-label", reviewNote.textContent);
  }
  function mountReview() {
    if (review || !doc || !doc.querySelector) return !!review;
    const host = doc.querySelector("#pausemenu .sheet-body");
    if (!host) return false;
    review = doc.createElement("details"); review.className = "input-review";
    const summary = doc.createElement("summary"); summary.className = "adv-more-btn"; summary.textContent = "REVIEW INPUTS";
    reviewNote = doc.createElement("p"); reviewNote.className = "adv-help";
    reviewCanvas = doc.createElement("canvas"); reviewCanvas.width = 640; reviewCanvas.height = 180; reviewCanvas.className = "input-review-canvas";
    reviewCanvas.setAttribute("role","img");
    review.append(summary,reviewNote,reviewCanvas);
    review.addEventListener("toggle", () => { if (review.open) paintReview(); });
    if (win && win.addEventListener) win.addEventListener("resize", () => { if (review.open) paintReview(); });
    const quit = doc.getElementById("pm-quit"); host.insertBefore(review,quit && quit.parentElement === host ? quit : null);
    paintReview(); return true;
  }
  function reset() {
    const changed = trace.count || acc || drawT || labelT || sampledPlayer !== null
      || sampledGear !== null || sampledLap !== null || lastGear !== null || review && review.open;
    if (root && !root.hidden) root.hidden = true;
    if (!changed) return;
    trace.clear(); acc = drawT = labelT = 0;
    sampledPlayer = null; sampledGear = sampledLap = lastGear = null;
    if (review) { review.open = false; paintReview(); }
  }

  /** js/ui/hud.js, every frame (above the HUD throttle). Reads only. */
  function frame(G, player, dtMs) {
    if (!doc) return;
    if (!root && !bind()) return;
    // A resumed race closes the fold; the next explicit review gets a fresh
    // snapshot, while an open pause menu keeps its still chart unchanged.
    if (review && review.open) {
      const pause = doc.getElementById("pausemenu");
      if (pause && pause.hidden) review.open = false;
    }
    if (!player) { reset(); return; }
    const b = doc.body;
    if (!isOn() || b && (b.classList.contains("hud-prof-minimal") || b.classList.contains("hud-bcam") || b.classList.contains("bc-on"))) {
      reset(); return;
    }
    if (sampledPlayer !== player) { reset(); sampledPlayer = player; }
    if (root.hidden) root.hidden = false;
    const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs / 1000 : 1 / 60;
    acc += dt;
    if (acc > WINDOW_S) { trace.clear(); acc = STEP_S; }   // a pause or a hitch: start a fresh window
    const thr = clamp01(player.throttleDemand || 0), brk = clamp01(player.brakeDemand || 0), str = player.steerCommand || 0;
    sampledGear = player.gear || 0; sampledLap = player.lap || 1;
    while (acc >= STEP_S) { trace.push(thr, brk, str); acc -= STEP_S; }
    drawT -= dtMs > 0 ? dtMs : 16.7;
    if (drawT > 0) return;
    drawT = DRAW_MS;
    measure();
    draw(ctx2);
    const gear = player.gear || 0;
    if (gear !== lastGear) { lastGear = gear; if (gearEl) gearEl.textContent = gear > 0 ? String(gear) : "N"; }
    labelT -= DRAW_MS;
    if (labelT <= 0) {
      labelT = LABEL_MS;
      cv.setAttribute("aria-label", "Inputs: throttle " + pct(thr) + "%, brake " + pct(brk) + "%, steering "
        + Math.round(Math.abs(str) * 100) + "% " + (str > 0.02 ? "right" : str < -0.02 ? "left" : "centre") + ", gear " + (gear > 0 ? gear : "neutral"));
    }
  }

  // Solo pause stops HUD frames, but preference changes still arrive. Clear on
  // disable immediately so OFF → ON during pause cannot resurrect old samples.
  const store = typeof GameStore !== "undefined" && GameStore.store;
  if (store && store.subscribe) store.subscribe((change) => {
    if (change && (change.clear || change.key === "hudElements" ||
      Array.isArray(change.keys) && change.keys.includes("hudElements")) && !isOn()) reset();
  });

  return Object.freeze({ N, STEP_S, WINDOW_S, createTrace, levelY, steerY, frame, trace, snapshot, reset, mountReview });
})();
