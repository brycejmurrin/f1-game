/* Standalone lesson controls and readouts. Each model receives only its declared inputs. */
const LearnSandbox = (() => {
  "use strict";

  function mount(lesson) {
    const root = document.getElementById("lab");
    const state = {};
    const controls = [];
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
      controls.push(() => setValue(control.value));
      input.addEventListener("input", () => {
        setValue(control.options ? input.value : input.valueAsNumber);
        render();
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
    function render() {
      for (const {row, when} of conditionalRows) row.hidden = !when(state);
      result = lesson.evaluate(state);
      // Markup is authored by the lesson using its own enumerated or bounded controls.
      diagram.innerHTML = result.svg;
      diagram.setAttribute("aria-label", lesson.title + ". " + result.explanation);
      readouts.replaceChildren();
      for (const [name, value] of result.metrics) {
        const group = element("div", readouts);
        element("dt", group, name);
        element("dd", group, value);
      }
      explanation.textContent = result.explanation;
      feedback.textContent = "";
    }
    check.addEventListener("click", () => {
      feedback.textContent = (result.success ? "Challenge complete. " : "Try again. ") + result.feedback;
    });
    reset.addEventListener("click", () => {
      for (const restore of controls) restore();
      render();
    });
    LearnAppearance.mount();
    render();
  }

  return Object.freeze({mount});
})();
