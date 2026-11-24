(() => {
  "use strict";

  const get = id => document.getElementById(id);
  const brake = get("brake");
  const turn = get("turn");
  const plot = document.querySelector(".plot");
  const requested = [plot.querySelector(".ray.requested"), plot.querySelector(".point.requested")];
  const delivered = [plot.querySelector(".ray.achieved"), plot.querySelector(".point.achieved")];
  const limitPoint = plot.querySelector(".point.limit");
  const guide = plot.querySelector(".guide");
  const surfaces = document.querySelectorAll("[name=surface]");
  const stages = document.querySelectorAll("[data-stage]");
  const answers = document.querySelectorAll("[data-answer]");
  const defaultSamples = [[80, 0], [80, 80], [20, 90]];
  const notes = [
    "Braking in a straight line leaves more force available for braking.",
    "Hold the lateral force steady and ease off until the request reaches the boundary.",
    "Near the apex, high lateral demand leaves less force for braking.",
  ];
  // Slider ticks are tenths of a kN. Keeping this dry reference fixed makes
  // the same input mean the same force on both surfaces.
  const reference = 10;
  const caps = {dry: reference, damp: 7};
  const cases = {
    hold: ["dry", 80, "The 11.3 kN request exceeds the 10 kN cap. The model can deliver only 7.1 kN of lateral force."],
    release: ["dry", 60, "Releasing 2 kN of braking restores the full 8 kN of lateral force while staying on the limit."],
    damp: ["damp", 60, "Only the surface changed. The model now delivers 4.2 kN of braking and 5.6 kN of lateral force."],
  };
  const answerText = {
    8: "8 kN would need √(8² + 8²) = 11.3 kN, above the dry cap. Try releasing some brake.",
    6: "Correct. √(6² + 8²) = 10 kN exactly, so the tyre can deliver both forces.",
    2: "2 kN fits, but there is room for more braking. The two forces act at right angles, so their magnitudes do not add directly.",
  };
  const trace = [...stages].map(button => {
    const row = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = button.textContent;
    const values = document.createElement("strong");
    row.append(name, values);
    get("trace").appendChild(row);
    return {row, values};
  });
  let samples = defaultSamples.map(pair => pair.slice());
  let phase = 0;
  let surface = "dry";
  let drag = null;
  const cornerReplay = LearnReplay.mount(get("corner-replay"), {
    label: "corner entry",
    describe: value => (value < .25 ? "Approach" : value < .75 ? "Turn-in" : "Apex") + " · " + Math.round(value * 100) + "%",
    draw(progress) {
      const step = progress * (samples.length - 1);
      const start = Math.min(samples.length - 2, Math.floor(step));
      const mix = (a, b) => String(Math.round(a + (b - a) * (step - start)));
      brake.value = mix(samples[start][0], samples[start + 1][0]);
      turn.value = mix(samples[start][1], samples[start + 1][1]);
      showPhase(Math.round(step));
      update(false);
    },
  });

  const decimal = value => value.toFixed(1);
  const force = value => decimal(value) + " kN";
  const percent = fraction => decimal(fraction * 100) + "%";
  const headroom = (cap, component) => Math.sqrt(Math.max(0, cap * cap - component * component));

  function plotPoint(point, x, y) {
    point.style.left = (x / reference * 100) + "%";
    point.style.bottom = (y / reference * 100) + "%";
  }

  function plotVector([ray, point], x, y, length) {
    ray.style.width = (length / reference * 100) + "%";
    ray.style.transform = "rotate(" + -Math.atan2(y, x) + "rad)";
    plotPoint(point, x, y);
  }

  function update(record = true) {
    const x = Number(brake.value) / 10;
    const y = Number(turn.value) / 10;
    const cap = caps[surface];
    const resultant = Math.hypot(x, y);
    const scale = Math.max(1, resultant / cap);
    const over = resultant > cap + 1e-10;
    const onLimit = Math.abs(resultant - cap) < 1e-10;
    const turnLimit = headroom(cap, x);
    const brakeLimit = headroom(cap, y);
    const brakeFits = y <= cap;
    const turnFits = x <= cap;

    plot.dataset.over = String(over);
    plot.style.setProperty("--capacity", percent(cap / reference));
    plotVector(requested, x, y, resultant);
    plotVector(delivered, x / scale, y / scale, resultant / scale);
    plotPoint(limitPoint, brakeLimit, y);
    guide.style.bottom = percent(y / reference);
    guide.style.width = percent(Math.max(x, brakeLimit) / reference);
    guide.hidden = limitPoint.hidden = !brakeFits || y === 0;
    get("brakeValue").textContent = force(x);
    get("turnValue").textContent = force(y);
    brake.setAttribute("aria-valuetext", force(x));
    turn.setAttribute("aria-valuetext", force(y));
    get("utilization").textContent = percent(resultant / cap);
    get("usage-meter").value = Math.min(1, resultant / cap);
    get("delivered").textContent = decimal(x / scale) + " / " + force(y / scale);
    get("achieved").textContent = percent(x / scale / reference) + " / " + percent(y / scale / reference);
    get("turnLimit").textContent = turnFits ? percent(turnLimit / reference) : "Brake demand alone exceeds cap";
    get("turnLimitForce").textContent = turnFits ? force(turnLimit) : "";
    get("brakeLimit").textContent = brakeFits ? percent(brakeLimit / reference) : "Lateral demand alone exceeds cap";
    get("brakeLimitForce").textContent = brakeFits ? force(brakeLimit) : "";

    const status = over ? "Over the grip limit." : onLimit ? "At the grip limit." : "Within the tyre force budget.";
    const statusNode = get("status");
    if (statusNode.textContent !== status) statusNode.textContent = status;
    get("collision-explanation").textContent = over
      ? "The request needs " + force(resultant) + " but this surface can deliver " + force(cap) + ". " +
        (brakeFits ? "At the same lateral demand, braking needs to come down to " + force(brakeLimit) + " or less."
          : "Even releasing all braking leaves too much lateral demand. A slower entry or gentler line can reduce it.")
      : onLimit ? "Both requested forces are delivered. Increasing either one uses more than the available " + force(cap) + "."
        : "There is " + force(cap - resultant) + " of resultant headroom before the tyre reaches the limit.";

    if (record) samples[phase] = [Number(brake.value), Number(turn.value)];
    trace.forEach(({row, values}, i) => {
      row.classList.toggle("current", phase === i);
      values.textContent = decimal(samples[i][0] / 10) + " brake / " + force(samples[i][1] / 10) + " lateral";
    });
  }

  function showPhase(index) {
    phase = index;
    stages.forEach((button, i) => button.setAttribute("aria-pressed", String(i === phase)));
    get("phase-tip").textContent = notes[phase];
  }

  function selectPhase(index) {
    cornerReplay.stop();
    cornerReplay.seek(index / (samples.length - 1), false);
    showPhase(index);
    const [brakeDemand, lateralDemand] = samples[phase];
    brake.value = String(brakeDemand);
    turn.value = String(lateralDemand);
    update();
  }

  function selectSurface(next) {
    surface = next;
    surfaces.forEach(control => { control.checked = control.value === surface; });
    updateSpeedGrip();
  }

  function applyCase(key) {
    const [preset, brakeDemand, explanation] = cases[key];
    selectSurface(preset);
    samples[1] = [brakeDemand, 80];
    selectPhase(1);
    get("case-effect").textContent = explanation;
  }

  function positionRequest(event) {
    const bounds = plot.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const tick = ratio => String(Math.round(100 * Math.max(0, Math.min(1, ratio))));
    brake.value = tick((event.clientX - bounds.left) / bounds.width);
    turn.value = tick((bounds.bottom - event.clientY) / bounds.height);
    update();
  }

  plot.addEventListener("pointerdown", event => {
    if (event.button !== 0 || drag !== null) return;
    cornerReplay.stop();
    drag = event.pointerId;
    plot.setPointerCapture(drag);
    positionRequest(event);
  });
  plot.addEventListener("pointermove", event => {
    if (event.pointerId === drag) positionRequest(event);
  });
  plot.addEventListener("lostpointercapture", () => { drag = null; });

  for (const control of [brake, turn]) control.addEventListener("input", () => {
    cornerReplay.stop();
    update();
  });
  surfaces.forEach(control => control.addEventListener("change", () => {
    selectSurface(control.value);
    update(false);
  }));
  stages.forEach((button, i) => button.addEventListener("click", () => selectPhase(i)));
  document.querySelectorAll("[data-case]").forEach(button => button.addEventListener("click", () => applyCase(button.dataset.case)));
  get("try-turn").addEventListener("click", () => {
    samples[1] = [Number(brake.value), 80];
    selectPhase(1);
  });
  answers.forEach(button => button.addEventListener("click", () => {
    answers.forEach(choice => choice.setAttribute("aria-pressed", String(choice === button)));
    get("answer").textContent = answerText[button.dataset.answer];
    get("show-answer").hidden = false;
  }));
  get("show-answer").addEventListener("click", () => {
    applyCase("release");
    brake.focus();
  });
  get("reset").addEventListener("click", () => {
    samples = defaultSamples.map(pair => pair.slice());
    selectSurface("dry");
    selectPhase(0);
    answers.forEach(button => button.setAttribute("aria-pressed", "false"));
    get("answer").textContent = "Choose a force to see how the model checks it.";
    get("show-answer").hidden = true;
    get("case-effect").textContent = "Keep lateral demand at 8 kN and compare the first two inputs. Then change only the surface.";
  });

  const deceleration = get("deceleration");
  const cgHeight = get("cg-height");
  const speedControls = [get("braking-speed"), get("speed-brake"), get("front-bias")];
  function updateSpeedGrip() {
    const [speed, braking, bias] = speedControls.map(input => Number(input.value));
    const labels = [speed + " km/h", force(braking), bias + "%"];
    speedControls.forEach((input, i) => {
      get(input.id + "-value").textContent = labels[i];
      input.setAttribute("aria-valuetext", labels[i]);
    });
    const weight = 800 * 9.81 / 1000;
    const aero = 16 * (speed / 300) ** 2;
    const transfer = braking * .30 / 3.40;
    const friction = surface === "dry" ? 1.25 : .875;
    const front = friction * (weight * .47 + aero * .44 + transfer);
    const rear = friction * (weight * .53 + aero * .56 - transfer);
    const frontRequest = braking * bias / 100;
    const rearRequest = braking - frontRequest;
    get("speed-aero").textContent = force(aero);
    const axleReading = (request, limit) => {
      const excess = request - limit;
      const overage = excess < .01 ? "<0.01 kN" : excess.toFixed(2) + " kN";
      return force(request) + " / " + force(limit) + (excess > 0 ? " · " + overage + " over" : "");
    };
    get("speed-front").textContent = axleReading(frontRequest, front);
    get("speed-rear").textContent = axleReading(rearRequest, rear);
    const frontOver = frontRequest > front;
    const rearOver = rearRequest > rear;
    const message = (frontOver && rearOver ? "Both axles exceed their grip limits." :
      frontOver ? "Front lockup risk. Move bias rearward or reduce the brake request." :
      rearOver ? "Rear lockup risk. Move bias forward or reduce the brake request." :
      "Both axles are within the straight-line grip limit.") + " Surface: " + surface + ".";
    if (get("speed-lock").textContent !== message) get("speed-lock").textContent = message;
  }
  speedControls.forEach(input => input.addEventListener("input", updateSpeedGrip));
  function updateAxleLoads() {
    const g = Number(deceleration.value);
    const height = Number(cgHeight.value);
    const weight = 800 * 9.81;
    const loadShift = weight * g * height / 3.4;
    const front = weight * .47 + loadShift;
    const rear = weight - front;
    get("deceleration-value").textContent = g.toFixed(1) + " g";
    get("cg-value").textContent = height.toFixed(2) + " m";
    deceleration.setAttribute("aria-valuetext", g.toFixed(1) + " g");
    cgHeight.setAttribute("aria-valuetext", height.toFixed(2) + " metres");
    get("front-load").textContent = (front / 1000).toFixed(2) + " kN";
    get("rear-load").textContent = (rear / 1000).toFixed(2) + " kN";
    get("load-shift").textContent = Math.round(loadShift) + " N";
    get("front-load-bar").style.width = percent(front / weight);
    get("rear-load-bar").style.width = percent(rear / weight);
    return loadShift;
  }
  deceleration.addEventListener("input", updateAxleLoads);
  cgHeight.addEventListener("input", updateAxleLoads);
  document.querySelectorAll("[data-load-answer]").forEach(button => {
    button.addEventListener("click", () => {
      deceleration.value = "1";
      cgHeight.value = ".3";
      const loadShift = updateAxleLoads();
      get("load-feedback").textContent = (button.dataset.loadAnswer === "front" ? "Correct. " : "Check the bars. ") +
        "In this 1 g stop, " + Math.round(loadShift) + " N shifts from rear to front. Total normal load stays the same.";
    });
  });

  LearnAppearance.mount(reduced => cornerReplay.reduced(reduced));
  cornerReplay.seek(0);
  updateAxleLoads();
  updateSpeedGrip();
})();
