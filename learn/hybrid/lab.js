(() => {
  "use strict";

  const capacity = 4;
  const driveTimes = [8, 7, 9, 7, 8];
  const brakeTimes = [4, 5, 4, 4, 4];
  const clipTimes = [1, 2, 1, 2, 1];
  const mint = "#7fdec2";
  const blue = "#65b7ff";
  const amber = "#f9bb64";
  const mj = n => n.toFixed(2) + " MJ";
  const signedMj = n => (n > 1e-9 ? "+" : "") + mj(Math.abs(n) < 1e-9 ? 0 : n);

  function simulate(state) {
    const rechargeLimit = Number(state.budget);
    let charge = state.start;
    let harvested = 0;
    let deployed = 0;
    let storeLimited = 0;
    let budgetLimited = 0;
    let unserved = 0;
    let time = 0;
    const stages = [];

    function stage(name, duration, power, start) {
      stages.push({name, time, duration, start, end: charge,
        active: Math.min(duration, Math.abs(charge - start) * 1000 / power)});
      time += duration;
    }

    function recover(name, duration, power) {
      const potential = duration * power / 1000;
      const withinBudget = Math.min(potential, Math.max(0, rechargeLimit - harvested));
      const actual = Math.min(withinBudget, capacity - charge);
      budgetLimited += potential - withinBudget;
      storeLimited += withinBudget - actual;
      harvested += actual;
      const start = charge;
      charge += actual;
      stage(name, duration, power, start);
    }

    for (let i = 0; i < driveTimes.length; i++) {
      const demand = driveTimes[i] * state.deploy / 1000;
      const actual = Math.min(demand, charge);
      const start = charge;
      charge -= actual;
      stage("Deploy", driveTimes[i], state.deploy, start);
      deployed += actual;
      unserved += demand - actual;
      recover("Brake", brakeTimes[i], state.brake);
      if (state.clip) recover("Super clip", clipTimes[i], state.clip);
    }
    return { stages, time, harvested, deployed, charge, storeLimited, budgetLimited, unserved };
  }

  const xAt = (time, result) => 47 + 534 * time / result.time;
  const yAt = charge => 172 - charge / capacity * 118;
  function chargeAt(stage, time) {
    const fraction = stage.active ? Math.min(1, (time - stage.time) / stage.active) : 1;
    return stage.start + (stage.end - stage.start) * fraction;
  }

  function diagram(state, result, nextLap) {
    const { stages } = result;
    const x = time => xAt(time, result);
    const y = yAt;
    const trace = (lap, start) => [`${x(0)},${y(start)}`, ...lap.stages.flatMap(stage => [
      `${x(stage.time + stage.active)},${y(stage.end)}`, `${x(stage.time + stage.duration)},${y(stage.end)}`,
    ])].join(" ");
    const grid = [0, 1, 2, 3, 4].map(value =>
      `<path d="M47 ${y(value)}H581" stroke="currentColor" stroke-opacity=".2"/>
      <text x="36" y="${y(value) + 4}" text-anchor="end">${value}</text>`).join("");
    const columns = stages.map(stage => {
      const brake = stage.name === "Brake";
      const deploy = stage.name === "Deploy";
      const color = deploy ? blue : brake ? mint : amber;
      const label = deploy ? "D" : brake ? "B" : "S";
      const end = x(stage.time + stage.duration);
      return `<rect x="${x(stage.time)}" y="53" width="${end - x(stage.time) - 2}" height="119" fill="${color}" opacity=".11"/>
      <line x1="${end}" y1="53" x2="${end}" y2="172" stroke="currentColor" stroke-opacity=".09"/>
      <circle cx="${end}" cy="${y(stage.end)}" r="3" fill="${color}"/>
      <text x="${(x(stage.time) + end) / 2}" y="190" text-anchor="middle">${label}</text>`;
    }).join("");
    return `
      <title>Usable electrical charge during the lap</title>
      <desc>Charge falls in deployment stages and recovers in braking and optional super clipping stages. The vertical axis shows charge in megajoules. Horizontal blocks are ordered phases of the fictional lap.</desc>
      <g font-family="system-ui,sans-serif" font-size="13" fill="currentColor">
        <text x="12" y="24">MJ</text>
        <text x="47" y="24">Usable charge</text>
        <path d="M47 39H581" stroke="currentColor" stroke-opacity=".3"/>
        <text x="581" y="24" text-anchor="end">4.00 MJ store window</text>
        ${grid}
        ${columns}
        ${state.repeat === "on" ? `<polyline points="${trace(nextLap, result.charge)}" fill="none" stroke="${mint}" stroke-width="2" stroke-dasharray="5 5"/>` : ""}
        <polyline points="${trace(result, state.start)}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
        <circle cx="${x(0)}" cy="${y(state.start)}" r="4" fill="currentColor"/>
        <circle cx="${x(result.time)}" cy="${y(result.charge)}" r="4" fill="currentColor"/>
        <text x="47" y="213">Start</text>
        <text x="581" y="213" text-anchor="end">Finish</text>
        <text x="314" y="213" text-anchor="middle">D Deploy · B Brake harvest · S Super clip</text>
      </g>`;
  }

  LearnSandbox.mount({
    title: "Hybrid Lap Energy",
    replay: {label: "energy lap", duration: 12000},
    intro: "Charge is a stock. Recharge and deployment are flows. Build an energy plan for a fictional lap and see how the same energy store can accept more than 4 MJ across multiple cycles.",
    controls: [
      { id: "budget", label: "Lap recharge allowance", options: [["6", "6.0 MJ · Las Vegas qualifying"], ["7", "7.0 MJ"], ["8", "8.0 MJ · Las Vegas race, Overtake inactive"], ["8.5", "8.5 MJ"]], value: "8" },
      { id: "start", label: "Usable charge at start", min: 0.5, max: 4, step: 0.25, value: 2, unit: "MJ" },
      { id: "deploy", label: "Deployment in acceleration phases", min: 100, max: 350, step: 25, value: 250, unit: "kW" },
      { id: "brake", label: "Harvest under braking", min: 100, max: 350, step: 25, value: 275, unit: "kW" },
      { id: "clip", label: "Full-throttle harvesting", min: 0, max: 350, step: 25, value: 0, unit: "kW" },
      { id: "repeat", label: "Repeat-lap trace", value: "off", options: [["off", "First lap only"], ["on", "Overlay next lap · dashed"]] },
    ],
    challenge: "Use the 8.0 MJ allowance. Harvest at least 7.5 MJ, deploy at least 8.0 MJ and finish with 1.0 MJ or more in reserve.",
    sources: [
      ["FIA 2026 Technical Regulations, Issue 21 · C5.2.7 and C5.2.9–10", "https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_21_-_2026-10-19.pdf"],
      ["FIA · 2026 Las Vegas power unit information", "https://www.fia.com/system/files/decision-document/2026_las_vegas_grand_prix_-_power_unit_information.pdf"],
      ["FIA · 2026 in-season energy refinements", "https://www.fia.com/news/refinements-2026-fia-formula-1-regulations-agreed-all-stakeholders"],
    ],
    evaluate(state) {
      const result = simulate(state);
      const { charge, deployed, harvested, storeLimited, budgetLimited, unserved } = result;
      const balance = charge - state.start;
      const nextLap = simulate({ ...state, start: charge });
      const lapMode = state.budget === "6"
        ? "For one qualifying push, finishing with less charge can be acceptable. The 6.0 MJ allowance is from Las Vegas qualifying."
        : "For a repeatable race plan, aim to finish with at least as much charge as you started with. A negative balance draws on the opening reserve.";
      const success = state.budget === "8" && harvested + 1e-9 >= 7.5 && deployed + 1e-9 >= 8 && charge + 1e-9 >= 1;
      return {
        svg: diagram(state, result, nextLap),
        replay(progress) {
          const time = progress * result.time;
          const stage = result.stages.find(stage => time < stage.time + stage.duration) ?? result.stages.at(-1);
          const name = progress === 1 ? "Finish" : stage.name;
          return {svg: LearnSandbox.cursor(xAt(time, result), yAt(chargeAt(stage, time)), 53, 172),
            readout: time.toFixed(1) + " s · " + name + " · " + mj(chargeAt(stage, time))};
        },
        metrics: [
          ["Harvested this lap", mj(harvested) + " / " + mj(Number(state.budget))],
          ["Deployed this lap", mj(deployed)], ["Charge at finish", mj(charge)],
          ["Change from start", signedMj(balance)], ["Deployment if repeated", mj(nextLap.deployed)],
          ["Recharge blocked by allowance", mj(budgetLimited)],
          ["Recharge blocked by full store", mj(storeLimited)],
          ["Deployment request left unmet", mj(unserved)],
        ],
        explanation: "The FIA limits the usable state-of-charge swing to 4 MJ and measures lap recharge separately at the ERS-K DC bus. " + lapMode + " The dashed repeat lap starts from the first lap’s finishing charge and resets the recharge allowance. Flat sections show the store or allowance reaching a limit. Full-throttle harvesting, called super clipping, diverts some engine output to recharge. Timing and eligible phases are illustrative.",
        success,
        feedback: success ? "Target met. Repeated cycles moved more than 4 MJ through the store while the stored charge always stayed in its 0–4 MJ window."
          : state.budget !== "8" ? "Choose the 8.0 MJ allowance for this challenge."
          : harvested < 7.5 ? "Recovery is below target. Try stronger braking harvest or add full-throttle harvesting."
          : deployed < 8 ? "Deployment is below target. Try a greater request or enter with more charge if a deployment phase ran short."
          : "The finish reserve is below 1.0 MJ. Try more opening charge or use less electrical power during acceleration.",
      };
    },
  });
})();
