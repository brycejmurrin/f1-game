/* Apex 26 — Learn title door and the lesson modal. */
const LearnDoor = (function () {
  "use strict";

  const curriculum = [
    ["Car anatomy & aerodynamics", [
      ["aero", "Aero Lab", "Following distance, slipstream & cornering grip"],
      ["chassis", "Chassis X-Ray", "Compare the car footprint, floor and wake"],
      ["suspension", "Suspension & Anti-Dive", "Follow wheel motion through a pushrod or pullrod"],
    ]],
    ["Power unit & energy", [
      ["deployment", "Straight-Line Deployment", "Trace where electric power tapers on a straight"],
      ["hybrid", "Hybrid Lap Budget", "Balance deployment and harvesting across a lap"],
      ["brake-blend", "Rear Brake Blending", "Trade regeneration for friction and explore torque fill"],
    ]],
    ["Tyres & driving dynamics", [
      ["tyre-heat", "Tyre Thermal Lab", "Follow surface and core temperatures through a run"],
      ["braking", "Grip & Braking", "Share tyre grip between braking and turning"],
      ["racing-line", "Racing Lines", "Move the apex and measure the exit-speed trade-off"],
      ["telemetry", "Telemetry Detective", "Compare braking, speed & throttle at the same distance"],
      ["rain", "Wet Weather Lines", "Explore rubber, standing water and tyre choice"],
    ]],
    ["Race strategy", [
      ["vsc", "VSC Pit Strategy", "Pit timing, tyre life & track position"],
      ["pit-duel", "Undercut or Overcut", "Make the pit call against a rival"],
      ["stint", "Fuel & Tyre Degradation", "Separate fuel burn from compound wear over a stint"],
    ]],
  ];

  let dialog;
  let frame;

  function open(door, openDataHub) {
    if (!dialog) build();
    dialog.hidden = false;

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
      index.setAttribute("aria-label", "Lessons");
      let activeLesson;
      let visit = 0;
      let pendingTelemetry;
      for (const [name, lessons] of curriculum) {
        const group = Dom.el("section", "");
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
        }
      }
      frame = document.createElement("iframe");
      frame.id = "learn-lab";
      frame.hidden = true;
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

  return { open };
})();
Object.freeze(LearnDoor);
