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
    instrument.className = "lesson-instrument";
    const diagramView = element("div", instrument);
    diagramView.className = "diagram-view";
    diagramView.id = "lesson-diagram";
    diagramView.setAttribute("role", "region");
    diagramView.setAttribute("aria-label", lesson.title + " diagram");
    const diagram = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    diagram.setAttribute("viewBox", "0 0 600 240");
    diagram.setAttribute("role", "img");
    diagramView.appendChild(diagram);
    const expand = element("button", instrument, "Expand diagram");
    expand.type = "button";
    expand.className = "expand-diagram";
    expand.setAttribute("aria-expanded", "false");
    expand.setAttribute("aria-controls", diagramView.id);
    expand.addEventListener("click", () => {
      const expanded = diagramView.classList.toggle("expanded");
      diagramView.tabIndex = expanded ? 0 : -1;
      if (!expanded) diagramView.scrollLeft = 0;
      expand.setAttribute("aria-expanded", String(expanded));
      expand.textContent = expanded ? "Fit diagram" : "Expand diagram";
    });
    const replayHost = element("div", instrument);
    const primary = element("div", instrument);
    primary.className = "lesson-primary";
    const diagramKey = element("p", instrument);
    diagramKey.className = "diagram-key";
    const readouts = element("dl", instrument);
    const explanation = element("p", instrument);
    const settings = panel(studio);
    const setup = element("details", settings);
    setup.className = "lesson-setup";
    element("summary", setup, "More setup controls");
    const fields = element("div", setup);
    for (const control of lesson.controls) {
      state[control.id] = control.value;
      const row = element("div", fields);
      row.className = "control";
      if (control.when) conditionalRows.push({row, when: control.when});
      const label = element("label", row);
      const labelText = document.createTextNode("");
      label.appendChild(labelText);
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
      controls.set(control.id, {control, row, input, setValue, labelText});
      input.addEventListener("input", () => {
        if (presets) presets.value = "";
        replay?.stop();
        setValue(control.options ? input.value : input.valueAsNumber);
        render();
        syncReplay(true);
      });
    }
    const presets = lesson.presets && element("select", fields);
    let presetLabel;
    if (presets) {
      presets.id = "lesson-preset";
      presetLabel = document.createElement("label");
      presetLabel.htmlFor = presets.id;
      presetLabel.textContent = "Compare setups";
      fields.insertBefore(presetLabel, presets);
      element("option", presets, "Choose an example").value = "";
      lesson.presets.forEach(([name], i) => { element("option", presets, name).value = String(i); });
      presets.addEventListener("change", () => {
        if (presets.value === "") return;
        const [, values] = lesson.presets[Number(presets.value)];
        for (const [id, value] of Object.entries(values)) controls.get(id).setValue(value);
        render();
        syncReplay();
      });
    }
    const reset = element("button", fields, "Reset controls");
    reset.type = "button";
    const compact = matchMedia("(width < 46rem)");
    function placeControls() {
      const focused = document.activeElement;
      for (const {control, row} of controls.values()) {
        (compact.matches && control.primary ? primary : fields).append(row);
      }
      if (presets) fields.append(presetLabel, presets);
      fields.append(reset);
      setup.open = !compact.matches || fields.contains(focused);
      if (settings.contains(focused) || primary.contains(focused)) focused.focus({preventScroll: true});
    }
    compact.addEventListener("change", placeControls);
    placeControls();

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
      for (const {control, labelText} of controls.values()) {
        labelText.nodeValue = typeof control.label === "function" ? control.label(state) : control.label;
      }
      result = lesson.evaluate(state);
      const entry = replayInput();
      if (entry && result.replayEnd !== undefined) {
        entry.input.max = result.replayEnd;
        if (state[entry.control.id] > result.replayEnd) {
          entry.setValue(result.replayEnd);
          result = lesson.evaluate(state);
        }
      }
      // Markup is authored by the lesson using its own enumerated or bounded controls.
      diagram.innerHTML = result.svg;
      if (result.replay) {
        overlay = document.createElementNS(diagram.namespaceURI, "g");
        overlay.setAttribute("aria-hidden", "true");
        diagram.appendChild(overlay);
      } else overlay = null;
      diagram.setAttribute("aria-label", lesson.title + ". " + result.explanation);
      diagramKey.textContent = result.key ?? lesson.key ?? "";
      diagramKey.hidden = !diagramKey.textContent;
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
      label: () => typeof lesson.replay.label === "function" ? lesson.replay.label(state) : lesson.replay.label,
      duration: lesson.replay.duration,
      rewind: lesson.replay.rewind,
      steps: lesson.replay.steps,
      first: lesson.replay.first,
      realTime: lesson.replay.realTime,
      draw(progress) {
        replayProgress = progress;
        const entry = replayInput();
        if (entry) {
          const {id, min, step = 1} = entry.control;
          const max = Number(entry.input.max);
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
      replay.stop();
      const entry = replayInput();
      replay.controls.hidden = !(entry || result.replay);
      replay.manual(!entry);
      if (entry) {
        const {id, min} = entry.control;
        const max = Number(entry.input.max);
        replay.seek((state[id] - min) / (max - min));
      } else if (result.replay) replay.seek(fromInput ? replayProgress : lesson.replay.initial ?? 0);
    }
    check.addEventListener("click", () => {
      feedback.textContent = (result.success ? "Challenge complete. " : "Try again. ") + result.feedback;
    });
    reset.addEventListener("click", () => {
      replay?.stop();
      for (const {control, setValue} of controls.values()) setValue(control.value);
      if (presets) presets.value = "";
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
