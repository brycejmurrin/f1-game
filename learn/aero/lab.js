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
  const constants = host ? host.ownerDocument.defaultView.PhysicsConsts : window.PhysicsConsts;
  const model = constants.DirtyAir;
  const tow = {range: constants.TOW_RANGE, fade: constants.TOW_FADE, halfW: constants.TOW_HALF_W};
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const hostRoot = host?.ownerDocument.documentElement;
  get("lessonTitle").hidden = Boolean(host);
  const root = document.documentElement;
  const scheme = matchMedia("(prefers-color-scheme: light)");
  const tokens = ["--red", "--bg", "--text", "--dim", "--surf-1", "--surf-3",
    "--plate", "--plate-hover", "--card-line", "--plate-line", "--edge", "--focus",
    "--r-lg", "--r-sm", "--fs-3", "--font-ui", "--font-hud"];
  let palette;
  let reduceMotion;
  let animate = false;
  let frame = 0;
  let previousTime = 0;
  let phase = 0;
  let drag = null;
  let followerWake = 0;

  function syncAppearance() {
    if (hostRoot) {
      const style = getComputedStyle(host);
      for (const token of tokens) root.style.setProperty(token, style.getPropertyValue(token));
      root.style.colorScheme = style.colorScheme;
    } else {
      root.dataset.uiTheme = "system";
    }
    // Resolve swatches once per appearance change; Canvas cannot inherit CSS colours.
    palette = {
      leader: getComputedStyle(get("leaderKey")).backgroundColor,
      follower: getComputedStyle(get("followerKey")).backgroundColor,
      flow: getComputedStyle(canvas).color,
      cockpit: getComputedStyle(canvas).backgroundColor,
      label: getComputedStyle(document.body).color,
    };
    const reduced = hostRoot ? hostRoot.dataset.motion === "reduce" : preference.matches;
    if (reduced !== reduceMotion) {
      reduceMotion = reduced;
      animate = !reduced;
      updateMotion();
    } else {
      draw();
    }
  }

  // Use the shell's exact stylesheet URLs, including deployed offline cache keys.
  for (const name of ["tokens", "fonts-hud", "appearance-studio"]) {
    const sheet = document.createElement("link");
    sheet.rel = "stylesheet";
    const parentSheet = host?.ownerDocument.querySelector(
      'link[rel="stylesheet"][href*="css/' + name + '.css"]');
    sheet.href = parentSheet?.href || "../../css/" + name + ".css";
    sheet.addEventListener("load", syncAppearance);
    document.head.insertBefore(sheet, document.querySelector('link[href="style.css"]'));
  }

  // Coordinates are schematic so both cars stay legible at the smallest gap.
  function scene() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const leader = width * 0.84;
    const gapMin = Number(gap.min);
    const step = width * 0.57 / (Number(gap.max) - gapMin);
    const anchor = leader - width * 0.16;
    const xAt = metres => anchor - (metres - gapMin) * step;
    return {width, height, leader, xAt, step, follower: xAt(Number(gap.value)),
      mid: height * 0.52, lateral: offset.checked ? -height * 0.26 : 0};
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

  function car(x, y, scale, colour, letter) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
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
    ctx.fillText(letter, x, y - scale * 15 - 4);
  }

  function draw() {
    const {width, height, leader, follower, mid, lateral, xAt} = scene();
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
    const wakeHalf = height * 0.25;
    const scale = Math.min(1.7, width / 340);
    ctx.fillStyle = palette.follower;
    ctx.globalAlpha = 0.13;
    ctx.fillRect(edge, mid - wakeHalf, leader - edge, wakeHalf * 2);
    for (let row = -8; row <= 8; row++) {
      const cross = row * height / 19;
      const base = mid + cross;
      ctx.strokeStyle = palette.flow;
      ctx.globalAlpha = Math.abs(cross) < wakeHalf ? 0.82 : 0.45;
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 7]);
      ctx.lineDashOffset = phase * 32;
      const offsetAtRow = cross / wakeHalf * tow.halfW;
      ctx.beginPath();
      for (let x = 0; x <= width + 4; x += 4) {
        const fraction = Math.max(0, Math.min(1, (near - x) / Math.max(1, near - edge)));
        const gapAtX = gapMin + fraction * (tow.range - gapMin);
        const wake = x >= edge && x < leader
          ? model.wakeOf(gapAtX, offsetAtRow, "classic", tow) : 0;
        const y = base + wake * height * 0.17 * Math.sin(x / width * 31 + phase * 4 + row);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.label;
    ctx.setLineDash(followerWake > 0 ? [3, 3] : []);
    ctx.strokeRect(follower - 24 * scale, mid + lateral - 17 * scale, 48 * scale, 34 * scale);
    ctx.setLineDash([]);
    car(leader, mid, scale, palette.leader, "A");
    car(follower, mid + lateral, scale, palette.follower, "B");
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
    const result = measure(distance, offset.checked ? tow.halfW : 0, onStraight);
    followerWake = result.wake;
    const headway = (distance / constants.VMAX).toFixed(2);
    get("gapValue").textContent = distance + " m · " + headway + " s";
    gap.setAttribute("aria-valuetext", distance + " metres, " + headway + " seconds");
    for (const [key, value] of Object.entries(result)) {
      get(key).textContent = Math.round(value * 100) + "%";
      get(key + "Meter").value = value;
    }
    const state = result.wake === 0 ? "Clear air" : onStraight ? "Tow available" : "Cornering in wake";
    if (get("state").textContent !== state) get("state").textContent = state;
    get("effect").textContent = result.wake === 0
      ? "Car B is outside the shaded wake. It has clean-air grip and no tow."
      : onStraight ? "The straight-line tow is available. Wake exposure still reduces grip."
      : "The corner removes the usable tow. At this gap and offset the grip loss is unchanged.";
    draw();
  }

  const pointerX = (event, box) => (event.clientX - box.left) * canvas.clientWidth / box.width;
  canvas.addEventListener("pointerdown", event => {
    if (drag || event.button !== 0) return;
    const box = canvas.getBoundingClientRect();
    const {follower, mid, lateral} = scene();
    const y = (event.clientY - box.top) * canvas.clientHeight / box.height;
    const x = pointerX(event, box);
    if (Math.abs(x - follower) > 34 || Math.abs(y - mid - lateral) > 30) return;
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
  preference.addEventListener("change", syncAppearance);
  scheme.addEventListener("change", syncAppearance);
  if (hostRoot) {
    const observer = new MutationObserver(syncAppearance);
    observer.observe(hostRoot, {
      attributeFilter: ["style", "class", "data-ui-theme", "data-menu-accent", "data-team",
        "data-ui-contrast", "data-text-size", "data-cvd", "data-motion", "data-look-popups-corners"],
    });
    window.addEventListener("pagehide", () => observer.disconnect(), {once: true});
  }
  document.addEventListener("visibilitychange", updateMotion);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && window.parent !== window) {
      window.parent.postMessage({type: "apex-learn-close"}, window.location.origin);
    }
  });
  syncAppearance();
  new ResizeObserver(draw).observe(canvas);
  update();
  updateMotion();
})();
