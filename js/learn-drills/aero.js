/* Apex 26 — AeroDrill: LEARN's Aero Lab Scenario, moved out of js/ui/learn-door.js (#6920 U4.1b, move-only).
   A Monza GP with both cars at speed in the tow: descriptor() is the DrillRegistry descriptor, begin(G) places the cars
   once the grid is up, guide(G) builds the render-only lesson cues. LearnDoor.defineDrills() registers it lazily.
   THE ARC NEVER REACHES THE DRIVER: begin() writes the two cars' arc position and speed only; the guide reads the
   driving-line profile to place cues and draws them, and writes nothing to a car (tests/unit/drill-registry.test.mjs).
   LAZY_LEARN. */
const AeroDrill = (function () {
  "use strict";

  function beginAeroDrill(G) {
    // Start just past the line with a closing speed and a 24 m gap inside
    // the 34 m Classic tow window. Both cars need room left in the aero zone.
    const start = 100, gap = 24;
    const zone = G.aeroZoneAt(start), player = G.player;
    const rival = G.cars.find(c => c !== player);
    if (!zone || G.aeroZoneAt(start + gap) !== zone || !player || !rival || G.state !== "count") return false;
    const speed = G.vTop();
    const place = (c, s, entrySpeed) => {
      c.s = c._prevS = c.prog = c.rPrevS = s;
      c.lap = 1;
      c.x = c.xVis = c.rPrevX = TrackLine.at(G.track, s).x;
      c.speed = entrySpeed;
      c.gear = 6;
      RealRace.seatOnRoad(G.track, c);
    };
    place(player, start, speed * 0.94);
    place(rival, start + gap, speed * 0.80);
    if (!G.goRolling()) return false;
    G.snapGameCam();
    G.coach.setPracticeGoal("slipstream");
    return G.coach.mark();
  }

  // Rendering-only lesson cues. Use the driving-line shader so the cars and
  // cockpit occlude the lesson markings as they do any other road marking.
  function createAeroGuide(G, port) {
    const root = document.createElement("div");
    root.id = "learn-aero-guide";
    root.hidden = true;
    // RETRY (#6555 A4): back to the drill's start from the card, without the pause menu (a 44 px chip).
    const retry = document.createElement("button");
    retry.type = "button";
    retry.id = "learn-aero-retry";
    retry.textContent = "RETRY";
    retry.addEventListener("click", () => { if (port) port.retry(); });
    const task = document.createElement("strong");
    task.setAttribute("role", "status");
    const readout = document.createElement("span");
    const demoLabel = document.createElement("span");
    const scope = document.createElement("canvas");
    scope.width = 280;
    scope.height = 148;
    scope.setAttribute("aria-hidden", "true");
    const ctx = scope.getContext("2d");
    const copy = document.createElement("div");
    copy.append(task, readout, demoLabel);
    root.append(scope, copy, retry);
    document.body.append(root);
    const sample = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0] };
    const stride = DrivingLine.STRIDE;
    const verts = new Float32Array(640 * stride);
    // The existing shader chooses a palette colour from its speed ratio.
    // Encode cyan wake, pale clean air and orange braking with fixed attributes.
    const style = { speed: 2, cornersOnly: false, opacity: 0.86,
      cols: new Float32Array([0.08, 0.78, 0.96, 0.65, 0.90, 1, 1, 0.18, 0.05]) };
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const windArrows = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
    const demo = { s: 0, x: 0, aeroX: 0, braking: false };
    const air = { cross: 0, speed: 1, time: 0, rear: 0, lane: 0, wake: true };
    let count = 0, brakeAt, profile;

    function smooth(v) {
      const t = M4.clamp(v, 0, 1);
      return t * t * (3 - 2 * t);
    }

    // A local top view stays readable behind the helmet halo. The wake
    // footprint uses the drill's Classic falloff, as does the car physics.
    let footprint, lastX, lastY;
    function drawScope(gap, offset) {
      if (!ctx) return;
      const x = 140, y = 24, scaleX = 13, scaleY = 2.9;
      const px = Math.round(M4.clamp(x + offset * scaleX, 14, 266));
      const py = Math.round(M4.clamp(y + gap * scaleY, 12, 126));
      if (px === lastX && py === lastY) return;
      lastX = px;
      lastY = py;
      if (!footprint) {
        footprint = document.createElement("canvas");
        footprint.width = scope.width;
        footprint.height = scope.height;
        const field = footprint.getContext("2d");
        for (let d = 1; d < 34; d++) {
          const strength = PhysicsConsts.DirtyAir.wakeOf(d, 0, "classic");
          const w = 4 * scaleX;
          const band = field.createLinearGradient(x - w, 0, x + w, 0);
          band.addColorStop(0, "transparent");
          band.addColorStop(0.5, "rgba(30,231,255," + strength + ")");
          band.addColorStop(1, "transparent");
          field.fillStyle = band;
          field.fillRect(x - w, y + d * scaleY, 2 * w, scaleY + 0.5);
        }
        field.fillStyle = "#90f1ff";
        field.fillRect(x - 7, y - 9, 14, 16);
        field.font = "bold 28px system-ui";
        field.fillText("Rival", x + 17, y + 7);
      }
      ctx.clearRect(0, 0, scope.width, scope.height);
      ctx.drawImage(footprint, 0, 0);
      ctx.font = "bold 28px system-ui";
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px, py - 9);
      ctx.lineTo(px + 8, py + 7);
      ctx.lineTo(px - 8, py + 7);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = px > 195 ? "right" : "left";
      ctx.fillText("You", px + (px > 195 ? -15 : 15), py + 8);
      ctx.textAlign = "left";
    }

    function demonstrate(ahead, lane, wayIn) {
      const time = G.raceT;
      const merge = smooth((time - 0.25) / 1.5);
      const close = smooth((time - 1.75) / 1.75);
      const slowdown = brakeAt == null ? 0 : smooth((ahead - brakeAt + 8) / 70);
      demo.s = ahead - (17 - 7 * close + 13 * slowdown);
      demo.x = lane + wayIn * 4.4 * (1 - merge);
      demo.braking = brakeAt != null && demo.s >= brakeAt - 8;
      const shut = demo.braking ? smooth((demo.s - brakeAt + 8) / 7) : 0;
      demo.aeroX = G.aeroZoneAt(demo.s) ? smooth((time - 1.57) / 0.33) * (1 - shut) : 0;
      const phase = demo.braking ? "brakes for Turn 1" : merge < 0.98 ? "tucks into the wake"
        : close > 0.90 ? "eases off for space" : demo.aeroX > 0.15 ? "uses Straight Mode" : "holds the gap";
      const label = "Guide car · " + phase;
      if (demoLabel.textContent !== label) demoLabel.textContent = label;
    }

    function strip(near, far, lane, halfWidth, colour, phase, height = 0) {
      if (near >= far) return;
      const join = count * stride;
      // Repeat each end vertex at the join so the strips share one draw
      // without a triangle that connects the wake to the braking marker.
      if (join) count += 2;
      const steps = Math.ceil((far - near) / (height ? 0.6 : 2));
      for (let i = 0; i <= steps; i++) {
        const along = near + (far - near) * i / steps;
        const s = G.wrapS(along);
        Tracks.sample(G.track, s, sample);
        const { p, r, t, hw } = sample;
        let center = lane, rise = height;
        if (height) {
          // Approximate tracer advection from the local air speed. The Classic
          // falloff is the same gap and offset model that drives slipstream.
          const distance = Math.max(0, air.rear - along);
          center += air.cross * distance / air.speed;
          if (air.wake) {
            const strength = PhysicsConsts.DirtyAir.wakeOf(distance, lane - air.lane, "classic");
            // Paired counter-rotating vortices open from the rear wheels.
            // The elevated central plume leaves the rival visible between them.
            const direction = Math.sign(lane - air.lane);
            const wave = distance * 0.58 - air.time * 4.5;
            const spread = Math.min(1, distance / 7);
            const radius = spread * (0.65 + 0.8 * strength);
            center += direction * (spread + Math.cos(wave) * radius);
            rise += direction ? Math.sin(wave) * radius : spread + Math.sin(wave) * 0.3;
          }
        }
        for (let side = -1; side <= 1; side += 2) {
          const edge = center + halfWidth * side;
          const x = height ? edge : Math.max(-hw + 0.2, Math.min(edge, hw - 0.2));
          const lift = DrivingLine.bankOffset(G.track, s, x) + 0.04 + rise + (height ? side * halfWidth * 0.65 : 0);
          let v = count++ * stride;
          verts[v++] = p[0] + r[0] * x + (r[1] * t[2] - r[2] * t[1]) * lift;
          verts[v++] = p[1] + r[1] * x + (r[2] * t[0] - r[0] * t[2]) * lift;
          verts[v++] = p[2] + r[2] * x + (r[0] * t[1] - r[1] * t[0]) * lift;
          verts[v++] = height ? side * 0.30 : side;
          verts[v++] = colour;
          verts[v++] = 1;
          // Keep an illuminated core along the whole airborne ribbon. A
          // shallow travelling ripple makes the airflow readable in motion.
          verts[v] = height ? 2.84 + 0.14 * Math.sin((along - near) * 0.6 - phase) : along - near;
        }
      }
      if (join) {
        verts.copyWithin(join, join - stride, join);
        verts.copyWithin(join + stride, join + 2 * stride, join + 3 * stride);
      }
    }

    function draw(gfx, api, alpha, visible) {
      const player = G.player;
      if (!visible || !player || player.lap !== 1 || player.s < 80) { hide(); return; }
      const rival = G.cars.find(c => c !== player && !c.retired);
      const turnAt = G.track.def.turns[0] * G.track.total;
      if (!rival || player.s > turnAt + 45) { hide(); return; }
      // Build the profile even when the normal driving line is off.
      DrivingLine.prepare(api);
      if (profile !== api.vTop) {
        profile = api.vTop;
        brakeAt = null;
        for (let s = 144; s < turnAt; s += 4) {
          const speed = DrivingLine.speedAt(s);
          if (speed != null && speed < G.vTop() * 0.94) { brakeAt = s; break; }
        }
      }
      const toBrake = brakeAt == null ? Infinity : brakeAt - player.s;
      root.hidden = false;
      const gap = rival.prog - player.prog;
      const inWake = player.wake > 0.08;
      const wing = player.aeroX > 0.15 ? "Aero open" : player.xArmed ? "Aero ready" : "Corner Mode";
      let instruction = "Follow the airflow behind the rival";
      if (player.s >= turnAt - 24) instruction = "Turn in for the chicane";
      else if (toBrake <= 14) instruction = player.brakeDemand > 0.05 ? "Keep braking for Turn 1" : "Brake for Turn 1";
      else if (gap < 0) instruction = "Let the rival back ahead";
      else if (gap <= 10) instruction = "Ease off to leave space";
      else if (gap > 34) instruction = "Close on the rival ahead";
      else if (!inWake) instruction = "Tuck into the cyan wake";
      else if (player.xArmed && player.aeroX <= 0.15 && G.raceAeroMode !== "auto") instruction = Onboard.prompt("aero");
      if (task.textContent !== instruction) task.textContent = instruction;
      const wind = Wind.state();
      const angle = Math.atan2(wind.wx, wind.wz) - player.head;
      // The road's right vector is the negative angular direction from heading.
      const arrow = windArrows[(Math.round(-angle * 4 / Math.PI) % 8 + 8) % 8];
      const status = [player.towing > 0.08 ? "Tow active" : "Clear of tow", wing,
        wind.on ? "Wind " + arrow + " " + AppearanceOpts.speed(wind.kmh) + " " + AppearanceOpts.unitLabel() : ""].filter(Boolean).join(" · ");
      if (readout.textContent !== status) readout.textContent = status;
      count = 0;
      const ahead = rival.rPrevS + (rival.s - rival.rPrevS) * alpha;
      const lane = rival.rPrevX + (rival.x - rival.rPrevX) * alpha;
      const wayIn = lane > 0 ? -1 : 1;
      demonstrate(ahead, lane, wayIn);
      drawScope(gap, player.x - lane);
      if (gap > 0 && gap < 125) {
        const reduced = motion.matches || document.documentElement.dataset.motion === "reduce";
        Tracks.sample(G.track, G.wrapS(ahead), sample);
        air.cross = wind.wx * sample.r[0] + wind.wz * sample.r[2];
        air.speed = Math.max(api.vTop * 0.25, rival.speed - wind.wx * sample.t[0] - wind.wz * sample.t[2]);
        air.time = reduced ? 0 : G.raceT;
        air.rear = ahead - 2;
        air.lane = lane;
        const phase = -air.time * air.speed * 0.6 % (2 * Math.PI);
        const near = ahead - Math.min(34, gap - 3);
        air.wake = true;
        strip(near, air.rear, lane - 1.25, 0.36, 3, phase, 1.75);
        strip(near, air.rear, lane + 1.25, 0.36, 3, phase, 1.75);
        // Lift the middle stream above the outer pair so both driving views
        // read three separate ribbons even when the eye is low to the road.
        strip(near, air.rear, lane, 0.24, 3, phase + 2, 2.15);
        air.wake = false;
        // A clean reference outside the wake makes sideways wind drift visible.
        strip(near, ahead + 4, lane + wayIn * 5.8, 0.14, 2 / 1.06, phase, 1.45);
      }
      if (toBrake < 150 && toBrake > -22) strip(brakeAt, brakeAt + 15, TrackLine.at(G.track, brakeAt).x, 3, 1, 0);
      if (count && gfx.drawDrivingLine?.(verts, count, true, style)) DrivingLine.invalidateUpload();
      return true; // the drill owns the road markings on this approach
    }

    function hide() { root.hidden = true; }
    return { draw, hide, car: () => demo, remove: () => root.remove() };
  }

  // The Aero Lab's medal tiers, in metres closed on the rival (the best approach from the 24 m start). Derived from
  // 20 VM runs (tests/data/learn-drill-refs.json, pinned by tests/unit/drill-aero-medals-vm.test.mjs): bronze is their median,
  // silver the furthest a run got before it dropped out of the wake, gold the shortest clean finish in the wake.
  const AERO_MEDALS = Object.freeze({ bronze: 7.1, silver: 9.2, gold: 15.7, goldClean: true });

  // Read-only on the cars (#6559 §1e rule 1): the gap to the rival, its nearest point and the tow actually felt.
  function sampleAero(G, acc) {
    const p = G.player, rival = G.cars.find(c => c !== p);
    if (!p || !rival) return;
    const gap = rival.prog - p.prog;
    if (acc.gap0 == null) { acc.gap0 = gap; acc.gapMin = gap; acc.towS = 0; acc.t = G.raceT; }
    acc.gapMin = Math.min(acc.gapMin, gap);
    acc.towS += Math.max(0, G.raceT - acc.t) * (p.towing || 0);
    acc.t = G.raceT;
  }

  /** Metres closed = the start gap less the nearest gap reached: a run that falls out of the tow keeps the ground it
   *  made. last is RaceInsights' lastDrill (clean, reason, seconds). Every number is measured. */
  function scoreAero(G, last, acc) {
    const gap0 = Number.isFinite(acc.gap0) ? acc.gap0 : 24, nearest = Number.isFinite(acc.gapMin) ? acc.gapMin : gap0;
    const value = Math.max(0, gap0 - nearest);
    const verdict = last.clean
      ? "You closed " + value.toFixed(1) + " m and finished in the wake: the tow did the work while the rival punched the air."
      : "The run ended: " + last.reason + ". You got within " + Math.max(0, nearest).toFixed(1)
        + " m. Stay in the cyan wake on full throttle to close the rest.";
    return {
      value, unit: "m", better: "high", clean: !!last.clean, reason: last.reason || "",
      metrics: [
        ["Closed", value.toFixed(1), "m"],
        ["Nearest gap", Math.max(0, nearest).toFixed(1), "m"],
        ["Tow felt", (acc.towS || 0).toFixed(1), "s"],
        ["Run time", (last.seconds || 0).toFixed(1), "s"],
        ["Run", last.clean ? "clean" : last.reason, ""],
      ],
      verdict,
    };
  }

  const descriptor = () => ({
    id: "aero", lesson: "aero", title: "Monza Aero Drill",
    setup: { flow: "gp", session: "race", track: "monza", weather: "dry", changeable: false, grid: "tier", duel: false, dirtyAir: "classic", wind: "real" },
    begin: beginAeroDrill,
    guide: createAeroGuide,
    goal: "slipstream",
    sample: sampleAero,
    score: scoreAero,
    medals: AERO_MEDALS,
  });

  return { descriptor, begin: beginAeroDrill, guide: createAeroGuide };
})();
Object.freeze(AeroDrill);
