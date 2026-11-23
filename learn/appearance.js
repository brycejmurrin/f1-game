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
    const lessonStyle = document.querySelector('link[href="style.css"]');

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

  return Object.freeze({mount});
})();
