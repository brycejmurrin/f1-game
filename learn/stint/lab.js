(() => {
  "use strict";

  const laps = 50;
  const sample = 0.70 * 0.75;
  const compounds = {
    soft: { label: "Soft", cliff: 18, penalty: 0, wear: 0.055 },
    medium: { label: "Medium", cliff: 26, penalty: 0.35, wear: 0.036 },
    hard: { label: "Hard", cliff: 33, penalty: 0.65, wear: 0.024 },
  };

  function tyreLoss(compound, age) {
    const { cliff, penalty, wear } = compound;
    return penalty + wear * age + 0.19 * Math.max(0, age - cliff) ** 1.55;
  }

  LearnSandbox.mount({
    title: "Stint Planner",
    replay: {label: "race stint", steps: laps - 1, first: 1},
    key: "The vertical scale shows seconds lost per lap. Solid is net pace, dashes are tyre-only, triangles mark the cliff and shading marks a plan without enough fuel.",
    intro: "Plan a fictional 50-lap dry race. Balance the tyres’ pace drop, starting fuel mass and the recoverable sample.",
    controls: [
      { id: "plot", label: "Plot", options: [["net", "Net pace and tyre-only reference"], ["tyres", "Tyre wear by stint"]], value: "net" },
      { id: "fixture", label: "Mandatory dry nomination", options: [["hard", "Teaching fixture · Hard"], ["vegas", "2026 Las Vegas · Medium or Hard"]], value: "hard" },
      { id: "start", label: "Starting tyre set", options: [["soft", "S1 · Soft"], ["medium", "M1 · Medium"], ["hard", "H1 · Hard"]], value: "medium" },
      { id: "finish", label: "Replacement tyre set", options: [["soft", "S2 · Soft"], ["medium", "M2 · Medium"], ["hard", "H2 · Hard"]], value: "medium" },
      { id: "stopLap", label: "Pit at the end of lap", min: 12, max: 39, step: 1, value: 34, unit: "" },
      { id: "fuel", label: "Starting fuel", min: 64.5, max: 67, step: 0.05, value: 65.2, unit: "kg" },
      { id: "savingLaps", label: "Lift-and-coast laps", min: 0, max: 12, step: 1, value: 0, unit: "" },
    ],
    challenge: "Finish with a recoverable sample, use an eligible dry tyre plan, and avoid laps beyond the tyre cliff. Then find a quicker legal plan.",
    sources: [
      ["2026 FIA Sporting Regulations · B5.1.4 and B6.3.6", "https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_b_sporting_-_iss_09_-_2026-10-01.pdf"],
      ["2026 FIA Technical Regulations · C6.5.2 fuel sample", "https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_21_-_2026-10-19.pdf"],
      ["2026 Las Vegas compound nominations", "https://www.formula1.com/en/latest/article/what-tyres-will-the-teams-and-drivers-have-for-the-2026-las-vegas-grand-prix.1HEaoIW48MVZs9cAT7rP2w"],
      ["FIA · Las Vegas event tyre prescriptions", "https://www.fia.com/system/files/decision-document/2026_las_vegas_grand_prix_-_competition_notes_-_pirelli_preview_v3.pdf"],
      ["Pirelli · Las Vegas podium stops", "https://press.pirelli.com/verstappen-wins-overtaking-spectacle-on-the-strip/"],
    ],
    evaluate(state) {
      const first = compounds[state.start];
      const second = compounds[state.finish];
      const remaining = state.fuel - laps * 1.30 + state.savingLaps * 0.10;
      const used = [state.start, state.finish];
      const vegas = state.fixture === "vegas";
      const mandatory = vegas ? "Medium or Hard" : "Hard";
      const tyreOk = state.start !== state.finish && (used.includes("hard") || vegas && used.includes("medium"));
      const fuelOk = remaining >= sample;
      const lengths = [state.stopLap, laps - state.stopLap];
      const worn = Math.max(0, lengths[0] - first.cliff) + Math.max(0, lengths[1] - second.cliff);
      const rows = [first, second].map((compound, index) =>
        Array.from({ length: lengths[index] }, (_, age) => tyreLoss(compound, age + 1)));
      const tyres = rows.flat();
      const showNet = state.plot !== "tyres";
      let fuel = state.fuel;
      const fuelAfter = [];
      const net = tyres.map((loss, lap) => {
        const saving = lap < state.savingLaps;
        const combined = loss + Math.max(0, fuel) * 0.03 + (saving ? 0.15 : 0);
        fuel -= saving ? 1.20 : 1.30;
        fuelAfter.push(fuel);
        return combined;
      });
      const incomplete = fuelAfter.findIndex(mass => mass < -1e-9);
      const maxLoss = Math.max(2, Math.ceil(Math.max(...tyres, ...(showNet ? net : []))));
      const x = lap => 68 + lap * 9.75;
      const y = pace => 167 - pace / maxLoss * 116;
      const chartLine = (values, stroke, dash) => lengths.map((length, stint) => {
        const offset = stint ? state.stopLap : 0;
        const points = values.slice(offset, offset + length).map((pace, lap) =>
          x(lap + offset + 1) + "," + y(pace)).join(" ");
        return `<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="3" stroke-dasharray="${dash}"/>`;
      }).join("");
      const projected = net.reduce((sum, loss) => sum + loss, 20);
      // Compare within the first stint, without crossing the end of lift-and-coast.
      const beforeCliff = Math.min(state.stopLap, first.cliff);
      const lastCompare = Math.min(beforeCliff - 1, state.savingLaps >= beforeCliff - 1 ? state.savingLaps - 1 : beforeCliff - 1);
      const firstCompare = state.savingLaps < lastCompare ? state.savingLaps : 0;
      const netChange = net[lastCompare] - net[firstCompare];
      const tyreChange = tyres[lastCompare] - tyres[firstCompare];
      const signedSeconds = value => (value > 0 ? "+" : "") + value.toFixed(2) + " s";
      const result = remaining < 0 ? "Fuel runs out" : fuelOk ? "Sample covered" : "Sample short";
      const success = tyreOk && fuelOk && !worn;
      const next = !tyreOk ? "Use two specifications and include " + mandatory + "." :
        !fuelOk ? "Add starting fuel or use more saving laps." :
          worn ? "Shift the stop to keep both stints inside their tyre limits." :
            "The plan meets the fuel and tyre targets. Compare its projected cost with another plan.";
      return {
        svg: `<g fill="currentColor" font-size="17">
          <text x="67" y="29">Projected pace loss · s/lap</text>
          <path d="M68 51V167H556M68 109H556M68 51H556" fill="none" stroke="currentColor" opacity=".28"/>
          <text x="58" y="173" text-anchor="end">0</text>
          <text x="58" y="115" text-anchor="end">${maxLoss / 2}</text>
          <text x="58" y="57" text-anchor="end">${maxLoss}</text>
          <path d="M${x(state.stopLap)} 51V167" stroke="currentColor" opacity=".55" stroke-dasharray="4 5"/>
          <text x="${x(state.stopLap)}" y="192" text-anchor="middle">Pit · lap ${state.stopLap}</text>
          <text x="68" y="192">Lap 1</text><text x="556" y="192" text-anchor="end">Lap 50</text>
          ${incomplete >= 0 ? `<rect x="${x(incomplete + .5)}" y="51" width="${556 - x(incomplete + .5)}"
            height="116" fill="currentColor" opacity=".18"/>` : ""}
          ${chartLine(tyres, "currentColor", "7 5")}
          ${showNet ? chartLine(net, "var(--red, #e64b43)", "") : ""}
          ${[first, second].map(({ cliff }, stint) => {
            if (lengths[stint] <= cliff) return "";
            const lap = (stint ? state.stopLap : 0) + cliff + 1;
            return `<path d="M${x(lap)} ${y(tyres[lap - 1]) - 5}l5 9h-10z"/>`;
          }).join("")}
          ${showNet ? `<path d="M68 218h25" stroke="var(--red, #e64b43)" stroke-width="3"/>
            <text x="102" y="223">Net pace loss</text>` : ""}
          <path d="M249 218h25" stroke="currentColor" stroke-width="3" stroke-dasharray="7 5"/>
          <text x="283" y="223">Tyre-only</text>
          <text x="556" y="223" text-anchor="end">▲ Cliff begins</text>
        </g>`,
        replay(progress) {
          const lap = Math.round(progress * (laps - 1));
          if (incomplete >= 0 && lap >= incomplete) {
            return {svg: `<path d="M${x(lap + 1)} 51V167" stroke="currentColor" stroke-dasharray="3 4"/>`,
              readout: "Lap " + (lap + 1) + " · Incomplete · 0.00 kg fuel · " +
                (-fuelAfter[lap]).toFixed(2) + " kg shortfall · no completed pace"};
          }
          const pace = showNet ? net[lap] : tyres[lap];
          const late = lap >= state.stopLap;
          const age = lap + 1 - (late ? state.stopLap : 0);
          return {svg: LearnSandbox.cursor(x(lap + 1), y(pace), 51, 167),
            readout: "Lap " + (lap + 1) + " · " + (late ? second : first).label + " age " + age +
              " · " + Math.max(0, fuelAfter[lap]).toFixed(2) + " kg fuel · " + signedSeconds(tyres[lap]) +
              " tyre-only · " + signedSeconds(net[lap]) + " net"};
        },
        metrics: [
          ["Dry tyre rule", tyreOk ? "Two specifications, including " + mandatory : "Plan fails"],
          ["Laps beyond the tyre cliff", String(worn)],
          ["Fuel at finish", remaining.toFixed(3) + " kg · " + result],
          ["Projected loss against reference", remaining < 0 ? "Cannot complete distance" : projected.toFixed(1) + " s"],
          ["Pre-cliff · laps " + (firstCompare + 1) + "–" + (lastCompare + 1),
            signedSeconds(tyreChange) + " tyre-only · " + signedSeconds(netChange) + " net"],
        ],
        explanation: (vegas ? "Las Vegas nominated Medium and Hard. The 2026 podium used Soft then Medium under the Safety Car. This 50-lap pace model remains illustrative. " : "The teaching fixture nominates Hard. ") +
          "An all-slick race requires two distinct dry specifications including a nominated one. The FIA requires a 0.70 L recoverable sample during competition. This model checks estimated finish mass using 0.75 kg/L and ideal recovery. The solid net pace line includes fuel mass and lift-and-coast. The projected total includes a 20 s stop. A shaded lap shows the planned projection after the fuel becomes insufficient.",
        success,
        feedback: next,
      };
    },
  });
})();
