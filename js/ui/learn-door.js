/* Apex 26 — Learn title door and the lesson modal. */
const LearnDoor = (function () {
  "use strict";

  const curriculum = [
    ["aerodynamics", "Car anatomy & aerodynamics", [
      ["aero", "Aero Lab", "Following distance, slipstream & cornering grip"],
      ["chassis", "Chassis X-Ray", "Compare the car footprint, floor and wake"],
      ["suspension", "Suspension & Anti-Dive", "Follow wheel motion through a pushrod or pullrod"],
    ]],
    ["energy", "Power unit & energy", [
      ["deployment", "Straight-Line Deployment", "Trace where electric power tapers on a straight"],
      ["hybrid", "Hybrid Lap Budget", "Balance deployment and harvesting across a lap"],
      ["brake-blend", "Rear Brake Blending", "Trade regeneration for friction and explore torque fill"],
    ]],
    ["driving", "Tyres & driving dynamics", [
      ["tyre-heat", "Tyre Thermal Lab", "Follow surface and core temperatures through a run"],
      ["braking", "Grip & Braking", "Share tyre grip between braking and turning"],
      ["buttons", "Button Trainer", "Tune your touch pedals and steer arrows"],
      ["racing-line", "Racing Lines", "Move the apex and measure the exit-speed trade-off"],
      ["telemetry", "Telemetry Detective", "Compare braking, speed & throttle at the same distance"],
      // Not a framed lab: the drill opens over the real race buttons (js/ui/thumb-trainer.js).
      ["thumbs", "Vegas Thumb Trainer", "Time both thumbs through each Las Vegas corner on your own race buttons"],
      // On track: a Las Vegas Time Trial with the trainer's cues and live scores (js/learn-drills/thumb-drill.js).
      ["thumbs-drive", "Vegas Thumb Drill", "Drive a Las Vegas lap with the trainer's cues, every corner scored live"],
      ["rain", "Wet Weather Lines", "Explore rubber, standing water and tyre choice"],
    ]],
    ["strategy", "Race strategy", [
      ["vsc", "VSC Pit Strategy", "Pit timing, tyre life & track position"],
      ["pit-duel", "Undercut or Overcut", "Make the pit call against a rival"],
      ["stint", "Fuel & Tyre Degradation", "Separate fuel burn from compound wear over a stint"],
    ]],
  ];

  let dialog;
  let frame;
  const lessonDoors = new Map();
  // A drill's last result, posted into its lesson once the reopened lab loads (#6555 A2): {lesson, id, result}.
  let pendingResult = null;

  const MEDAL_LABEL = { gold: "GOLD", silver: "SILVER", bronze: "BRONZE" };
  /** Each drilled lesson's door shows its best medal (apex26.learnMedals.v1, js/learn-drills/drill-card.js). */
  function paintMedals() {
    const store = typeof GameStore !== "undefined" ? GameStore.store : null;
    if (!store || typeof DrillCard === "undefined" || typeof DrillRegistry === "undefined") return;
    for (const [id, button] of lessonDoors) {
      const drillIds = DrillRegistry.forLesson(id).map(d => d.id);
      if (!drillIds.length) continue;
      const medal = DrillCard.bestMedal(store, drillIds);
      let badge = button.querySelector("[data-medal]");
      if (!medal) { if (badge) badge.remove(); continue; }
      if (!badge) { badge = Dom.el("span", ""); button.appendChild(badge); }
      badge.dataset.medal = medal;
      badge.textContent = MEDAL_LABEL[medal];
    }
  }

  function open(door, openDataHub, launchDrill, openTrainer) {
    defineDrills();
    if (!dialog) build();
    paintMedals();
    dialog.hidden = false;
    // A deep link (js/ui/deep-link.js) names the lesson on the door it clicks.
    const lesson = door.dataset.openLesson;
    delete door.dataset.openLesson;
    if (lesson) lessonDoors.get(lesson)?.click();

    function build() {
      dialog = Dom.el("dialog", "screen dim");
      dialog.id = "learn";
      dialog.hidden = true;
      dialog.setAttribute("aria-labelledby", "learn-title");
      dialog.setAttribute("data-esc-close", "learn-close");

      const sheet = Dom.el("div", "sheet");
      const header = Dom.el("div", "sheet-head");
      const heading = Dom.el("h2", "", "LEARN");
      heading.id = "learn-title";
      heading.tabIndex = -1;
      header.appendChild(heading);
      const body = Dom.el("div", "sheet-body pane");
      const index = Dom.el("nav", "");
      index.id = "learn-index";
      index.setAttribute("aria-label", "Lessons");
      let activeLesson;
      let visit = 0;
      let pendingTelemetry;
      for (const [category, name, lessons] of curriculum) {
        const group = Dom.el("section", "");
        group.id = "learn-group-" + category;
        group.appendChild(Dom.el("h3", "", name));
        const doors = Dom.el("div", "pm-doors");
        group.appendChild(doors);
        index.appendChild(group);
        for (const [id, title, description] of lessons) {
          const button = Dom.el("button", "", title.toUpperCase() + "…");
          button.id = "learn-open-" + id;
          button.type = "button";
          button.autofocus = id === "aero";
          button.appendChild(Dom.el("small", "", description));
          button.addEventListener("click", () => {
            if (id === "thumbs" || id === "thumbs-drive") {
              if (!openTrainer) return;
              dialog.hidden = true;
              queueMicrotask(() => openTrainer(() => { open(door, openDataHub, launchDrill, openTrainer); button.focus(); }, id === "thumbs-drive"));
              return;
            }
            activeLesson = button;
            visit++;
            heading.textContent = "LEARN / " + title.toUpperCase();
            index.hidden = true;
            sheet.dataset.lesson = id;
            frame.title = title;
            frame.hidden = false;
            frame.setAttribute("src", "learn/" + id + "/index.html");
            heading.focus();
          });
          doors.appendChild(button);
          lessonDoors.set(id, button);
        }
      }
      frame = document.createElement("iframe");
      frame.id = "learn-lab";
      // Same-origin lab: a controller or paired phone walks its controls (js/input/pad-menu.js).
      frame.dataset.padScope = "lesson";
      frame.hidden = true;
      frame.addEventListener("load", () => {
        const p = pendingResult;
        if (!p || p.lesson !== sheet.dataset.lesson) return;
        pendingResult = null;
        if (Date.now() > p.until) return;
        frame.contentWindow?.postMessage({ type: "apex-learn-result", id: p.id, result: p.result }, location.origin);
      });
      body.append(index, frame);

      const footer = Dom.el("div", "sheet-foot");
      const close = Dom.el("button", "bigbtn alt", "BACK");
      close.id = "learn-close";
      close.type = "button";
      footer.appendChild(close);
      sheet.append(header, body, footer);
      dialog.appendChild(sheet);
      document.body.appendChild(dialog);
      window.TopModal.wire(dialog);

      function leaveLesson() {
        visit++;
        frame.hidden = true;
        frame.removeAttribute("src");
        delete sheet.dataset.lesson;
        index.hidden = false;
        heading.textContent = "LEARN";
      }
      dialog.addEventListener("close", () => {
        if (dialog.hidden && !frame.hidden) leaveLesson();
      });
      close.addEventListener("click", () => {
        if (!frame.hidden) {
          leaveLesson();
          activeLesson.focus();
          return;
        }
        dialog.hidden = true;
        queueMicrotask(() => {
          if (dialog.hidden && UiLayers.top()?.id === "overlay") door.focus();
        });
      });
      window.addEventListener("message", async (event) => {
        if (dialog.hidden || frame.hidden || event.origin !== location.origin || event.source !== frame.contentWindow ||
            UiLayers.top() !== dialog) return;
        if (event.data?.type === "apex-learn-close") close.click();
        if (event.data?.type === "apex-learn-scenario") {
          const drill = typeof DrillRegistry !== "undefined" ? DrillRegistry.get(event.data.id) : null;
          if (!launchDrill || !drill || drill.lesson !== sheet.dataset.lesson) return;
          leaveLesson();
          dialog.hidden = true;
          queueMicrotask(() => {
            if (dialog.hidden && UiLayers.top()?.id === "overlay") launchDrill(drill.id);
          });
          return;
        }
        if (event.data?.type !== "apex-learn-telemetry" || sheet.dataset.lesson !== "telemetry" ||
            pendingTelemetry === visit || !openDataHub) return;

        const lessonVisit = visit;
        const current = () => !dialog.hidden && !frame.hidden && visit === lessonVisit && UiLayers.top() === dialog;
        const reply = type => frame.contentWindow?.postMessage({ type }, location.origin);
        pendingTelemetry = lessonVisit;
        let opened = false;
        try {
          opened = await openDataHub("telemetry", {
            from: dialog,
            isCurrent: current,
            onClose: () => {
              if (!current()) return;
              frame.focus();
              reply("apex-learn-telemetry-return");
            },
          });
        } catch (error) {
          Log.warn("ui", "Learn could not open Telemetry: " + error);
        } finally {
          if (pendingTelemetry === lessonVisit) pendingTelemetry = undefined;
        }
        if (!opened && current()) reply("apex-learn-telemetry-unavailable");
      });
    }
  }

  /** BACK TO LESSON and every other drill end (DrillRegistry end()): the title's LEARN door reopens on the lesson,
   *  and its lab gets the run's result once it loads. Waits for the title, as a deep link does. */
  function reopen(lesson, payload) {
    if (typeof document === "undefined") return false;
    // A result the lab never loaded for (the title never came back) is dropped after 15 s, not posted later.
    pendingResult = payload && payload.id ? { lesson, id: payload.id, result: payload.result, until: Date.now() + 15000 } : null;
    let tries = 0;
    const go = () => {
      const door = document.getElementById("mb-learn");
      if (!door || door.hidden || UiLayers.top()?.id !== "overlay") { if (++tries < 30) setTimeout(go, 100); return; }
      door.dataset.openLesson = lesson;
      door.click();
    };
    setTimeout(go, 0);
    return true;
  }

  // The Aero Lab's Scenario lives in js/learn-drills/aero.js (the registry hosts it). Defined lazily, never at eval:
  // LAZY_LEARN loads with no edges, so the registry may evaluate after this file. AeroDrill ships in the same bundle,
  // before this file, so it is defined wherever DrillRegistry is (one guard: the typeofGuards ratchet).
  function defineDrills() {
    if (typeof DrillRegistry === "undefined") return;
    if (typeof TorqueDrill !== "undefined") TorqueDrill.define();   // js/learn-drills/torque.js, when it evaluated first
    if (typeof GripDrill !== "undefined") GripDrill.define();   // js/learn-drills/grip.js, when it evaluated first
    if (typeof TaperDrill !== "undefined") TaperDrill.define();   // js/learn-drills/taper.js, when it evaluated first
    if (typeof WakeDrill !== "undefined") WakeDrill.define();   // js/learn-drills/wake.js, when it evaluated first
    if (typeof TyreHeatDrill !== "undefined") TyreHeatDrill.define();   // js/learn-drills/tyre-heat.js, when it evaluated first
    DrillRegistry.define(AeroDrill.descriptor());
    if (typeof TelemetryDrill !== "undefined") TelemetryDrill.define();   // js/learn-drills/telemetry.js, likewise
    if (typeof LinesDrill !== "undefined") LinesDrill.define();   // js/learn-drills/lines.js, when it evaluated first
    if (typeof ChargeDrill !== "undefined") ChargeDrill.define();   // js/learn-drills/charge.js, when it evaluated first
  }

  /** Every lesson id in the curriculum, in index order (tests/unit/learn-curriculum.test.mjs's coverage pin). */
  const lessonIds = () => curriculum.flatMap(([, , lessons]) => lessons.map(([id]) => id));

  return { open, defineDrills, reopen, lessonIds };
})();
Object.freeze(LearnDoor);
