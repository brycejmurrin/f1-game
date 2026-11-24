(async () => {
  "use strict";
  // frameElement is null for standalone and cross-origin embeds.
  const host = window.frameElement;
  if (!host && !window.PhysicsConsts) {
    const ready = await new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "../../js/physics/consts.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
    if (!ready) {
      document.querySelector("main").textContent = "Aero Lab could not load the driving model.";
      return;
    }
  }
  const get = id => document.getElementById(id);
  const canvas = get("flow");
  const ctx = canvas.getContext("2d");
  const gap = get("gap");
  const offset = get("offset");
  const motion = get("motion");
  const direction = get("direction");
  const constants = host ? host.ownerDocument.defaultView.PhysicsConsts : window.PhysicsConsts;
  const model = constants.DirtyAir;
  const tow = {range: constants.TOW_RANGE, fade: constants.TOW_FADE, halfW: constants.TOW_HALF_W};
  let palette;
  let reduceMotion;
  let animate = false;
  let frame = 0;
  let previousTime = 0;
  let phase = 0;
  let drag = null;
  let followerWake = 0;
  let corner = false;
  const wakeHalfRatio = .25;
  let cornerProgress = 0;
  const replayHost = get("corner-replay");
  const cornerReplay = LearnReplay.mount(replayHost, {
    label: "corner",
    describe: value => (value < .27 ? "Entry" : value < .70 ? "Through turn" : "Exit") + " · " + Math.round(value * 100) + "%",
    draw(value) { cornerProgress = value; draw(); },
  });

  function syncAppearance(reduced) {
    // Resolve swatches once per appearance change; Canvas cannot inherit CSS colours.
    palette = {
      leader: getComputedStyle(get("leaderKey")).backgroundColor,
      follower: getComputedStyle(get("followerKey")).backgroundColor,
      flow: getComputedStyle(canvas).color,
      cockpit: getComputedStyle(canvas).backgroundColor,
      label: getComputedStyle(document.body).color,
    };
    if (reduced !== reduceMotion) {
      reduceMotion = reduced;
      animate = !reduced;
      cornerReplay.reduced(reduced);
      updateMotion();
    } else {
      draw();
    }
  }

  // Leave room behind Car B at the widest gap so its trail stays visible.
  function scene() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const leader = width * 0.84;
    const gapMin = Number(gap.min);
    const step = width * 0.50 / (Number(gap.max) - gapMin);
    const anchor = leader - width * 0.16;
    const xAt = metres => anchor - (metres - gapMin) * step;
    const mid = height * 0.52;
    const handedness = direction.value === "left" ? -1 : 1;
    const turnX = width * (0.99 - 0.96 * cornerProgress);
    const trackY = x => corner && width > 0
      ? mid + handedness * height * .18 * Math.tanh(4 * (x - turnX) / width)
      : mid;
    return {width, height, leader, xAt, step, follower: xAt(Number(gap.value)),
      trackY, lateral: offset.checked ? -height * wakeHalfRatio : 0};
  }

  function measure(distance, lateral, straight) {
    const speed = constants.VMAX;
    const wake = model.wakeOf(distance, lateral, "classic", tow);
    return {
      wake,
      grip: model.mul(wake, speed, "classic", constants.DOWNFORCE, speed),
      tow: straight ? wake : 0,
    };
  }

  function car(x, y, scale, colour, letter, angle = 0, selected = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    if (selected) {
      ctx.strokeStyle = palette.label;
      ctx.setLineDash(followerWake > 0 ? [3, 3] : []);
      ctx.strokeRect(-24, -17, 48, 34);
      ctx.setLineDash([]);
    }
    ctx.fillStyle = palette.label;
    for (const axle of [-14, 11]) {
      for (const side of [-1, 1]) ctx.fillRect(axle, side * 10 - 3, 8, 6);
    }
    ctx.fillStyle = colour;
    ctx.fillRect(-20, -12, 4, 24);
    ctx.fillRect(17, -11, 4, 22);
    ctx.beginPath();
    const hull = [[-17,-3],[-6,-8],[3,-7],[9,-3],[18,-1],[18,1],[9,3],[3,7],[-6,8],[-17,3]];
    for (const [i, point] of hull.entries()) {
      if (i === 0) ctx.moveTo(...point);
      else ctx.lineTo(...point);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = palette.cockpit;
    ctx.beginPath();
    ctx.ellipse(2, 0, 5, 3, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = palette.label;
    ctx.font = "bold 13px monospace";
    ctx.textAlign = "center";
    const labelY = y - scale * 15 - 4;
    ctx.fillText(letter, x, labelY < 13 ? y + scale * 15 + 12 : labelY);
  }

  function band(from, to, halfWidth, trackY) {
    ctx.beginPath();
    ctx.moveTo(from, trackY(from) - halfWidth);
    const slices = Math.ceil((to - from) / 4);
    for (let i = 1; i <= slices; i++) {
      const x = from + (to - from) * i / slices;
      ctx.lineTo(x, trackY(x) - halfWidth);
    }
    for (let i = slices; i >= 0; i--) {
      const x = from + (to - from) * i / slices;
      ctx.lineTo(x, trackY(x) + halfWidth);
    }
    ctx.closePath();
    ctx.fill();
  }

  function draw() {
    if (!palette) return;
    const {width, height, leader, follower, lateral, xAt, trackY} = scene();
    if (!width || !height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(width * dpr), h = Math.round(height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const edge = xAt(tow.range);
    const gapMin = Number(gap.min);
    const near = xAt(gapMin);
    const wakeHalf = height * wakeHalfRatio;
    const scale = Math.min(1.7, width / 340, height / 105);
    // Car A sets the measured wake. The overlay follows Car B and illustrates local flow.
    const followerY = trackY(follower) + lateral;
    const heading = x => Math.atan2(trackY(x + 1) - trackY(x - 1), 2);
    const followerRear = follower - 20 * scale;
    const followerSpan = 40 * scale;
    const followerTrail = Math.max(followerSpan, width * 0.14);
    const followerInk = ctx.createLinearGradient(followerRear - followerTrail, 0, follower + followerSpan, 0);
    followerInk.addColorStop(0, "transparent");
    followerInk.addColorStop(0.42, palette.follower);
    followerInk.addColorStop(0.7, palette.follower);
    followerInk.addColorStop(1, "transparent");
    if (corner) {
      ctx.fillStyle = palette.label;
      ctx.globalAlpha = .10;
      band(0, width, height * .30, trackY);
    }
    ctx.fillStyle = palette.follower;
    ctx.globalAlpha = 0.13;
    band(edge, leader, wakeHalf, trackY);
    for (let row = -8; row <= 8; row++) {
      const cross = row * height / 19;
      const fromFollower = cross - lateral;
      const nearFollower = Math.exp(-((fromFollower / (22 * scale)) ** 2));
      const side = fromFollower < 0 ? -1 : 1;
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 7]);
      ctx.lineDashOffset = phase * 32;
      const offsetAtRow = cross / wakeHalf * tow.halfW;
      const path = new Path2D();
      for (let x = 0; x <= width + 4; x += 4) {
        const fraction = Math.max(0, Math.min(1, (near - x) / Math.max(1, near - edge)));
        const gapAtX = gapMin + fraction * (tow.range - gapMin);
        const wake = x >= edge && x < leader
          ? model.wakeOf(gapAtX, offsetAtRow, "classic", tow) : 0;
        const fromRear = (followerRear - x) / followerTrail;
        const aroundCar = Math.exp(-(((x - follower) / (followerSpan * 0.65)) ** 2));
        const trail = fromRear > 0 ? Math.min(1, fromRear * 7) * Math.max(0, 1 - fromRear) : 0;
        const leaderWave = wake * height * 0.12 * Math.sin(x / width * 31 + phase * 4 + row);
        const split = side * 14 * scale * aroundCar;
        const ripple = trail * scale * (2 + 9 * followerWake)
          * Math.sin((x - followerRear) / followerTrail * 18 + phase * 6 + row);
        const y = trackY(x) + cross + leaderWave + nearFollower * (split + ripple);
        if (x === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      }
      ctx.strokeStyle = palette.flow;
      ctx.globalAlpha = Math.abs(cross) < wakeHalf ? 0.82 : 0.45;
      ctx.stroke(path);
      if (nearFollower > 0.12) {
        ctx.strokeStyle = followerInk;
        ctx.globalAlpha = nearFollower * (0.7 + 0.3 * followerWake);
        ctx.lineWidth = 1.6;
        ctx.stroke(path);
      }
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    car(leader, trackY(leader), scale, palette.leader, "A", heading(leader));
    car(follower, followerY, scale, palette.follower, "B", heading(follower), true);
    if (lateral) {
      ctx.fillStyle = palette.label;
      ctx.beginPath();
      ctx.arc(follower, followerY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function tick(time) {
    if (previousTime) phase += Math.min((time - previousTime) / 1000, 0.1);
    previousTime = time;
    draw();
    frame = requestAnimationFrame(tick);
  }

  function updateMotion() {
    cancelAnimationFrame(frame);
    previousTime = 0;
    motion.textContent = animate ? "Pause flow" : "Play flow";
    if (animate && !document.hidden) frame = requestAnimationFrame(tick);
    else draw();
  }

  function update() {
    const distance = Number(gap.value);
    const onStraight = document.querySelector("input[name=section]:checked").value === "straight";
    if (corner === onStraight) {
      corner = !onStraight;
      replayHost.hidden = get("direction-row").hidden = !corner;
      cornerReplay.stop();
      cornerReplay.seek(0);
    }
    const result = measure(distance, offset.checked ? tow.halfW : 0, onStraight);
    followerWake = result.wake;
    const headway = (distance / constants.VMAX).toFixed(2);
    get("gapValue").textContent = distance + " m · " + headway + " s";
    gap.setAttribute("aria-valuetext", distance + " metres, " + headway + " seconds");
    get("gap-formula").textContent = distance + " m ÷ " + constants.VMAX + " m/s = " + headway + " s at the Apex reference speed.";
    for (const [key, value] of Object.entries(result)) {
      get(key).textContent = Math.round(value * 100) + "%";
      get(key + "Meter").value = value;
    }
    const state = result.wake === 0 ? "Clear air" : onStraight ? "Tow available" : "Cornering in wake";
    if (get("state").textContent !== state) get("state").textContent = state;
    get("effect").textContent = result.wake === 0
      ? "Car B’s centre is at or beyond the shaded wake boundary. The Apex model gives it clean-air grip and no tow."
      : onStraight ? "The straight-line tow is available. Wake exposure still reduces grip."
      : "The Apex corner preset removes usable tow. At this gap and offset the modelled grip loss stays the same.";
    draw();
  }

  const pointerX = (event, box) => (event.clientX - box.left) * canvas.clientWidth / box.width;
  canvas.addEventListener("pointerdown", event => {
    if (drag || event.button !== 0) return;
    const box = canvas.getBoundingClientRect();
    const {follower, lateral, trackY} = scene();
    const y = (event.clientY - box.top) * canvas.clientHeight / box.height;
    const x = pointerX(event, box);
    if (Math.abs(x - follower) > 34 || Math.abs(y - trackY(follower) - lateral) > 30) return;
    canvas.setPointerCapture(event.pointerId);
    drag = {id: event.pointerId, x, gap: Number(gap.value)};
    canvas.dataset.dragging = "";
  });
  canvas.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.id) return;
    const x = pointerX(event, canvas.getBoundingClientRect());
    const value = Math.round(drag.gap - (x - drag.x) / scene().step);
    gap.value = Math.max(Number(gap.min), Math.min(Number(gap.max), value));
    update();
  });
  canvas.addEventListener("lostpointercapture", () => {
    drag = null;
    delete canvas.dataset.dragging;
  });
  document.querySelector(".settings").addEventListener("input", update);
  get("prediction").addEventListener("submit", event => {
    event.preventDefault();
    const answer = get("prediction").querySelector("input:checked");
    const feedback = get("feedback");
    if (!answer) {
      feedback.textContent = "Choose a prediction to check it.";
      return;
    }
    const straight = measure(10, 0, true);
    const corner = measure(10, 0, false);
    const percent = value => Math.round(value * 100) + "%";
    const lead = answer.value === "tow" ? "Correct. " : "Try it and compare. ";
    feedback.textContent = lead + "The usable tow drops from " + percent(straight.tow) + " to "
      + percent(corner.tow) + ". Grip stays at " + percent(corner.grip) + " of clean air.";
    gap.value = 10;
    offset.checked = false;
    document.querySelector("input[name=section][value=corner]").checked = true;
    update();
  });
  const aeroZone = get("aero-zone");
  const aeroEnabled = get("aero-enabled");
  const aeroRequest = get("aero-request");
  function updateWings(request) {
    const canUse = aeroEnabled.checked && aeroZone.value !== "outside";
    const front = request && canUse;
    const rear = front && aeroZone.value === "normal";
    for (const [axle, straight] of [["front", front], ["rear", rear]]) {
      get(axle + "-mode").textContent = straight ? "Straight Mode" : "Corner Mode";
      get(axle + "-flap").dataset.straight = String(straight);
    }
    get("aero-verdict").textContent = !request
      ? "Both wings start in Corner Mode. Predict which flaps can move, then request activation."
      : !aeroEnabled.checked ? "Activation refused. The control electronics have not enabled it."
      : !canUse ? "Activation refused. The car is outside an activation zone."
      : rear ? "Full activation. Front and rear switch to the lower-drag configuration."
      : "Partial activation. The front switches to Straight Mode and the rear stays in Corner Mode.";
  }
  aeroZone.addEventListener("change", () => updateWings(false));
  aeroEnabled.addEventListener("change", () => updateWings(false));
  aeroRequest.addEventListener("click", () => updateWings(true));
  updateWings(false);
  const flowSpeed = get("flow-speed");
  function updatePressure() {
    const speed = Number(flowSpeed.value);
    const ratio = (speed / 100) ** 2;
    const speedText = speed + "% of clean air";
    flowSpeed.setAttribute("aria-valuetext", speedText);
    get("flow-speed-value").textContent = speedText;
    get("local-pressure").textContent = Math.round(ratio * 100) + "%";
    get("local-pressure-meter").value = ratio;
    get("pressure-ratio").textContent = (speed / 100).toFixed(2) + "² = "
      + ratio.toFixed(2) + " of the clean-air pressure and force.";
  }
  flowSpeed.addEventListener("input", updatePressure);
  updatePressure();
  motion.addEventListener("click", () => { animate = !animate; updateMotion(); });
  document.addEventListener("visibilitychange", updateMotion);
  LearnAppearance.mount(syncAppearance);
  new ResizeObserver(draw).observe(canvas);
  cornerReplay.seek(0);
  update();
  updateMotion();
})();
