/* Apex 26 — Learn title door, lesson index and shared modal frame. */
const LearnDoor = (function () {
  "use strict";

  const LESSONS = [
    {id: "aero", title: "Aero Lab", summary: "Following distance, slipstream & cornering grip"},
    {id: "braking", title: "Grip & Braking", summary: "Share tyre grip between braking and turning"},
  ];

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
      heading.tabIndex = -1;
      header.appendChild(heading);
      const body = Dom.el("div", "sheet-body pane");
      const index = Dom.el("nav", "pm-doors");
      index.setAttribute("aria-label", "Lessons");
      let activeButton;
      for (const lesson of LESSONS) {
        const button = Dom.el("button", "", lesson.title.toUpperCase() + "…");
        button.id = "learn-open-" + lesson.id;
        button.type = "button";
        button.autofocus = !index.firstElementChild;
        button.appendChild(Dom.el("small", "", lesson.summary));
        button.addEventListener("click", () => {
          activeButton = button;
          heading.textContent = "LEARN / " + lesson.title.toUpperCase();
          index.hidden = true;
          sheet.dataset.lesson = lesson.id;
          frame.title = lesson.title;
          frame.hidden = false;
          frame.setAttribute("src", "learn/" + lesson.id + "/index.html");
          heading.focus();
        });
        index.appendChild(button);
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

      close.addEventListener("click", () => {
        if (!frame.hidden) {
          frame.hidden = true;
          frame.removeAttribute("src");
          delete sheet.dataset.lesson;
          index.hidden = false;
          heading.textContent = "LEARN";
          activeButton?.focus();
          return;
        }
        dialog.hidden = true;
        queueMicrotask(() => {
          if (dialog.hidden && UiLayers.top()?.id === "overlay") door.focus();
        });
      });
      window.addEventListener("message", (event) => {
        if (dialog.hidden || frame.hidden || event.origin !== location.origin || event.source !== frame.contentWindow) return;
        if (event.data?.type === "apex-learn-close") close.click();
      });
    }
  }

  return { create };
})();
Object.freeze(LearnDoor);
