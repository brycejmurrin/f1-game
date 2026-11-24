(() => {
  "use strict";

  const duration = 8;
  const steps = 400;
  const dt = duration / steps;
  const startSpeed = 260;
  const blue = "#65b7ff";
  const amber = "#f9bb64";

  function ceiling(speed, curve) {
    if (curve === "overtake") return Math.max(0, Math.min(350, 7100 - 20 * speed));
    const speedCap = speed < 340 ? 1800 - 5 * speed : 6900 - 20 * speed;
    return Math.max(0, Math.min(curve === "limited" ? 250 : 350, speedCap));
  }

  const xAt = time => 57 + time / duration * 510;
  const yAt = power => 181 - power / 350 * 133;
  const point = (time, power) => xAt(time).toFixed(2) + "," + yAt(power).toFixed(2);
  const mj = n => n.toFixed(2) + " MJ";

  function trace(state) {
    let charge = state.charge;
    let speedLoss = 0;
    let emptyLoss = 0;
    const limit = [];
    const delivered = [];
    for (let i = 0; i <= steps; i++) {
      const speed = startSpeed + (state.endSpeed - startSpeed) * i / steps;
      limit.push(point(i * dt, ceiling(speed, state.curve)));
    }
    for (let i = 0; i < steps; i++) {
      const t = i * dt;
      const speed = startSpeed + (state.endSpeed - startSpeed) * (i + 0.5) / steps;
      const capped = Math.min(state.request, ceiling(speed, state.curve));
      const spent = Math.min(charge, capped * dt / 1000);
      speedLoss += (state.request - capped) * dt / 1000;
      emptyLoss += capped * dt / 1000 - spent;
      const active = capped > 0 ? spent / capped * 1000 : dt;
      delivered.push(point(t, active > 0 ? capped : 0));
      if (active < dt - 1e-9) delivered.push(point(t + active, capped), point(t + active, 0));
      delivered.push(point(t + dt, active < dt - 1e-9 ? 0 : capped));
      charge -= spent;
    }
    return { charge, speedLoss, emptyLoss, limit, delivered };
  }

  function diagram(state, traceData) {
    const { limit, delivered } = traceData;
    const grid = [0, 100, 200, 300, 350].map(power =>
      `<path d="M57 ${yAt(power)}H567" stroke="currentColor" stroke-opacity=".22"/>
      <text x="48" y="${yAt(power) + 4}" text-anchor="end">${power}</text>`).join("");
    const ticks = [0, 2, 4, 6, 8].map(time =>
      `<path d="M${xAt(time)} 181v6" stroke="currentColor" stroke-opacity=".22"/>
      <text x="${xAt(time)}" y="203" text-anchor="middle">${time}</text>`).join("");
    return `
      <title>Electrical power over the straight</title>
      <desc>The dash and dot lines show the applicable power ceiling and the driver's request. The solid line shows delivered electrical power.</desc>
      <g font-family="system-ui,sans-serif" font-size="13" fill="currentColor">
        <text x="13" y="24">DC kW</text>
        <path d="M112 19h24" stroke="${amber}" stroke-width="2" stroke-dasharray="7 4"/>
        <text x="142" y="24">Ceiling</text>
        <path d="M227 19h24" stroke="currentColor" stroke-width="2" stroke-dasharray="2 5"/>
        <text x="258" y="24">Request</text>
        <path d="M345 19h24" stroke="${blue}" stroke-width="3"/>
        <text x="376" y="24">Delivered</text>
        ${grid}
        ${ticks}
        <polyline points="${delivered.join(" ")} 567,181 57,181" fill="${blue}" opacity=".14"/>
        <polyline points="${delivered.join(" ")}" fill="none" stroke="${blue}" stroke-width="3.5"/>
        <path d="M57 ${yAt(state.request)}H567" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="2 5"/>
        <polyline points="${limit.join(" ")}" fill="none" stroke="${amber}" stroke-width="2" stroke-dasharray="7 4"/>
        <text x="57" y="225">${startSpeed} km/h</text>
        <text x="312" y="225" text-anchor="middle">Time on straight (s)</text>
        <text x="567" y="225" text-anchor="end">${state.endSpeed} km/h</text>
      </g>`;
  }

  LearnSandbox.mount({
    title: "Deployment & Clipping",
    replay: {label: "straight"},
    intro: "An electric motor can have charge left and still deliver less power as speed rises. Compare the requested power, the FIA ceiling and what actually gets delivered over a fixed eight-second speed trace.",
    controls: [
      { id: "curve", label: "Power curve", options: [["standard", "Standard"], ["limited", "Power-limited sector"], ["overtake", "Request Overtake"]], value: "standard" },
      { id: "gap", label: "Gap at detection line", min: 0.5, max: 1.5, step: 0.05, value: 0.9, unit: "s" },
      { id: "endSpeed", label: "Speed at end of straight", min: 300, max: 360, step: 5, value: 350, unit: "km/h" },
      { id: "request", label: "Requested electrical power", min: 50, max: 350, step: 25, value: 350, unit: "kW" },
      { id: "charge", label: "Usable charge at entry", min: 0.25, max: 4, step: 0.25, value: 1, unit: "MJ" },
    ],
    challenge: "Keep the 350 km/h finish speed and the standard curve. Deliver at least 1.50 MJ while keeping 0.30 MJ in reserve.",
    sources: [
      ["FIA 2026 Technical Regulations, Issue 21 · C5.2.7–9", "https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_21_-_2026-10-19.pdf"],
      ["FIA 2026 Sporting Regulations, Issue 09 · B7.2", "https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_09_-_2026-10-01.pdf"],
      ["FIA · 2026 Las Vegas detection and activation lines", "https://www.fia.com/system/files/decision-document/2026_las_vegas_grand_prix_-_power_unit_information.pdf"],
      ["Formula 1 · 2026 energy recovery and super clipping", "https://www.formula1.com/en/latest/article/from-smaller-cars-to-a-bigger-budget-cap-12-rule-changes-you-need-to-know-about-in.56uUTFhB0z5j3iZfhC0rGP"],
    ],
    evaluate(state) {
      const requestedOvertake = state.curve === "overtake";
      const eligible = state.gap < 1;
      const curve = requestedOvertake && !eligible ? "standard" : state.curve;
      const activeState = { ...state, curve };
      const result = trace(activeState);
      const samples = result.delivered.map(point => point.split(",").map(Number));
      const used = state.charge - result.charge;
      const conditions = state.curve === "standard" && state.endSpeed === 350;
      const success = conditions && used + 1e-9 >= 1.5 && result.charge + 1e-9 >= 0.3;
      return {
        svg: diagram(activeState, result),
        replay(progress) {
          const x = xAt(progress * duration);
          const next = samples.findIndex(sample => sample[0] > x);
          const y = (next < 0 ? samples.at(-1) : samples[Math.max(0, next - 1)])[1];
          return {svg: LearnSandbox.cursor(x, y, 47, 181),
            readout: (progress * duration).toFixed(1) + " s · " + Math.round((181 - y) * 350 / 133) + " kW delivered"};
        },
        metrics: [
          ["Energy deployed", mj(used)], ["Charge left", mj(result.charge)],
          ["Request above ceiling", mj(result.speedLoss)], ["Undelivered for lack of charge", mj(result.emptyLoss)],
          ["Ceiling at finish", ceiling(state.endSpeed, curve).toFixed(0) + " kW"],
          ["Overtake at activation", requestedOvertake ? (eligible ? "Active" : "Unavailable · standard ceiling") : "Unrequested"],
        ],
        explanation: "The ceiling limits electrical DC power. Charge limits how long it can flow. The shaded area under delivered power is energy, with 1,000 kW·s per MJ. For Overtake, this example models a dry, enabled race with no prior activation. It borrows Las Vegas’s 1.0 s threshold at 5,299 m and applies the requested Overtake curve only after the 5,400 m activation line. The trace has fictional speeds and omits other sector restrictions, harvesting and losses. Super clipping means harvesting while the driver stays on full throttle.",
        success,
        feedback: success ? "Target met. The reserve remains even as higher speed reduces the legal power ceiling."
          : !conditions ? "Restore the Standard curve and 350 km/h to attempt the challenge."
          : used < 1.5 ? "Delivery is below the target. Check whether your request or the charge limit left room to deliver more."
          : "Delivery meets the target. Raise opening charge or reduce the request to leave a reserve.",
      };
    },
  });
})();
