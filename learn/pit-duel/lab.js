(() => {
  "use strict";

  const fresh = 88.2;
  const leaderStop = 20;
  const signed = value => (value > 0 ? "+" : "") + value.toFixed(1) + " s";

  LearnSandbox.mount({
    title: "Pit Stop Duel",
    replay: {label: "pit comparison"},
    intro: "You start behind a rival. Compare the gap after both cars stop, when the temporary track-position swap has cleared.",
    controls: [
      { id: "call", label: "Your pit call", options: [["first", "Stop first · undercut"], ["second", "Stay out a lap · overcut"]], value: "first" },
      { id: "gap", label: "Starting deficit", min: 0.2, max: 3, step: 0.1, value: 0.8, unit: "s" },
      { id: "old", label: "Old-tyre comparison lap", min: 88.5, max: 93, step: 0.1, value: 90, unit: "s" },
      { id: "warm", label: "Early stopper’s warm-up cost", min: 0, max: 3, step: 0.1, value: 0.3, unit: "s" },
      { id: "traffic", label: "Early stopper’s traffic cost", min: 0, max: 3, step: 0.1, value: 1, unit: "s" },
      { id: "stop", label: "Your pit loss", min: 19, max: 23, step: 0.1, value: 20, unit: "s" },
    ],
    challenge: "Come out at least 0.5 s ahead with the rival’s stop fixed at 20 s. Try winning with each pit call.",
    sources: [
      ["Pirelli on Austria 2026’s undercuts", "https://www.formula1.com/en/latest/article/what-the-teams-said-race-day-in-austria-2026.2c6WyTl6yjshJrSwqRsYAK"],
      ["2026 Las Vegas tyre warm-up", "https://www.formula1.com/en/latest/article/what-tyres-will-the-teams-and-drivers-have-for-the-2026-las-vegas-grand-prix.1HEaoIW48MVZs9cAT7rP2w"],
      ["Formula 1 on undercuts and overcuts", "https://www.formula1.com/en/latest/article/jolyon-palmers-analysis-singapore-and-the-art-of-undercutting.1NgVyVsZnHTDEA9wi0s5lW"],
    ],
    evaluate(state) {
      const earlyLap = fresh + state.warm + state.traffic;
      const paceGain = (state.old - earlyLap) * (state.call === "first" ? 1 : -1);
      const pitGain = leaderStop - state.stop;
      const start = -state.gap;
      const afterPace = start + paceGain;
      const finish = Math.round((afterPace + pitGain) * 10) / 10;
      const scale = Math.max(2, Math.ceil(Math.max(Math.abs(start), Math.abs(afterPace), Math.abs(finish)) + 0.2));
      const y = value => 110 - value * 60 / scale;
      const points = [[106, start], [300, afterPace], [494, finish]];
      const labels = ["Starting gap", "After pace", "After both stops"];
      const success = finish >= 0.5;
      return {
        svg: `<g fill="currentColor" font-size="18">
          <text x="106" y="26">Gap to rival · positive means ahead</text>
          <path d="M75 110H530" stroke="currentColor" opacity=".45" stroke-dasharray="7 5"/>
          <text x="28" y="116">Level</text>
          <polyline points="${points.map(([x, delta]) => x + "," + y(delta)).join(" ")}" fill="none" stroke="var(--red, #e64b43)" stroke-width="4"/>
          ${points.map(([x, delta], i) => `<circle cx="${x}" cy="${y(delta)}" r="6"/>
            <text x="${x}" y="${y(delta) - 12}" text-anchor="middle">${signed(delta)}</text>
            <text x="${x}" y="211" text-anchor="middle">${labels[i]}</text>`).join("")}
        </g>`,
        replay(progress) {
          const stage = progress < .5 ? 0 : 1;
          const [x, delta] = points[stage];
          const [nextX, nextDelta] = points[stage + 1];
          const step = progress * 2 - stage;
          const gap = delta + (nextDelta - delta) * step;
          return {svg: LearnSandbox.cursor(x + (nextX - x) * step, y(gap), 45, 191),
            readout: (progress === 0 ? labels[0] : progress < .5 ? "Pace adjustment" :
              progress === 1 ? labels[2] : "Pit-loss adjustment") + " · " + signed(gap)};
        },
        metrics: [
          ["Early stopper’s out-lap", earlyLap.toFixed(1) + " s"],
          ["Pace gained on rival", signed(paceGain)],
          ["Pit loss gained on rival", signed(pitGain)],
          ["Gap after both stops", signed(finish)],
        ],
        explanation: "The early stopper runs 88.2 s on fresh tyres before warm-up and traffic costs. The late stopper runs the old-tyre lap. Pit losses are counted once each. These are illustrative timings on a common comparison interval.",
        success,
        feedback: success ? "You gained the place and cleared the 0.5 s target." :
          finish > 0 ? "You gained the place with less than 0.5 s to spare." :
            finish === 0 ? "The gains exactly cancel your starting deficit. You reach the comparison marker level." :
              "You remained behind. Compare the out-lap penalty with the old-tyre time, then try the other pit call.",
      };
    },
  });
})();
