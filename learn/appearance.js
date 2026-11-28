/* Share the game palette and Appearance Studio layout with standalone lessons. */
const LearnAppearance = (function () {
  "use strict";

  const tokens = ["--red", "--bg", "--text", "--dim", "--surf-1", "--surf-3",
    "--plate", "--plate-hover", "--card-line", "--plate-line", "--edge", "--focus",
    "--r-lg", "--r-sm", "--r-md", "--pad", "--gap", "--tap", "--fs-2", "--fs-3",
    "--fs-5", "--font-ui", "--font-hud"];

  function mount(onChange) {
    const host = window.frameElement;
    const hostRoot = host?.ownerDocument.documentElement;
    const root = document.documentElement;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const scheme = matchMedia("(prefers-color-scheme: light)");
    const lessonStyle = document.querySelector('link[rel="stylesheet"]');

    function sync() {
      if (hostRoot) {
        const style = getComputedStyle(host);
        for (const token of tokens) root.style.setProperty(token, style.getPropertyValue(token));
        root.style.colorScheme = style.colorScheme;
      } else {
        root.dataset.uiTheme = "system";
      }
      onChange?.(hostRoot ? hostRoot.dataset.motion === "reduce" : motion.matches);
    }

    if (host) document.getElementById("lessonTitle").hidden = true;
    // Preserve the host's versioned asset URLs for offline lessons.
    for (const name of ["tokens", "fonts-hud", "appearance-studio"]) {
      const sheet = document.createElement("link");
      sheet.rel = "stylesheet";
      const parentSheet = host?.ownerDocument.querySelector(
        'link[rel="stylesheet"][href*="css/' + name + '.css"]');
      sheet.href = parentSheet?.href || "../../css/" + name + ".css";
      sheet.addEventListener("load", sync);
      document.head.insertBefore(sheet, lessonStyle);
    }

    motion.addEventListener("change", sync);
    scheme.addEventListener("change", sync);
    if (hostRoot) {
      const observer = new MutationObserver(sync);
      observer.observe(hostRoot, {
        attributeFilter: ["style", "class", "data-ui-theme", "data-menu-accent", "data-team",
          "data-ui-contrast", "data-text-size", "data-cvd", "data-motion", "data-look-popups-corners"],
      });
      window.addEventListener("pagehide", () => observer.disconnect(), {once: true});
    }
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && host) {
        window.parent.postMessage({type: "apex-learn-close"}, window.location.origin);
      }
    });
    sync();
  }

  /** TRY IT IN THE CAR: a drill's launch button and its last-run line, only inside the game's LEARN frame. The
   *  game launches the drill (js/ui/learn-door.js, apex-learn-scenario) and posts its result back on BACK TO
   *  LESSON (apex-learn-result). tests/unit/learn-drill-reach.test.mjs pins every registered drill to one. */
  function drill(id, label, parent) {
    if (window.frameElement?.id !== "learn-lab") return null;
    const launch = document.createElement("button");
    launch.type = "button";
    launch.id = "launch-" + id + "-drill";
    launch.className = "drill-launch";
    launch.textContent = "Try it in the car: " + label;
    launch.addEventListener("click", () => window.parent.postMessage({type: "apex-learn-scenario", id}, window.location.origin));
    const result = document.createElement("p");
    result.id = id + "-drill-result";
    result.setAttribute("role", "status");
    result.hidden = true;
    (parent || document.getElementById("lab") || document.querySelector("main") || document.body).append(launch, result);
    window.addEventListener("message", event => {
      const data = event.data;
      if (event.origin !== window.location.origin || event.source !== window.parent || data?.type !== "apex-learn-result" ||
          data.id !== id || !data.result) return;
      const r = data.result, k = r.display?.k ?? 1, unit = r.display?.unit ?? r.unit ?? "";
      const num = v => (Number(v) * k).toFixed(Number.isInteger(Number(v)) ? 0 : 1) + (unit ? " " + unit : "");
      result.textContent = "Your last drill: " + (r.medal ? r.medal.toUpperCase() : "No medal") + " · " + num(r.value)
        + (Number.isFinite(r.best) ? " (best " + num(r.best) + ")" : "") + ". " + (r.verdict || "");
      result.hidden = false;
    });
    return launch;
  }

  return Object.freeze({mount, drill});
})();
