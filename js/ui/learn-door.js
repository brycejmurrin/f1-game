/* Apex 26 — Learn title door and the Aero Lab's modal frame. */
const LearnDoor = (function () {
  "use strict";

  function create(G) {
    const menu = G.$("menu-buttons");
    if (!menu) return;

    const door = document.createElement("button");
    door.className = "bigbtn alt minibtn";
    door.textContent = "LEARN";
    door.id = "mb-learn";
    door.type = "button";
    door.setAttribute("aria-haspopup", "dialog");
    menu.appendChild(door);

    let dialog;
    let frame;
    door.addEventListener("click", () => {
      if (G.state !== "menu" || UiLayers.top()?.id !== "overlay") return;
      if (!dialog) build();
      if (G.soundOn) GameAudio.uiSelect();
      frame.setAttribute("src", "learn/aero/index.html");
      dialog.hidden = false;
    });

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
      const close = document.createElement("button");
      close.className = "dh-close";
      close.textContent = "✕";
      close.id = "learn-close";
      close.type = "button";
      close.autofocus = true;
      close.setAttribute("aria-label", "Close Learn");
      frame = document.createElement("iframe");
      frame.id = "learn-lab";
      frame.title = "Aero Lab";

      header.append(heading, close);
      sheet.append(header, frame);
      dialog.appendChild(sheet);
      document.body.appendChild(dialog);
      window.TopModal.wire(dialog);

      close.addEventListener("click", () => {
        dialog.hidden = true;
        frame.removeAttribute("src");
        queueMicrotask(() => {
          if (dialog.hidden && UiLayers.top()?.id === "overlay") door.focus();
        });
      });
      window.addEventListener("message", (event) => {
        if (dialog.hidden || event.origin !== location.origin || event.source !== frame.contentWindow) return;
        if (event.data?.type === "apex-learn-close") close.click();
      });
    }
  }

  return { create };
})();
Object.freeze(LearnDoor);
