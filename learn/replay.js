/* User-started playback for the lesson diagrams. Reduced motion keeps manual scrubbing. */
const LearnReplay = (() => {
  "use strict";

  function mount(parent, {label, draw, duration = 7000, rewind = false,
    describe = value => Math.round(value * 100) + "%"}) {
    const controls = document.createElement("div");
    controls.className = "lesson-replay";
    const button = document.createElement("button");
    button.type = "button";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "1000";
    slider.step = "1";
    const name = () => typeof label === "function" ? label() : label;
    const position = document.createElement("span");
    position.setAttribute("aria-hidden", "true");
    const rate = document.createElement("select");
    rate.setAttribute("aria-label", "Playback speed");
    for (const value of [.5, 1, 2]) {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = value + "×";
      rate.appendChild(option);
    }
    rate.value = "1";
    controls.append(button, slider, position, rate);
    if (rewind) {
      const reset = document.createElement("button");
      reset.type = "button";
      reset.textContent = "Rewind";
      reset.addEventListener("click", () => { stop(); seek(0); });
      controls.appendChild(reset);
    }
    parent.appendChild(controls);

    let value = 0;
    let frame = 0;
    let last = 0;
    let reduced = false;

    function seek(next, paint = true) {
      value = Math.max(0, Math.min(1, next));
      slider.value = String(Math.round(value * 1000));
      position.textContent = (paint ? draw(value) : undefined) ?? describe(value);
      slider.setAttribute("aria-valuetext", position.textContent);
    }

    function stop() {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      button.textContent = "Play " + name();
      slider.setAttribute("aria-label", name() + " progress");
    }

    function tick(now) {
      const delta = last ? now - last : 0;
      last = now;
      const span = typeof duration === "function" ? duration() : duration;
      seek(value + Math.min(delta, 100) * Number(rate.value) / span);
      if (value < 1) frame = requestAnimationFrame(tick);
      else stop();
    }

    button.addEventListener("click", () => {
      if (frame) return stop();
      if (reduced || document.hidden) return;
      if (value === 1) seek(0);
      button.textContent = "Pause " + name();
      frame = requestAnimationFrame(tick);
    });
    slider.addEventListener("input", () => {
      stop();
      seek(Number(slider.value) / 1000);
    });
    document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
    window.addEventListener("pagehide", stop);
    stop();
    return {
      seek, stop, controls,
      manual(visible) { slider.hidden = position.hidden = !visible; },
      reduced(value) {
        reduced = value;
        if (reduced) stop();
        button.hidden = rate.hidden = reduced;
      },
    };
  }

  return Object.freeze({mount});
})();
