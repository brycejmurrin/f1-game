(() => {
  "use strict";

  const accent = "var(--red, currentColor)";
  const mass = 800;
  const gravity = 9.81;
  const cgHeight = .30;
  const wheelbase = 3.40;
  const fia21 = "https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_21_-_2026-10-19.pdf";

  const arrows = `<defs><marker id="susp-arrow" viewBox="0 0 8 8" refX="7" refY="4"
    markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z" fill="currentColor"/></marker></defs>`;

  function linkage(rod, bump) {
    const push = rod === "push";
    const travel = bump * 1.2;
    const outerRest = push ? 166 : 95;
    const outer = outerRest - travel;
    const pivot = push ? 81 : 163;
    const radius = 21;
    // Locate the rod/rocker joint where the two fixed-length circles meet.
    // Choose the branch that gives a vertically downward rocker arm at rest.
    const rodLength = Math.hypot(325 - 142, pivot + radius - outerRest);
    const distance = Math.hypot(142 - 325, outer - pivot);
    const offset = Math.acos((radius * radius + distance * distance - rodLength * rodLength) / (2 * radius * distance));
    const theta = Math.atan2(outer - pivot, 142 - 325) - offset;
    const rotation = theta - Math.PI / 2;
    const angle = rotation * 180 / Math.PI;
    const jointX = 325 + radius * Math.cos(theta);
    const jointY = pivot + radius * Math.sin(theta);
    const springX = 325 + 27 * Math.cos(rotation) - 10 * Math.sin(rotation);
    const springY = pivot + 27 * Math.sin(rotation) + 10 * Math.cos(rotation);
    const pistonX = 412 + 13 * Math.sin(rotation);
    const load = push ? "Compression" : "Tension";
    return `${arrows}<g font-size="13" fill="currentColor">
      <text x="31" y="27">FRONT VIEW · one wheel</text>
      <text x="414" y="27">${push ? "Pushrod" : "Pullrod"} · ${load.toLowerCase()} in bump</text>
      <path d="M32 213H562" stroke="currentColor" opacity=".28"/>
      <rect x="72" y="122" width="41" height="86" rx="11" fill="none" stroke="currentColor" opacity=".32" stroke-dasharray="5 4"/>
      <rect x="72" y="${122 - travel}" width="41" height="86" rx="11" fill="var(--surf-1, #222)" stroke="currentColor" stroke-width="2.5"/>
      <path d="M112 ${131 - travel}L142 ${122 - travel} V${186 - travel} L112 ${190 - travel}
        M142 ${122 - travel}L278 119H335 M142 ${186 - travel}L278 181H335" stroke="currentColor" stroke-width="2" fill="none" opacity=".65"/>
      <path d="M142 ${outer}L${jointX} ${jointY}" stroke="${accent}" stroke-width="4" fill="none"/>
      <circle cx="142" cy="${outer}" r="5" fill="${accent}"/>
      <path d="M325 ${pivot} l0 21 27 -11 z" fill="var(--surf-1, #222)" stroke="currentColor" stroke-width="2" transform="rotate(${angle} 325 ${pivot})"/>
      <circle cx="325" cy="${pivot}" r="4" fill="currentColor"/>
      <path d="M${springX} ${springY}L377 ${pivot + 10}l5 -7 7 14 7 -14 7 14 7 -14 7 14 7 -14 6 7h23
        M${springX} ${springY}L${pistonX} ${pivot + 29}H439" fill="none" stroke="currentColor" stroke-width="2"/>
      <rect x="${pistonX}" y="${pivot + 25}" width="6" height="8" fill="${accent}"/>
      <path d="M391 ${pivot + 22}H439V${pivot + 36}H391" fill="none" stroke="currentColor" stroke-width="2"/>
      <path d="M453 ${pivot - 4}v48" stroke="currentColor" stroke-width="3"/>
      <text x="32" y="70">Wheel bump</text>
      <path d="M53 164V${Math.min(118 - travel, 136)}" stroke="currentColor" marker-end="url(#susp-arrow)"/>
      <text x="150" y="${112 - travel}">Upright</text>
      <text x="293" y="${pivot - 12}">Rocker</text>
      <text x="467" y="${pivot + 15}">Spring</text>
      <text x="467" y="${pivot + 35}">Damper</text>
      <text x="30" y="234">Dashed outline: wheel at rest · linkage motion exaggerated</text>
    </g>`;
  }

  function braking(decel, high, transfer, pitch, includeArrows = true) {
    const front = mass * gravity * .47 + transfer;
    const rear = mass * gravity * .53 - transfer;
    const fTop = 188 - front / 116;
    const rTop = 188 - rear / 116;
    const angle = -pitch * 5;
    return `${includeArrows ? arrows : ""}<g font-size="13" fill="currentColor">
      <text x="30" y="27">SIDE VIEW · front at left</text>
      <text x="349" y="27">${high ? "Higher" : "Lower"} anti-dive geometry</text>
      <path d="M91 49H36" stroke="currentColor" marker-end="url(#susp-arrow)"/>
      <text x="98" y="53">Travel</text>
      <path d="M31 188H569" stroke="currentColor" opacity=".5"/>
      <circle cx="126" cy="166" r="22" fill="var(--surf-1, #222)" stroke="currentColor" stroke-width="2.5"/>
      <circle cx="472" cy="166" r="22" fill="var(--surf-1, #222)" stroke="currentColor" stroke-width="2.5"/>
      <path d="M86 137L183 115H257l25 -23h37l28 23h139l36 20v11H85z"
        stroke="currentColor" opacity=".45" stroke-dasharray="4 4" fill="none"/>
      <g transform="rotate(${angle} 300 129)">
        <path d="M86 137L183 115H257l25 -23h37l28 23h139l36 20v11H85z"
          stroke="${accent}" stroke-width="2.5" fill="var(--surf-1, #222)"/>
        <circle cx="300" cy="126" r="5" fill="currentColor"/>
        <text x="310" y="130">CG</text>
      </g>
      <path d="M126 168L192 ${high ? 125 : 161}l44 ${high ? -16 : -10}" stroke="${accent}" stroke-width="3.5" fill="none"/>
      <path d="M219 ${high ? 103 : 159}H279" stroke="currentColor" opacity=".65"/>
      <text x="286" y="${high ? 107 : 164}">Front linkage force path</text>
      <path d="M126 186V${fTop} M472 186V${rTop}" stroke="currentColor" stroke-width="2" marker-end="url(#susp-arrow)"/>
      <path d="M126 199h${decel * 27}" stroke="${accent}" stroke-width="2" ${decel ? 'marker-end="url(#susp-arrow)"' : ""}/>
      ${decel ? '<text x="126" y="216">Braking force</text>' : ""}
      <text x="30" y="234">Up arrows: axle load · dashed body: no-braking position · pitch exaggerated</text>
    </g>`;
  }

  LearnSandbox.mount({
    title: "Pushrod, Pullrod & Anti-dive",
    replay: {label: state => state.view === "braking" ? "braking load sweep" : "bump and return", rewind: true,
      input: state => state.view === "braking" ? "decel" : null},
    intro: "Trace a wheel bump into the spring, then change how the front suspension reacts to braking.",
    inGame: "Use anti-roll bars and ride height in Garage Setup to change mechanical balance and aero load. Apex applies those changes through handling and downforce modifiers. On an F1 car, the rods, rockers and dampers respond to their physical geometry, as the cutaway shows.",
    presets: [
      ["Same bump · light damping", {view:"linkage", rod:"push", bump:20, damping:"low"}],
      ["Same bump · firm damping", {view:"linkage", rod:"push", bump:20, damping:"high"}],
    ],
    key: "The dashed wheel outline marks rest. Positive travel rises from rest and negative travel shows rebound below it.",
    controls: [
      {id: "view", primary: true, label: "Experiment", options: [["linkage", "Wheel bump · front view"], ["braking", "Braking loads · side view"], ["compare", "Compare anti-dive at 1 g"]], value: "linkage"},
      {id: "rod", when: state => state.view === "linkage", label: "Rocker actuation", options: [["push", "Pushrod · rocker above"], ["pull", "Pullrod · rocker below"]], value: "push"},
      {id: "bump", primary: true, when: state => state.view === "linkage", label: "Wheel bump (front view)", min: 0, max: 30, step: 1, value: 15, unit: "mm"},
      {id: "damping", when: state => state.view === "linkage", label: "Damping on return", options: [["low", "Light"], ["high", "Firm"]], value: "high"},
      {id: "decel", primary: true, when: state => state.view === "braking", label: "Braking deceleration", min: 0, max: 3, step: .1, value: 1, unit: "g"},
      {id: "geometry", when: state => state.view === "braking", label: "Fixed braking geometry", options: [["low", "Lower anti-dive"], ["high", "Higher anti-dive"]], value: "low"},
      {id: "answer", when: state => state.view === "braking", label: "Your prediction", options: [["unset", "Choose a prediction"], ["less", "Less front load transfer"], ["same", "Same front load transfer"], ["more", "More front load transfer"]], value: "unset"},
    ],
    challenge: "Compare both geometries at 1 g. The body dives less with higher anti-dive. In Braking loads, choose higher anti-dive at 1 g and predict what happens to front load transfer.",
    sources: [
      ["Formula 1 explainer · rods and rockers", "https://www.formula1.com/en/latest/article/explainer-whats-the-difference-between-pull-rod-and-push-rod-suspension.1I3wL4LEL0nQZbKZbx1Dhz"],
      ["FIA Section C Issue 21 · C10.2 and C10.3", fia21],
      ["MIT vehicle dynamics study · tyre loads", "https://dspace.mit.edu/bitstream/handle/1721.1/139209/gaither-gaither-sb-2-2021-thesis.pdf"],
    ],
    evaluate({view, rod, bump, damping, decel, geometry, answer}) {
      const high = geometry === "high";
      const push = rod === "push";
      const brakeView = view === "braking";
      const transfer = mass * gravity * decel * cgHeight / wheelbase;
      const pitch = decel * (high ? .45 : 1);
      const challengeSetup = brakeView && high && Math.abs(decel - 1) < 1e-9;
      const success = challengeSetup && answer === "same";
      if (view === "compare") {
        const shift = mass * gravity * cgHeight / wheelbase;
        return {svg: `<g transform="translate(0 40) scale(.5)">${braking(1, false, shift, 1)}</g>
          <g transform="translate(300 40) scale(.5)">${braking(1, true, shift, .45, false)}</g>`,
          key: "Both panels use the same deceleration. Compare the body pitch and the axle load arrows.",
          metrics: [["Forward shift, both cars", Math.round(shift) + " N"], ["Lower anti-dive pitch index", "1.00"], ["Higher anti-dive pitch index", "0.45"]],
          explanation: "Both cars brake at 1 g with the same mass, CG height and wheelbase. Geometry shifts the load path through the suspension and changes pitch. Axle load transfer is the same.",
          success: false, feedback: "Use the Braking loads view to submit your prediction."};
      }
      return {
        svg: brakeView ? braking(decel, high, transfer, pitch) : "",
        key: brakeView ? "Arrows at the wheels show axle loads. The dashed body outline marks the unpitched position." : undefined,
        replay: !brakeView && (progress => {
          const returnPhase = Math.max(0, (progress - .35) / .65);
          const decay = damping === "high" ? 7 : 3;
          const frequency = damping === "high" ? 12 : 15;
          const angle = frequency * returnPhase;
          const recovery = Math.exp(-decay * returnPhase) * (Math.cos(angle) + decay / frequency * Math.sin(angle));
          const travel = progress === 1 ? 0 : bump * (progress < .35 ? progress / .35 : recovery);
          const phase = progress === 0 || progress === 1 ? "rest" : progress < .35 ? "rising" : "settling";
          return {svg: linkage(rod, travel), readout: travel.toFixed(1) + " mm · " + phase};
        }),
        metrics: brakeView ? [
          ["Forward load shift", `${Math.round(transfer)} N · both geometries at this deceleration`],
          ["Illustrative pitch index", `${pitch.toFixed(2)} · lower anti-dive at 1 g = 1.00`],
          ["Fixed inputs", "800 kg · 0.30 m CG height · 3.40 m wheelbase"],
        ] : [
          ["Wheel bump", `${bump} mm upwards`],
          ["Rod load during upward bump", push ? "Compression" : "Tension"],
          ["Inboard package", push ? "Higher rocker location in this diagram" : "Lower rocker location in this diagram"],
        ],
        explanation: brakeView
          ? "At fixed deceleration, axle load shift follows mass × deceleration × CG height ÷ wheelbase on flat ground with no aero. The pivot geometry changes the route of braking loads through the chassis, so the body pitch in this illustration changes independently."
          : "The rocker drives an inboard spring and a damper piston. The spring symbol is generic and an F1 example is a torsion bar. Light and firm damping return the wheel through rest with different amounts of signed rebound. The pushrod works in compression and the pullrod in tension during the illustrated upward bump.",
        success,
        feedback: !challengeSetup ? "Set Braking loads, 1 g and Higher anti-dive to compare against the lower geometry."
          : answer === "unset" ? "The diagram shows less pitch. Make a prediction about the vertical axle loads."
          : success ? "Correct. The nose dives less in the example, but about 692 N still shifts to the front. The external moment balance stayed the same."
          : "Look at the fixed inputs. The body pitch changed, while the mass, CG height, wheelbase and deceleration stayed the same.",
      };
    },
  });
  // TRY IT IN THE CAR: the Dive Test drill (js/learn-drills/dive.js), only inside the game's LEARN frame. BACK TO
  // LESSON posts the last run here (js/ui/learn-door.js reopen()).
  if (typeof window !== "undefined" && window.frameElement?.id === "learn-lab") {
    const lab = document.getElementById("lab");
    const launch = document.createElement("button");
    launch.type = "button";
    launch.id = "launch-dive-drill";
    launch.textContent = "Try it in the car: Dive Test";
    launch.addEventListener("click", () => window.parent.postMessage({type: "apex-learn-scenario", id: "dive"}, window.location.origin));
    const result = document.createElement("p");
    result.id = "dive-drill-result";
    result.setAttribute("role", "status");
    result.hidden = true;
    lab.append(launch, result);
    window.addEventListener("message", event => {
      const data = event.data;
      if (event.origin !== window.location.origin || event.source !== window.parent || data?.type !== "apex-learn-result" ||
          data.id !== "dive" || !data.result) return;
      const r = data.result, medal = r.medal ? r.medal.toUpperCase() : "No medal";
      result.textContent = "Your last drill: " + medal + ". " + (r.verdict || "");
      result.hidden = false;
    });
  }
})();
