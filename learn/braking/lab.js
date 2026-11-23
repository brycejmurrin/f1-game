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

  function update() {
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

    samples[phase] = [Number(brake.value), Number(turn.value)];
    trace.forEach(({row, values}, i) => {
      row.classList.toggle("current", phase === i);
      values.textContent = decimal(samples[i][0] / 10) + " brake / " + force(samples[i][1] / 10) + " lateral";
    });
  }

  function selectPhase(index) {
    phase = index;
    const [brakeDemand, lateralDemand] = samples[phase];
    brake.value = String(brakeDemand);
    turn.value = String(lateralDemand);
    stages.forEach((button, i) => button.setAttribute("aria-pressed", String(i === phase)));
    get("phase-tip").textContent = notes[phase];
    update();
  }

  function selectSurface(next) {
    surface = next;
    surfaces.forEach(control => { control.checked = control.value === surface; });
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
    drag = event.pointerId;
    plot.setPointerCapture(drag);
    positionRequest(event);
  });
  plot.addEventListener("pointermove", event => {
    if (event.pointerId === drag) positionRequest(event);
  });
  plot.addEventListener("lostpointercapture", () => { drag = null; });

  brake.addEventListener("input", update);
  turn.addEventListener("input", update);
  surfaces.forEach(control => control.addEventListener("change", () => {
    selectSurface(control.value);
    update();
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

  LearnAppearance.mount();
  update();
})();
