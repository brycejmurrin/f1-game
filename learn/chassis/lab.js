(() => {
  "use strict";

  const fia21 = "https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_c_technical_-_iss_21_-_2026-10-19.pdf";
  const limits = {wheelbase: 3400, halfWidth: 950};
  const scale = .074;
  const axle = 135;
  const center = 112;
  const accent = "var(--red, currentColor)";
  const format = n => n.toLocaleString("en-GB");
  const guides = `<path d="M68 112H474" stroke="currentColor" opacity=".3" stroke-dasharray="4 5"/>
    <text x="68" y="105">Y = 0</text><text x="134" y="28" text-anchor="middle">Front axle</text>`;

  function shell(wheelbase, halfWidth, stroke, dash = "") {
    const rear = axle + wheelbase * scale;
    const h = halfWidth * scale;
    return `<rect x="${axle - 46}" y="${center - h}" width="${rear - axle + 87}" height="${2 * h}"
      rx="2" fill="none" stroke="${stroke}" opacity=".65" stroke-dasharray="${dash || "2 5"}"/>
      <path d="M${axle - 46} ${center - h + 7} h64 l-9 ${h - 27} l50 -1
        q25 -10 42 -12 Q221 67 249 61 L${rear - 48} ${center - h + 9}
        l17 7 h72 v${2 * h - 32} h-72 l-17 7 L249 163 Q221 157 182 144 l-38 -12
        l9 ${h - 26} h-64 z"
        fill="${dash ? "none" : "currentColor"}" fill-opacity=".08" stroke="${stroke}" stroke-width="2.4" stroke-dasharray="${dash}"/>`;
  }

  function tyres(wheelbase, halfWidth) {
    const spread = halfWidth * scale;
    return [axle, axle + wheelbase * scale].map((x, index) =>
      [-1, 1].map(side => {
        const y = center + side * spread;
        const depth = index === 0 ? 22 : 25;
        return `<rect x="${x - 14}" y="${y - depth / 2}" width="28" height="${depth}" rx="4"
          fill="var(--surf-1, #222)" stroke="currentColor" stroke-width="2"/>
          <path d="M${x - 8} ${y - depth / 2 + 3}v${depth - 6} M${x + 8} ${y - depth / 2 + 3}v${depth - 6}"
          stroke="currentColor" opacity=".3"/>`;
      }).join("")
    ).join("");
  }

  function top(wheelbase, halfWidth, overlay) {
    const rear = axle + wheelbase * scale;
    const edge = center - halfWidth * scale;
    return `<g font-size="13" fill="currentColor">
      ${overlay ? shell(3600, 1000, "currentColor", "5 4") : ""}
      ${shell(wheelbase, halfWidth, accent)}${tyres(wheelbase, halfWidth)}${guides}
      <path d="M${axle} 34V211 M${rear} 34V211" fill="none" stroke="currentColor" stroke-dasharray="3 4" opacity=".5"/>
      <path d="M${axle} 206H${rear} M${axle} 201v10 M${rear} 201v10
        M74 ${edge}V${center} M69 ${edge}h10 M69 ${center}h10" fill="none" stroke="${accent}" stroke-width="2"/>
      <text x="${(axle + rear) / 2}" y="228" text-anchor="middle">${format(wheelbase)} mm between axle planes</text>
      <text x="66" y="${(edge + center) / 2}" text-anchor="end">${format(halfWidth)} mm</text>
      <text x="${rear}" y="28" text-anchor="middle">Rear axle</text>
      <text x="461" y="72">Body envelope</text>
      <path d="M399 ${Math.max(edge, 42) + 2} L453 68" stroke="${accent}" fill="none"/>
      <text x="461" y="127">Tyre shown outside</text><text x="461" y="145">body envelope</text>
      <path d="M${rear + 8} ${center + (center - edge) - 2} L453 143" stroke="currentColor" opacity=".65" fill="none"/>
      ${overlay ? '<path d="M461 184h26" stroke="currentColor" stroke-dasharray="5 4"/><text x="493" y="188">Prior concept</text>' : ""}
    </g>`;
  }

  const floorFlow = ["M56 143 H135 Q184 144 263 117", "M332 143 H415 Q479 144 542 127"];

  function floor() {
    return `<g font-size="13" fill="currentColor">
      <text x="44" y="30">Prior concept · shaped floor tunnels</text>
      <text x="320" y="30">2026 · partially flat floor</text>
      <path d="M44 157H550" stroke="currentColor" opacity=".35"/>
      <path d="M54 128 Q91 129 125 133 H171 Q204 126 268 82
        M330 128 Q370 129 400 133 H453 Q481 128 548 107" stroke="${accent}" stroke-width="4" fill="none"/>
      <path d="${floorFlow.join(" ")}" stroke="currentColor" opacity=".65" stroke-dasharray="5 4" fill="none"/>
      <path d="M254 116l9 1-6 7 M533 124l9 3-7 6" stroke="currentColor" opacity=".65" fill="none"/>
      <path d="M54 128L84 102H212L268 82 M330 128l34-26h123l61 5" stroke="currentColor" opacity=".26" fill="none"/>
      <text x="44" y="179">Track surface</text>
      <text x="44" y="211">2026 concept uses a lower-powered diffuser · geometry is illustrative</text>
    </g>`;
  }

  function wakePaths(inwash) {
    return [-1, 1].map(side => {
      const start = 123 + side * 21;
      const bend = 123 + side * (inwash ? 14 : 48);
      const end = 123 + side * (inwash ? 12 : 71);
      return `M86 ${start} C161 ${start} 207 ${bend} 282 ${end} S436 ${end} 559 ${end}`;
    });
  }

  function wake(style, offset) {
    const inwash = style === "in";
    const yFollower = 123 + offset * .65;
    const car = (x, y) => `<g fill="var(--surf-1, #24242b)" stroke="currentColor" stroke-width="1.7">
      <path d="M${x} ${y - 19}h11v13h27l15 -13h49v38h-49l-15 -13h-27v13h-11z"/>
      <rect x="${x + 18}" y="${y - 26}" width="14" height="12" rx="3"/>
      <rect x="${x + 18}" y="${y + 14}" width="14" height="12" rx="3"/>
      <rect x="${x + 77}" y="${y - 27}" width="16" height="14" rx="3"/>
      <rect x="${x + 77}" y="${y + 13}" width="16" height="14" rx="3"/>
    </g>`;
    return `<defs><marker id="wheel-wake-arrow" viewBox="0 0 8 8" refX="7" refY="4"
      markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L8 4L0 8z" fill="currentColor"/></marker></defs>
      <g font-size="13" fill="currentColor">
        <text x="42" y="27">TOP VIEW · noses face left</text>
        <text x="333" y="27">${inwash ? "Inwash · toward the centreline" : "Outwash · toward the outside"}</text>
        <path d="M32 123H571" stroke="currentColor" opacity=".36" stroke-dasharray="4 5"/>
        ${car(58, 123)}${car(433, yFollower)}
        ${wakePaths(inwash).map(path => `<path d="${path}" fill="none" stroke="${accent}" stroke-width="3"
          stroke-dasharray="8 5" marker-end="url(#wheel-wake-arrow)"/>`).join("")}
        <text x="57" y="184">Lead car</text>
        <text x="432" y="${yFollower < 123 ? yFollower + 43 : yFollower - 32}">Following car</text>
        <path d="M210 215h77" stroke="currentColor" marker-end="url(#wheel-wake-arrow)"/>
        <text x="297" y="219">Flow direction · schematic tyre wake</text>
      </g>`;
  }

  LearnSandbox.mount({
    title: "Nimble Chassis X-ray",
    replay: {label: state => state.view === "floor" ? "floor airflow" : "tyre wake"},
    intro: "Compare FIA package dimensions, play airflow in the Floor and Inwash layers, or make a blind legality call.",
    controls: [
      {id: "view", primary: true, label: "Drawing layer", options: [["compare", "Axle and body overlay"], ["floor", "Floor cutaway · playable airflow"], ["wake", "Inwash / outwash · playable airflow"], ["inspect", "Free inspection"], ["challenge", "Challenge · fixed 3,450 / 945 mm"], ["edge", "Challenge · exact limits"]], value: "compare"},
      {id: "wakeStyle", primary: true, when: state => state.view === "wake", label: "Tyre wake direction (wake layer)", options: [["out", "Outwash"], ["in", "Inwash"]], value: "out"},
      {id: "offset", when: state => state.view === "wake", label: "Following car offset (wake layer)", min: -75, max: 75, step: 5, value: 0, unit: "%"},
      {id: "wheelbase", when: state => state.view === "inspect", label: "Candidate wheelbase", min: 3200, max: 3600, step: 10, value: 3450, unit: "mm"},
      {id: "body", when: state => state.view === "inspect", label: "Candidate body half-width", min: 850, max: 1000, step: 5, value: 945, unit: "mm"},
      {id: "answer", primary: true, when: state => state.view === "challenge" || state.view === "edge", label: "Your inspection call", options: [["unset", "Choose a result"], ["pass", "Both dimensions pass"], ["axle", "Wheelbase only fails"], ["body", "Body half-width only fails"], ["both", "Both dimensions fail"]], value: "unset"},
    ],
    challenge: "Choose the fixed 3,450 / 945 mm challenge and decide which measurements pass. Then try the exact-limit fixture to see how the rule treats equality.",
    sources: [
      ["FIA Section C Issue 21 · C2.3 and C3.5", fia21],
      ["FIA comparative 2026 package concept", "https://www.fia.com/news/new-era-competition-fia-showcases-future-focused-formula-1-regulations-2026-and-beyond"],
    ],
    evaluate({view, wheelbase, body, answer, wakeStyle, offset}) {
      const blind = view === "challenge" || view === "edge";
      if (blind) [wheelbase, body] = view === "edge" ? [limits.wheelbase, limits.halfWidth] : [3450, 945];
      const axleFail = wheelbase > limits.wheelbase;
      const bodyFail = body > limits.halfWidth;
      const result = axleFail ? (bodyFail ? "both" : "axle") : (bodyFail ? "body" : "pass");
      const inspection = view === "inspect" || blind;
      const wakeView = view === "wake";
      const traces = wakeView ? wakePaths(wakeStyle === "in") : view === "floor" ? floorFlow : null;
      const success = blind && answer === result;
      const check = (n, max) => format(n) + " mm · " + (n <= max ? "within limit" : format(n - max) + " mm over");
      const metrics = wakeView ? [
        ["Front-tyre wake direction", wakeStyle === "in" ? "In toward the centreline" : "Out away from the centreline"],
        ["Follower offset", offset === 0 ? "Centred" : `${Math.abs(offset)}% of schematic half-lane · ${offset < 0 ? "above" : "below"} centre`],
        ["Evidence", "FIA design intent · no calculated grip or drag"],
      ] : inspection ? [
        ["Axle separation", blind ? `${format(wheelbase)} mm` : check(wheelbase, limits.wheelbase)],
        ["Applicable body half-width", blind ? `${format(body)} mm` : check(body, limits.halfWidth)],
        ["Tyre, rim and specified rim attachments", "Excluded from the C2.3 lateral limit"],
      ] : [
        ["Maximum wheelbase", "3,600 → 3,400 mm"],
        ["Comparative body width", "2,000 → 1,900 mm"],
        ["Wheel diameter", "18 inches retained"],
        ["Comparative tyre tread width", "Front −25 mm · rear −30 mm"],
      ];
      const explanation = wakeView
        ? "Switch direction and offset the follower to compare where the tyre-wake paths sit. The FIA describes the 2026 in-washing control boards behind the front tyres as a way to manage their wake and help cars follow. This top view shows the intended direction. It gives no measured wake shape or follower load."
        : inspection
        ? "C2.3 measures the axle planes and the applicable envelope at Legality Setup. It gives 3,400 mm axle separation and 950 mm from the centre plane. The tyre, rim and specified rim attachments have a lateral exception."
        : view === "floor"
          ? "The FIA concept describes a partially flat floor and a lower-powered diffuser. The cutaway illustrates the airflow path. Its dimensions and forces are schematic."
          : "Both silhouettes use the same scale and front-axle origin. The FIA uses these dimensions to describe the package change. Agility also depends on mass distribution, tyres and aero.";
      return {
        key: wakeView ? "Arrows show the direction of tyre wake with the noses facing left." :
          inspection ? "Limits at legality setup: 3,400 mm wheelbase and 950 mm body half-width." :
          "The illustration compares FIA package dimensions on a common scale.",
        svg: wakeView ? wake(wakeStyle, offset) : view === "floor" ? floor() : top(inspection ? wheelbase : limits.wheelbase, inspection ? body : limits.halfWidth, view === "compare"),
        replay: traces && (progress => ({svg: traces.map(path => `<path d="${path}" pathLength="100" fill="none"
          stroke="currentColor" stroke-linecap="round" stroke-width="4" stroke-dasharray="5 95"
          stroke-dashoffset="${-95 * progress}"/>`).join("")})),
        metrics,
        explanation,
        success,
        feedback: wakeView ? "Compare both paths at the same offset. Then move the follower to see why position matters." : !blind ? "Choose one of the two fixed challenge fixtures to submit an inspection call."
          : answer === "unset" ? "Compare each candidate number with its own C2.3 limit, then make your call."
          : success ? "Correct. You classified both measurements independently and used the body half-width exception for the tyre."
          : "Check the axle separation against 3,400 mm and the applicable half-width against 950 mm. A measurement exactly on its limit passes.",
      };
    },
  });
})();
