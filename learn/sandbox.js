/* Standalone lesson controls and readouts. Each model receives only its declared inputs. */
const LearnSandbox = (() => {
  "use strict";

  function mount(lesson) {
    const root = document.getElementById("lab");
    const state = {};
    const controls = new Map();
    const conditionalRows = [];

    function element(tag, parent, text) {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      parent.appendChild(node);
      return node;
    }
    function panel(parent) {
      const section = element("section", parent);
      section.dataset.as = "box";
      return section;
    }

    const title = element("h1", root, lesson.title);
    title.id = "lessonTitle";
    element("p", root, lesson.intro).className = "intro";
    const studio = element("div", root);
    studio.id = "learn-studio";
    const instrument = panel(studio);
    const diagram = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    diagram.setAttribute("viewBox", "0 0 600 240");
    diagram.setAttribute("role", "img");
    instrument.appendChild(diagram);
    const replayHost = element("div", instrument);
    const readouts = element("dl", instrument);
    const explanation = element("p", instrument);
    const settings = panel(studio);
    for (const control of lesson.controls) {
      state[control.id] = control.value;
      const row = element("div", settings);
      row.className = "control";
      if (control.when) conditionalRows.push({row, when: control.when});
      const label = element("label", row, control.label);
      const input = element(control.options ? "select" : "input", row);
      input.id = "input-" + control.id;
      label.htmlFor = input.id;
      let output;
      if (control.options) {
        for (const [value, name] of control.options) element("option", input, name).value = value;
      } else {
        input.type = "range";
        for (const key of ["min", "max", "step"]) input[key] = control[key] ?? 1;
        output = element("span", label);
      }
      function setValue(value) {
        state[control.id] = value;
        input.value = value;
        if (output) {
          output.textContent = String(value) + (control.unit ? " " + control.unit : "");
          input.setAttribute("aria-valuetext", output.textContent);
        }
      }
      setValue(control.value);
      controls.set(control.id, {control, setValue});
      input.addEventListener("input", () => {
        replay?.stop();
        setValue(control.options ? input.value : input.valueAsNumber);
        render();
        syncReplay(true);
      });
    }
    const reset = element("button", settings, "Reset controls");
    reset.type = "button";
    const task = panel(studio);
    task.className = "challenge";
    element("h2", task, "Engineer challenge");
    element("p", task, lesson.challenge);
    const check = element("button", task, "Check setup");
    check.type = "button";
    const feedback = element("p", task);
    feedback.setAttribute("role", "status");
    const details = element("details", root);
    element("summary", details, "Sources");
    const list = element("ul", details);
    for (const [name, url] of lesson.sources) {
      const link = element("a", element("li", list), name);
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }

    let result;
    let overlay;
    let replayProgress = 0;
    function render(clearFeedback = true) {
      for (const {row, when} of conditionalRows) row.hidden = !when(state);
      result = lesson.evaluate(state);
      // Markup is authored by the lesson using its own enumerated or bounded controls.
      diagram.innerHTML = result.svg;
      if (result.replay) {
        overlay = document.createElementNS(diagram.namespaceURI, "g");
        overlay.setAttribute("aria-hidden", "true");
        diagram.appendChild(overlay);
      } else overlay = null;
      diagram.setAttribute("aria-label", lesson.title + ". " + result.explanation);
      readouts.replaceChildren();
      for (const [name, value] of result.metrics) {
        const group = element("div", readouts);
        element("dt", group, name);
        element("dd", group, value);
      }
      explanation.textContent = result.explanation;
      if (clearFeedback) feedback.textContent = "";
    }
    const replayInput = () => controls.get(lesson.replay?.input?.(state));
    const replay = lesson.replay && LearnReplay.mount(replayHost, {
      label: lesson.replay.label,
      draw(progress) {
        replayProgress = progress;
        const entry = replayInput();
        if (entry) {
          const {id, min, max, step = 1} = entry.control;
          const value = Number((min + Math.round(progress * (max - min) / step) * step).toFixed(6));
          if (value !== state[id]) {
            entry.setValue(value);
            render();
          }
        } else if (overlay) {
          const frame = result.replay(progress);
          overlay.innerHTML = frame.svg;
          return frame.readout;
        }
      },
    });
    function syncReplay(fromInput = false) {
      if (!replay) return;
      const entry = replayInput();
      replay.controls.hidden = !(entry || result.replay);
      replay.manual(!entry);
      if (entry) {
        const {id, min, max} = entry.control;
        replay.seek((state[id] - min) / (max - min));
      } else if (result.replay) replay.seek(fromInput ? replayProgress : lesson.replay.initial ?? 0);
    }
    check.addEventListener("click", () => {
      feedback.textContent = (result.success ? "Challenge complete. " : "Try again. ") + result.feedback;
    });
    reset.addEventListener("click", () => {
      replay?.stop();
      for (const {control, setValue} of controls.values()) setValue(control.value);
      render();
      syncReplay();
    });
    LearnAppearance.mount(reduced => replay?.reduced(reduced));
    render();
    syncReplay();
  }

  function cursor(x, y, top, bottom) {
    return `<path d="M${x} ${top}V${bottom}" stroke="currentColor" stroke-dasharray="3 4" opacity=".62"/>
      <circle cx="${x}" cy="${y}" r="5" fill="var(--red, #e64b43)" stroke="currentColor" stroke-width="1.5"/>`;
  }

  return Object.freeze({mount, cursor});
})();
