/* Apex 26 — the GARAGE ENTER & LEAVE tuner's extra rows (VISUAL STUDIO, #garrival), out of the eager shell (#5660:
 * each PR pays its boot bytes). LAZY_RACE's garage files (LazyBundles.ensureGarageData: idle, garage entry, SETTINGS,
 * RACE!); GarageArrival.bindSettings builds them when present, else on the panel's open tap. */
const GarageArrivalRows = (function () {
  "use strict";
  let _d = null;   // GarageArrival's ids, styles and moods for this build
  /* THE ROWS BEYOND THE SHIPPED FORM, built from these tables into #ga-rows once
   * (index.html's node budget is shrink-only: tests/data/ratchets.json shellNodes).
   * A row: [id, label, options as [value, text] (or a function making them: the
   * moods are GarageScene's) | "check"];
   * a string is a help line; { group, rows } a block CUSTOM shows and hides. The
   * extra GARAGE ANGLE presets join #ga-angle's shipped three the same way. */
  const CAM_TEXT = Object.freeze({ left: "LEFT BAY", right: "RIGHT BAY", high: "HIGH CORNER", low: "FLOOR LEVEL", door: "DOOR JAMB" });
  const camOpts = () => _d.CAM_IDS.map((id) => [id, CAM_TEXT[id]]);
  const crewOpts = (first) => [first, ["current", "GARAGE CREW"], ["guides", "GUIDE CREW"], ["service", "SERVICE CREW"], ["welcome", "WELCOME CREW"], ["none", "NO CREW"]];
  const MOOD_TEXT = Object.freeze({ shipped: "STANDARD", goldenhour: "GOLDEN HOUR", rain: "RAIN DAY", neon: "NEON NIGHT" });
  const moodOpts = () => _d.moodIds().map((id) => [id, MOOD_TEXT[id] || id.toUpperCase()]);
  const cueOpts = () => _d.cueIds().map((id) => [id, GarageScene.cueLabel ? GarageScene.cueLabel(id) : id.toUpperCase()]);
  const ANGLE_TEXT = Object.freeze({ high: "HIGH CORNER", low: "FLOOR LEVEL", door: "DOOR JAMB", director: "DIRECTOR · THREE CAMERAS", custom: "CUSTOM · PICK EACH SHOT" });
  function build($, d) {
    _d = d;
    const { STYLES, RIG_IDS, RIG_LABEL } = d;
    const AFTER_ANGLE = [
      { group: "ga-shots-row", rows: ["Shot 1 is the shutter, shot 2 the car on the move, shot 3 the finish (backing in, or leaving down the lane).",
        ["ga-shot1", "SHOT 1 CAMERA", camOpts()], ["ga-shot2", "SHOT 2 CAMERA", camOpts()], ["ga-shot3", "SHOT 3 CAMERA", camOpts()]] },
      ["ga-height", "CAMERA HEIGHT", [["-1", "LOWER · −1 M"], ["-0.5", "LOWER · −0.5 M"], ["0", "AS SET"], ["0.5", "HIGHER · +0.5 M"], ["1", "HIGHER · +1 M"], ["1.5", "HIGHER · +1.5 M"]]],
      ["ga-move", "CAMERA MOVE", [["still", "STILL"], ["push", "PUSH IN"], ["pull", "PULL OUT"], ["drift", "DRIFT ACROSS"]]],
      ["ga-sway", "HANDHELD", [["0", "OFF · LOCKED OFF"], ["0.5", "LIGHT"], ["1", "NORMAL"], ["2", "HEAVY"]]],
      ["ga-zoom", "FINAL SHOT ZOOM", [["0", "NONE"], ["6", "SLIGHT · 6°"], ["12", "TIGHT · 12°"], ["20", "CLOSE · 20°"]]],
    ];
    const AFTER_ON = [
      "EACH MOMENT: switch one show off and keep the others. PLAY ANIMATIONS off stops all four.",
      ["ga-start", "RACE START · DRIVE-OUT", "check"], ["ga-pit-in", "PIT IN · ARRIVAL", "check"],
      ["ga-pit-out", "PIT OUT · RELEASE", "check"], ["ga-after", "RACE END · BACK TO THE GARAGE", "check"],
    ];
    const AFTER_FOV = [
      "SHOT LENGTHS. SHUTTER SHOT is how long the door takes to open, HOLD BEAT the pause before the car moves (coming in: once it stops in the lane), CAR SPEED how fast it drives or is pushed, END BEAT how long the last shot lingers. PLAYBACK SPEED scales all of it.",
      ["ga-door", "SHUTTER SHOT", [["1", "QUICK · 1 S"], ["1.8", "NORMAL · 1.8 S"], ["2.5", "SLOW · 2.5 S"], ["3.5", "LONG · 3.5 S"]]],
      ["ga-hold", "HOLD BEAT", [["auto", "AUTO"], ["0", "NONE"], ["0.5", "0.5 S"], ["1", "1 S"], ["2", "2 S"], ["3", "3 S"]]],
      ["ga-carspeed", "CAR SPEED", [["0.5", "CRAWL · 0.5×"], ["0.75", "EASY · 0.75×"], ["1", "PIT LIMITER · 1×"], ["1.5", "BRISK · 1.5×"], ["2", "QUICK · 2×"]]],
      ["ga-endbeat", "END BEAT", [["0", "NONE"], ["0.5", "0.5 S"], ["1", "1 S"], ["2", "2 S"], ["3", "3 S"]]],
      ["ga-slowmo", "SLOW-MO AT THE DOOR", [["0", "OFF"], ["0.5", "HALF SPEED"], ["0.25", "QUARTER SPEED"]]],
      "LIGHTING AND LOOK. SEQUENCE LIGHTING holds a garage lighting mood while a sequence plays (the garage's own comes back after); DOOR GLOW is the team-colour flood as the shutter lifts; CINEMA BARS letterbox the shot.",
      ["ga-light", "SEQUENCE LIGHTING", () => [["asset", "AS THE GARAGE"]].concat(moodOpts())],
      ["ga-cue", "LIGHT CUE", () => [["none", "NONE"]].concat(cueOpts())],
      ["ga-swell", "DOOR GLOW", [["0", "OFF"], ["0.5", "SOFT"], ["1", "NORMAL"], ["2", "BIG"]]],
      ["ga-rear", "REAR LIGHT", [["auto", "AUTO · NIGHT OR WET"], ["on", "ON"], ["flash", "FLASHING"], ["off", "OFF"]]],
      ["ga-sound", "ENGINE SOUND ON ARRIVAL", "check"],
      ["ga-captions", "CAPTIONS", "check"],
      ["ga-bars", "CINEMA BARS", "check"],
      "AFTER THE RACE: a winner idles up the lane to a welcome and a longer hold, a podium or points finish gets its own caption and beat, a retired car is pushed in by the crew with the engine off.",
      ["ga-crew-home", "AFTER-RACE CREW", crewOpts(["auto", "BY RESULT"])],
      ["ga-light-home", "AFTER-RACE LIGHTING", () => [["auto", "BY RESULT"], ["asset", "AS THE GARAGE"]].concat(moodOpts())],
      ["ga-cue-home", "AFTER-RACE LIGHT CUE", () => [["auto", "BY RESULT"], ["none", "NONE"]].concat(cueOpts())],
      ["ga-result", "PREVIEW RESULT", [["win", "WIN"], ["podium", "PODIUM"], ["points", "POINTS"], ["finish", "FINISHED"], ["dnf", "RETIRED"]]],
      ["ga-race", "PREVIEW RACE", [["dry", "DRY DAY"], ["wet", "WET · RAIN DAY LIGHT"], ["night", "NIGHT · NEON LIGHT"]]],
    ];

    const doc = typeof document !== "undefined" && document.createElement ? document : null, angle = $("ga-angle"), fov = $("ga-fov");
    // Once: the presets' options are the mark (a second bindSettings builds nothing).
    if (!doc || !angle || !fov || !angle.closest || !fov.closest || Array.from(angle.children || []).some((o) => o.value === "custom")) return;
    for (const id of Object.keys(ANGLE_TEXT)) { const o = doc.createElement("option"); o.value = id; o.textContent = ANGLE_TEXT[id]; angle.appendChild(o); }
    for (const id of RIG_IDS) { const o = doc.createElement("option"); o.value = id; o.textContent = "BLENDER · " + RIG_LABEL[id]; angle.appendChild(o); }
    const make = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
    const node = (r) => {
      if (typeof r === "string") return make("p", "adv-help", r);
      if (!Array.isArray(r)) { const g = make("div"); g.id = r.group; g.hidden = true; r.rows.forEach((x) => g.appendChild(node(x))); return g; }
      const [id, text, options] = r, row = make("div", "set-row"), label = make("label", "tune-label", text), cell = make("div");
      label.setAttribute("for", id);
      const input = make(options === "check" ? "input" : "select"); input.id = id;
      if (options === "check") input.type = "checkbox";
      else for (const [v, t] of typeof options === "function" ? options() : options) { const o = make("option", "", t); o.value = v; input.appendChild(o); }
      cell.appendChild(input);
      row.appendChild(label); row.appendChild(cell);
      return row;
    };
    const after = (anchorRow, rows) => {
      const parent = anchorRow && anchorRow.parentNode;
      if (!parent) return;
      const kids = Array.from(parent.children), next = kids[kids.indexOf(anchorRow) + 1] || null;
      for (const r of rows) parent.insertBefore(node(r), next);
    };
    after(angle.closest(".set-row"), AFTER_ANGLE);
    after(fov.closest(".set-row"), AFTER_FOV);
    // STYLE: the quick-picks head the rows, before PLAY ANIMATIONS; EACH MOMENT follows it.
    const first = $("ga-enabled") && $("ga-enabled").closest ? $("ga-enabled").closest(".set-row") : null;
    after(first, AFTER_ON);
    if (first && first.parentNode) {
      const bar = make("div", "ga-styles");
      bar.id = "ga-styles"; bar.setAttribute("role", "group"); bar.setAttribute("aria-label", "Style");
      bar.appendChild(make("span", "tune-label", "STYLE"));
      for (const id of Object.keys(STYLES)) {
        const b = make("button", "", STYLES[id].label);
        b.type = "button"; b.id = "ga-style-" + id; b.setAttribute("aria-pressed", "false");
        bar.appendChild(b);
      }
      first.parentNode.insertBefore(bar, first);
    }
  }
  return Object.freeze({ build });
})();
