(() => {
  "use strict";

  const get = id => document.getElementById(id);
  const { fixture, analyze, readAt, series } = TelemetryLesson;
  const { lanes, from, to } = fixture;
  const chart = get("chart");
  const context = chart.getContext("2d");
  const scrub = get("scrub");
  const checkpoints = document.querySelectorAll("[data-checkpoint]");
  const ghosts = document.querySelectorAll("[data-ghost]");
  const maxTime = Math.max(...lanes.map(lane => lane.cum.t.at(-1)));
  const stripEnd = Math.ceil(Math.max(...lanes.map(lane => lane.cum.d.at(-1))) / 5) * 5;
  get("strip-end").textContent = stripEnd + " m";
  const rowNames = ["time", "distance", "speed", "brake", "throttle"];
  const answerKeys = ["a", "b"];
  const signed = value => (value >= 0 ? "+" : "−") + Math.abs(value).toFixed(2) + " s";
  let axis = "time";
  let cursor = 0;
  let reference = 0;
  let gate = to;
  let analysis;
  let landmarks;
  let deltaSeries;
  let plot = null;
  const replay = LearnReplay.mount(get("trace-replay"), {
    label: () => axis === "time" ? "time replay" : "distance scan",
    duration: () => axis === "time" ? maxTime * 1000 : 7000,
    realTime: () => axis === "time",
    draw(progress) { selectCursor(progress * axisLimit()); },
  });
  replay.manual(false);

  function buildComparison() {
    landmarks = analyze(lanes, from, to, reference);
    analysis = gate === to ? landmarks : analyze(lanes, from, gate, reference);
    deltaSeries = series(lanes, from, gate, reference).map(point => ({
      ...point, time: DataTelemetryModel.timeAtDist(lanes[reference].cum, point.distance),
    }));
    const middle = readAt(lanes, 40, "distance", reference).delta;
    get("checkpoint-delta").textContent = "Equal-distance checkpoints · 40 m: " + signed(middle) + " · " + to + " m: " + signed(landmarks.deltaAfter);
    for (const button of checkpoints) {
      const key = button.dataset.checkpoint;
      button.disabled = key !== "start" && key !== "exit" && !landmarks.lanes?.[reference]?.[key];
    }
  }

  function axisLimit() {
    return axis === "time" ? maxTime : gate;
  }

  function draw() {
    if (!context) return;
    const width = chart.clientWidth, height = chart.clientHeight;
    if (width < 100 || height < 100) return;
    const dpr = window.devicePixelRatio || 1;
    const backingWidth = Math.round(width * dpr), backingHeight = Math.round(height * dpr);
    if (chart.width !== backingWidth || chart.height !== backingHeight) {
      chart.width = backingWidth;
      chart.height = backingHeight;
    }
    const ctx = context;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const style = getComputedStyle(chart);
    const palette = ["--text", "--red", "--dim", "--card-line", "--bg"].map(key => style.getPropertyValue(key).trim());
    const [ink, accent, dim, grid, paper] = palette;
    ctx.font = "11px system-ui, sans-serif";
    const left = 76, right = width - 10, top = 8, bottom = height - 23;
    const rowHeight = (bottom - top) / 4;
    const end = axisLimit();
    const x = value => left + value / end * (right - left);
    const y = (row, value, min, max) => top + (row + .93 - .78 * (value - min) / (max - min)) * rowHeight;
    plot = { left, right };
    const bands = [
      { title: ["Speed", "km/h"], limits: [100, 230], levels: [[120, "120"], [220, "220"]] },
      { title: ["Brake"], limits: [0, 100], levels: [[0, "off"], [100, "on"]] },
      { title: ["Throttle", "%"], limits: [0, 100], levels: [[0, "0"], [100, "100"]] },
      { title: ["Δ time", "s"], limits: [-.2, .2], levels: [[-.2, "−0.2"], [0, "0"], [.2, "+0.2"]] },
    ];

    ctx.strokeStyle = grid;
    ctx.fillStyle = dim;
    ctx.lineWidth = 1;
    for (let col = 0; col <= 4; col++) {
      const px = x(end * col / 4);
      ctx.beginPath();
      ctx.moveTo(px, top);
      ctx.lineTo(px, bottom);
      ctx.stroke();
      ctx.textAlign = col === 0 ? "left" : col === 4 ? "right" : "center";
      const label = axis === "time" ? (end * col / 4).toFixed(1) : String(Math.round(end * col / 4));
      ctx.fillText(col === 4 ? label + (axis === "time" ? " s" : " m") : label, px, height - 8);
    }
    ctx.textAlign = "left";
    bands.forEach(({ title, limits, levels }, row) => {
      ctx.fillStyle = ink;
      ctx.fillText(title[0], 5, top + row * rowHeight + 13);
      ctx.fillStyle = dim;
      if (title[1]) ctx.fillText(title[1], 5, top + row * rowHeight + 26);
      ctx.textAlign = "right";
      for (const [level, label] of levels) {
        const py = y(row, level, ...limits);
        ctx.fillText(label, left - 4, py + 3);
        ctx.strokeStyle = row === 3 && level === 0 ? dim : grid;
        ctx.beginPath();
        ctx.moveTo(left, py);
        ctx.lineTo(right, py);
        ctx.stroke();
      }
      ctx.textAlign = "left";
    });

    function trace(points, row, color, dash) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash(dash);
      ctx.beginPath();
      let previous = null;
      for (const [coordinate, value] of points) {
        if (!Number.isFinite(coordinate) || !Number.isFinite(value)) {
          previous = null;
          continue;
        }
        const px = x(coordinate), py = y(row, value, ...bands[row].limits);
        if (!previous) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
        previous = py;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, right - left, bottom - top);
    ctx.clip();
    lanes.forEach((lane, i) => {
      const columns = axis === "time" ? lane.cum.t : lane.cum.d;
      ["speed", "brake", "throttle"].forEach((channel, row) => {
        const points = lane.car.flatMap((sample, index) => {
          if (row === 0 || index === 0) return [[columns[index], sample[channel]]];
          const previous = lane.car[index - 1];
          const boundaryTime = (previous.t + sample.t) / 2;
          const boundary = axis === "time" ? boundaryTime : DataTelemetryModel.distAtT(lane.cum, boundaryTime);
          return [[boundary, previous[channel]], [boundary, sample[channel]], [columns[index], sample[channel]]];
        });
        trace(points, row, i ? accent : ink, i ? [5, 3] : []);
        ctx.fillStyle = i ? accent : ink;
        for (const [index, sample] of lane.car.entries()) {
          ctx.beginPath();
          ctx.arc(x(columns[index]), y(row, sample[channel], ...bands[row].limits), 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    });
    trace(deltaSeries.map(point => [point[axis], point.delta]), 3, accent, []);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x(cursor), top);
    ctx.lineTo(x(cursor), bottom);
    ctx.stroke();
    ctx.restore();

    if (landmarks.available) {
      ctx.fillStyle = paper;
      ctx.strokeStyle = accent;
      const px = x(axis === "time" ? landmarks.lanes[reference].end : to);
      const py = y(3, landmarks.deltaAfter, ...bands[3].limits);
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  function update(announce = false) {
    const reading = readAt(lanes, cursor, axis, reference);
    const alignedDistance = axis === "distance" ? cursor : reading.lanes[reference].distance;
    const deltaAtCursor = axis === "distance" ? reading.delta
      : readAt(lanes, alignedDistance, "distance", reference).delta;
    reading.lanes.forEach(({ t, distance, speed, brake, throttle }, i) => {
      const values = [
        t === null ? "—" : t.toFixed(3),
        distance === null ? "—" : distance.toFixed(1),
        speed === null ? "—" : String(speed),
        brake === null ? "—" : brake ? "On" : "Off",
        throttle === null ? "—" : throttle + "%",
      ];
      values.forEach((value, j) => { get(rowNames[j] + "-" + answerKeys[i]).textContent = value; });
      ghosts[i].hidden = distance === null;
      if (distance !== null) ghosts[i].style.left = distance / stripEnd * 100 + "%";
    });
    const time = axis === "time";
    get("cursor").textContent = time ? cursor.toFixed(3) + " s" : cursor.toFixed(1) + " m";
    scrub.setAttribute("aria-valuetext", time ? cursor.toFixed(3) + " seconds" : cursor.toFixed(1) + " metres");
    const other = lanes[1 - reference].label, base = lanes[reference].label;
    const comparison = other + " − " + base;
    const gap = Number.isFinite(deltaAtCursor) ? signed(deltaAtCursor) : "unavailable";
    get("delta").textContent = comparison + " at equal distance: " + gap;
    if (announce) get("announcement").textContent = get("cursor").textContent + ". " + get("delta").textContent;
    draw();
  }

  function selectCursor(value, announce = false) {
    cursor = Math.max(0, Math.min(axisLimit(), value));
    scrub.value = String(cursor);
    update(announce);
  }

  function selectAxis(next, value) {
    if (value === undefined) {
      const current = readAt(lanes, cursor, axis, reference).lanes[reference];
      value = (next === "time" ? current.t : current.distance) ?? 0;
    }
    axis = next;
    replay.stop();
    document.querySelectorAll("[name=axis]").forEach(control => { control.checked = control.value === axis; });
    const time = axis === "time";
    scrub.max = String(axisLimit());
    scrub.step = time ? ".001" : ".1";
    get("scrub-label").textContent = time ? "Elapsed time" : "Estimated distance";
    get("axis-note").textContent = time
      ? "Time replay · 1× follows the recorded fixture clock. The gap trace uses the reference driver’s distance. Positive means the other driver is later."
      : "Distance scan · The cursor moves uniformly along the section. Scan speed is relative to the lesson. Positive means the other driver arrives later.";
    selectCursor(value, true);
    replay.seek(cursor / axisLimit(), false);
  }

  function jump(key) {
    const value = key === "start" ? from : key === "exit" ? to : landmarks.lanes?.[reference]?.[key]?.distance;
    if (Number.isFinite(value)) selectAxis("distance", value);
  }

  function choose(attribute, id, feedback, afterChoice) {
    const inputs = document.querySelectorAll("[" + attribute + "]");
    inputs.forEach(input => input.addEventListener("click", () => {
      inputs.forEach(choice => choice.setAttribute("aria-pressed", String(choice === input)));
      get(id).textContent = feedback[input.getAttribute(attribute)];
      afterChoice?.(input.getAttribute(attribute));
    }));
  }

  const baseAnalysis = analyze(lanes, from, to);
  const exitGap = Math.abs(baseAnalysis.deltaAfter).toFixed(2) + " s";
  const conclusion = "B brakes later but drops to 126 km/h while A stays at or above 144 km/h. A reaches 90 m about " + exitGap + " sooner.";
  choose("data-answer", "prediction", {
    a: "Correct. " + conclusion,
    b: "B’s later braking briefly gains time. " + conclusion,
    tie: "Their arrival times differ. " + conclusion,
  }, () => { get("show-exit").hidden = false; });
  choose("data-brake-answer", "brake-answer", {
    pressure: "The feed gives a binary brake state. Pedal pressure would require a separate measurement.",
    state: "Correct. The sample reports pressed or released. It has no brake pressure or force value.",
    force: "The feed gives a binary brake state. Force at the tyres depends on more than that signal.",
  });
  const equalTime = readAt(lanes, 0.75, "time");
  const [distanceA, distanceB] = equalTime.lanes.map(reading => reading.distance);
  const equalDistance = readAt(lanes, distanceA, "distance");
  choose("data-alignment", "alignment-feedback", {
    time: "At 0.75 s A has travelled " + distanceA.toFixed(1) + " m and B " + distanceB.toFixed(1) +
      " m. Those are different positions. Compare arrival times at A’s distance to get a time gap.",
    distance: "Correct. At " + distanceA.toFixed(1) + " m, A arrives in " + equalDistance.lanes[0].t.toFixed(2) +
      " s and B in " + equalDistance.lanes[1].t.toFixed(2) + " s. B reaches that point " +
      Math.abs(equalDistance.delta).toFixed(2) + " s earlier.",
  }, next => {
    reference = 0;
    get("reference").value = String(reference);
    buildComparison();
    selectAxis(next, next === "time" ? 0.75 : distanceA);
  });
  get("show-exit").addEventListener("click", () => { selectAxis("distance", to); scrub.focus(); });
  get("extend").addEventListener("click", () => {
    gate = to + 5;
    buildComparison();
    selectAxis("distance", gate);
    get("coverage").textContent = analysis.reason + " B ends at " + lanes[1].cum.d.at(-1).toFixed(2) + " m.";
    get("restore").hidden = false;
  });
  get("restore").addEventListener("click", () => {
    gate = to;
    buildComparison();
    jump("exit");
    get("coverage").textContent = "Both drivers cover the " + to + " m gate.";
    get("extend").focus();
    get("restore").hidden = true;
  });
  document.querySelectorAll("[name=axis]").forEach(control => {
    control.addEventListener("change", () => selectAxis(control.value));
  });
  checkpoints.forEach(button => button.addEventListener("click", () => jump(button.dataset.checkpoint)));
  scrub.addEventListener("input", () => {
    replay.stop();
    selectCursor(Number(scrub.value));
    replay.seek(cursor / axisLimit(), false);
  });
  scrub.addEventListener("change", () => update(true));
  get("reference").addEventListener("change", event => {
    reference = Number(event.target.value);
    buildComparison();
    update(true);
  });
  chart.addEventListener("click", event => {
    if (!plot) return;
    replay.stop();
    const offset = event.clientX - chart.getBoundingClientRect().left - plot.left;
    selectCursor(offset / (plot.right - plot.left) * axisLimit(), true);
    replay.seek(cursor / axisLimit(), false);
  });

  if (window.frameElement) {
    const open = get("open-data");
    open.hidden = false;
    open.addEventListener("click", () => {
      get("hub-status").textContent = "";
      window.parent.postMessage({ type: "apex-learn-telemetry" }, location.origin);
    });
    window.addEventListener("message", event => {
      if (event.source !== window.parent || event.origin !== location.origin) return;
      if (event.data?.type === "apex-learn-telemetry-return") open.focus();
      if (event.data?.type === "apex-learn-telemetry-unavailable") {
        get("hub-status").textContent = "Could not open Data Hub. You can keep using the offline example.";
        open.focus();
      }
    });
  }

  buildComparison();
  selectAxis("time", 0);
  LearnAppearance.mount(reduced => { replay.reduced(reduced); draw(); });
  new ResizeObserver(draw).observe(chart);
})();
