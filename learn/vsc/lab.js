(() => {
  "use strict";

  const get = id => document.getElementById(id);
  const { distance, fixtures, pitPath, evaluate, progress } = VscLesson;
  const fixture = get("fixture");
  const prediction = get("prediction");
  const timeline = get("timeline");
  const play = get("play");
  const settings = [
    { id: "green-speed", key: "greenSpeed", scale: 1, unit: " km/h" },
    { id: "vsc-speed", key: "vscSpeed", scale: 1, unit: " km/h" },
    { id: "vsc-duration", key: "vscEnds", scale: 1000, unit: " s" },
    { id: "service", key: "service", scale: 1000, unit: " s" },
    { id: "gap", key: "gapBehind", scale: 1000, unit: " s" },
  ];
  const format = new Intl.NumberFormat("en", { maximumFractionDigits: 3 });
  const seconds = ms => format.format(ms / 1000) + " s";
  const metres = n => format.format(Math.round(n * 10) / 10) + " m";
  let input;
  let result;
  let choice = "";
  let revealed = false;
  let elapsed = 0;
  let duration = 0;
  let reduced = false;
  let raf = 0;
  let lastFrame = 0;

  function drawReplay() {
    const replay = progress(elapsed, input, result);
    get("pit-car").style.left = replay.pit * 100 + "%";
    get("track-car").style.left = replay.track * 100 + "%";
    get("green-car").style.left = replay.green * 100 + "%";
    get("pit-clock").textContent = replay.pitPhase + " · " + seconds(Math.min(elapsed, result.pitTime));
    const trackState = elapsed >= result.trackTime ? "Passed marker" : elapsed >= result.cautionMs ? "Green" : "VSC";
    get("track-clock").textContent = trackState + " · " + metres(replay.track * distance) + " · " +
      seconds(Math.min(elapsed, result.trackTime));
    get("green-clock").textContent = metres(replay.green * distance) + " · " +
      seconds(Math.min(elapsed, result.greenTrack));
    get("elapsed").textContent = seconds(elapsed) + " / " + seconds(duration);
    timeline.value = elapsed / 1000;
    timeline.setAttribute("aria-valuetext", seconds(elapsed) + ", " + replay.pitPhase + ", track " + trackState);
  }

  function drawArithmetic() {
    const service = input.service;
    get("conditions").textContent = "The reference car starts " + seconds(input.gapBehind) +
      " behind. Boxing fits Hards now, with " + seconds(input.boxPace) +
      " projected tyre pace loss. Staying out keeps Mediums until lap 25, with " +
      seconds(input.stayPace) + " projected tyre pace loss." +
      (input.traffic ? " Traffic adds " + seconds(input.traffic) + " if you rejoin behind it." : "");
    get("pit-math").textContent = ["entry", "transit", "service", "exit"].map((label, i) =>
      seconds(i === 2 ? service : pitPath[i]) + " " + label).join(" + ") + " = " + seconds(result.pitTime);
    const segments = [];
    if (result.cautionMetres) segments.push(metres(result.cautionMetres) + " at " + input.vscSpeed + " km/h");
    if (result.restartMetres) segments.push(metres(result.restartMetres) + " at " + input.greenSpeed + " km/h");
    get("track-math").textContent = segments.join(" + ") + " = " + seconds(result.trackTime);
    get("green-math").textContent = metres(distance) + " at " + input.greenSpeed + " km/h = " + seconds(result.greenTrack);
    get("loss").textContent = seconds(result.pitTime) + " pit − " + seconds(result.trackTime) +
      " track = " + seconds(result.boxLoss) + " lost now. Under green it costs " + seconds(result.greenLoss) + ".";
    get("vsc-zone").style.width = result.cautionMetres / distance * 100 + "%";
  }

  function updateDecision() {
    get("box").setAttribute("aria-pressed", String(choice === "box"));
    get("stay").setAttribute("aria-pressed", String(choice === "stay"));
    get("reveal").disabled = !choice || !prediction.value || revealed;
    get("rejoin").hidden = !revealed;
    get("finish").hidden = !revealed;
    get("feedback").textContent = "";
    if (!revealed) {
      get("verdict").textContent = "Make a pit call and predict the rejoin to compare projected race time.";
      return;
    }

    const margin = result.rejoin;
    const side = margin > 0 ? "ahead" : margin < 0 ? "behind" : "level";
    const rejoin = side === "level" ? "level with the reference car" :
      seconds(Math.abs(margin)) + (side === "ahead" ? " ahead of" : " behind") + " the reference car";
    get("rejoin").textContent = "Box now: " + seconds(input.gapBehind) + " gap − " +
      seconds(result.boxLoss) + " pit loss. You rejoin " + rejoin + ".";
    get("feedback").textContent = prediction.value === side ? "Correct. Your pit loss puts you " + rejoin + "." :
      "The worked rejoin is " + rejoin + ". Compare the starting gap with the pit loss.";
    const traffic = result.traffic ? " + " + seconds(result.traffic) + " traffic" : "";
    get("box-total").textContent = seconds(result.boxLoss) + " pit + " + seconds(input.boxPace) +
      " tyre pace" + traffic + " = " + seconds(result.boxTotal);
    get("stay-total").textContent = seconds(result.greenLoss) + " pit + " +
      seconds(input.stayPace) + " tyre pace = " + seconds(result.stayTotal);
    const difference = result.stayTotal - result.boxTotal;
    if (difference === 0) {
      get("verdict").textContent = "Both calls project the same loss against the model’s reference race pace.";
      return;
    }
    const winning = difference > 0 ? "box" : "stay";
    const cheaper = winning === "box" ? "Boxing now" : "Staying out";
    const pitSaving = result.greenLoss - result.boxLoss;
    const paceCost = input.boxPace - input.stayPace;
    const cause = "Boxing early saves " + seconds(pitSaving) + " at the stop and adds " +
      seconds(paceCost) + " in tyre pace loss" +
      (result.traffic ? " and " + seconds(result.traffic) + " in traffic." : ".");
    get("verdict").textContent = (winning === choice ? "Your call has the lower projected loss. " : "") +
      cheaper + " saves " + seconds(Math.abs(difference)) + " against the other strategy. " + cause;
  }

  function refreshScenario() {
    stopReplay();
    input = { ...fixtures[fixture.value] };
    for (const { id, key, scale, unit } of settings) {
      const control = get(id);
      input[key] = Math.round(Number(control.value) * scale);
      get(id + "-value").textContent = format.format(Number(control.value)) + unit;
      control.setAttribute("aria-valuetext", get(id + "-value").textContent);
    }
    result = evaluate(input, input.service - pitPath[2]);
    duration = Math.max(result.pitTime, result.trackTime, result.greenTrack);
    timeline.max = duration / 1000;
    timeline.step = ".001";
    elapsed = 0;
    revealed = false;
    prediction.value = "";
    drawArithmetic();
    updateDecision();
    drawReplay();
  }

  function selectFixture() {
    const preset = fixtures[fixture.value];
    for (const { id, key, scale } of settings) {
      get(id).value = (key === "service" ? pitPath[2] : preset[key]) / scale;
    }
    choice = "";
    refreshScenario();
  }

  function stopReplay() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastFrame = 0;
    play.textContent = "Play replay";
  }

  function tick(now) {
    if (lastFrame) elapsed = Math.min(duration, elapsed + (now - lastFrame) * 3);
    lastFrame = now;
    drawReplay();
    if (elapsed < duration) raf = requestAnimationFrame(tick);
    else stopReplay();
  }

  play.addEventListener("click", () => {
    if (raf) {
      stopReplay();
      return;
    }
    if (elapsed >= duration) elapsed = 0;
    play.textContent = "Pause replay";
    raf = requestAnimationFrame(tick);
  });
  get("next").addEventListener("click", () => {
    stopReplay();
    const [entry, transit, , exit] = pitPath;
    const markers = [entry, entry + transit, result.pitTime - exit,
      result.pitTime, result.cautionMs, result.trackTime, result.greenTrack].sort((a, b) => a - b);
    elapsed = markers.find(mark => mark > elapsed + 0.5) ?? duration;
    drawReplay();
  });
  get("replay").addEventListener("click", () => {
    stopReplay();
    elapsed = 0;
    drawReplay();
  });
  timeline.addEventListener("input", () => {
    stopReplay();
    elapsed = Math.round(Number(timeline.value) * 1000);
    drawReplay();
  });
  for (const { id } of settings) get(id).addEventListener("input", refreshScenario);
  fixture.addEventListener("change", selectFixture);
  get("reset").addEventListener("click", selectFixture);
  prediction.addEventListener("change", () => {
    revealed = false;
    updateDecision();
  });
  for (const option of ["box", "stay"]) {
    get(option).addEventListener("click", () => {
      choice = option;
      revealed = false;
      updateDecision();
    });
  }
  get("reveal").addEventListener("click", () => {
    revealed = true;
    updateDecision();
    get("projection-heading").focus();
  });
  window.addEventListener("pagehide", stopReplay);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopReplay();
  });

  LearnAppearance.mount(prefersReduced => {
    if (prefersReduced !== reduced) {
      reduced = prefersReduced;
      if (reduced) stopReplay();
    }
    play.hidden = reduced;
  });
  selectFixture();
})();
