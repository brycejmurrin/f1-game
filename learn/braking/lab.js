(() => {
  "use strict";

  const get = id => document.getElementById(id);
  const brake = get("brake");
  const turn = get("turn");
  const plot = document.querySelector(".plot");
  const requested = [plot.querySelector(".ray.requested"), plot.querySelector(".point.requested")];
  const achieved = [plot.querySelector(".ray.achieved"), plot.querySelector(".point.achieved")];
  const stages = document.querySelectorAll("[data-stage]");
  const defaultSamples = [[80, 0], [80, 80], [20, 90]];
  const tips = [
    "Try adding turn-in demand while holding the brake.",
    "Keep turning at 80%. Release the brake until the request fits.",
    "Near the apex, high lateral demand leaves less force for braking.",
  ];
  let samples = defaultSamples.map(pair => pair.slice());
  let phase = 0;

  function plotVector([ray, point], x, y, length) {
    ray.style.width = length * 100 + "%";
    ray.style.transform = "rotate(" + -Math.atan2(y, x) + "rad)";
    point.style.left = x * 100 + "%";
    point.style.bottom = y * 100 + "%";
  }

  function update() {
    const x = Number(brake.value) / 100;
    const y = Number(turn.value) / 100;
    const usage = Math.hypot(x, y);
    const scale = Math.max(1, usage);
    const over = usage > 1 + 1e-12;
    const percent = value => (value * 100).toFixed(1) + "%";

    plot.dataset.over = String(over);
    plotVector(requested, x, y, usage);
    plotVector(achieved, x / scale, y / scale, usage / scale);
    get("brakeValue").textContent = brake.value + "%";
    get("turnValue").textContent = turn.value + "%";
    brake.setAttribute("aria-valuetext", brake.value + "%");
    turn.setAttribute("aria-valuetext", turn.value + "%");
    get("utilization").textContent = percent(usage);
    get("achieved").textContent = percent(x / scale) + " / " + percent(y / scale);
    get("turnLimit").textContent = percent(Math.sqrt(1 - x * x));
    get("brakeLimit").textContent = percent(Math.sqrt(1 - y * y));

    const status = over ? "Over budget. Release some brake or reduce lateral demand."
      : Math.abs(usage - 1) < 1e-12 ? "At the grip limit." : "Within the tyre force budget.";
    const statusNode = get("status");
    if (statusNode.textContent !== status) statusNode.textContent = status;
    samples[phase] = [Number(brake.value), Number(turn.value)];
  }

  function selectPhase(index) {
    phase = index;
    const [brakeDemand, lateralDemand] = samples[phase];
    brake.value = String(brakeDemand);
    turn.value = String(lateralDemand);
    stages.forEach((button, i) => button.setAttribute("aria-pressed", String(i === phase)));
    get("phase-tip").textContent = tips[phase];
    update();
  }

  brake.addEventListener("input", update);
  turn.addEventListener("input", update);
  stages.forEach((button, i) => button.addEventListener("click", () => selectPhase(i)));
  get("try-turn").addEventListener("click", () => {
    samples[1] = [Number(brake.value), 80];
    selectPhase(1);
  });
  get("reset").addEventListener("click", () => {
    samples = defaultSamples.map(pair => pair.slice());
    selectPhase(0);
  });

  LearnAppearance.mount();
  update();
})();
