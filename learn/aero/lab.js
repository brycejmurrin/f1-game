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
  let palette;
  let reduceMotion;
  let animate = false;
  let frame = 0;
  let previousTime = 0;
  let phase = 0;
  let drag = null;
  let onStraight = true;

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
      updateMotion();
    } else {
      draw();
    }
  }

  // Coordinates are schematic so both cars stay legible at the smallest gap.
  function scene() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const leader = width * 0.84;
    const step = width * 0.57 / 40;
    const follower = leader - width * 0.16 - (Number(gap.value) - 5) * step;
    return {width, height, leader, step, follower, mid: height * 0.52,
      lateral: offset.checked ? -height * 0.26 : 0};
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
    ctx.fillRect(-20, -12, onStraight ? 2 : 6, 24);
    ctx.fillRect(17, -11, onStraight ? 2 : 5, 22);
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
    const {width, height, leader, follower, mid, lateral} = scene();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(width * dpr), h = Math.round(height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    for (let row = -8; row <= 8; row++) {
      const base = mid + row * height / 19;
      ctx.strokeStyle = palette.flow;
      ctx.globalAlpha = Math.abs(row) < 3 ? 0.75 : 0.4;
      ctx.lineWidth = Math.abs(row) < 3 ? 1.4 : 1;
      ctx.setLineDash([9, 8]);
      ctx.lineDashOffset = phase * 20 + row * 0.8;
      ctx.beginPath();
      for (let x = 0; x <= width + 4; x += 4) {
        const behind = Math.max(0, (leader - x) / width);
        const envelope = Math.min(1, behind * 18) * Math.exp(-behind * 4 - row * row / 8);
        const y = base + envelope * height * 0.09 * Math.sin(x / width * 26 + phase * 2 + row);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    const scale = Math.min(1.7, width / 340);
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
    const speed = constants.VMAX;
    const wake = model.wakeOf(distance, offset.checked ? tow.halfW : 0, "classic", tow);
    const grip = model.mul(wake, speed, "classic", constants.DOWNFORCE, speed);
    onStraight = document.querySelector("input[name=section]:checked").value === "straight";
    get("wing").textContent = onStraight ? "Straight Mode · low drag" : "Corner Mode · high downforce";
    const headway = (distance / speed).toFixed(2);
    get("gapValue").textContent = distance + " m · " + headway + " s";
    gap.setAttribute("aria-valuetext", distance + " metres, " + headway + " seconds");
    get("grip").textContent = Math.round(grip * 100) + "%";
    get("wake").textContent = Math.round(wake * 100) + "%";
    get("wakeMeter").value = wake;
    get("gripMeter").value = grip;
    get("state").textContent = wake === 0 ? "Clear air" : onStraight ? "Tow available" : "Cornering in wake";
    get("effect").textContent = wake === 0
      ? "Car B is outside the classic wake. Its grip returns to the clean-air baseline."
      : onStraight ? "Car B can use the straight-line tow. Its available grip is already reduced."
      : "Steering into the corner ends the usable tow. Car B still feels the grip loss at this gap.";
    draw();
  }

  canvas.addEventListener("pointerdown", event => {
    const box = canvas.getBoundingClientRect();
    const {follower, mid, lateral} = scene();
    if (drag || Math.abs(event.clientX - box.left - follower) > 34 ||
        Math.abs(event.clientY - box.top - mid - lateral) > 30) return;
    canvas.setPointerCapture(event.pointerId);
    drag = {id: event.pointerId, x: event.clientX, gap: Number(gap.value)};
  });
  canvas.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.id) return;
    gap.value = Math.round(drag.gap - (event.clientX - drag.x) / scene().step);
    update();
  });
  canvas.addEventListener("lostpointercapture", () => { drag = null; });
  document.querySelector(".settings").addEventListener("input", update);
  motion.addEventListener("click", () => { animate = !animate; updateMotion(); });
  document.addEventListener("visibilitychange", updateMotion);
  LearnAppearance.mount(syncAppearance);
  new ResizeObserver(draw).observe(canvas);
  update();
  updateMotion();
})();
