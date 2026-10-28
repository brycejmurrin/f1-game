/* Apex 26 — the SHARE CARD chip: one button shape for every result screen. */
"use strict";

const ShareCardChips = (function () {
  function available() {
    return typeof ShareCardData !== "undefined" && typeof ShareCard !== "undefined";
  }
  // A file-name-safe slug: the card name never carries a save slot or a player name.
  function slug(value) {
    return String(value == null ? "" : value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "card";
  }

  // `run` resolves to ShareCard.deliver's outcome. DRAWING… while it renders,
  // then SHARED / DOWNLOADED, the label again on a cancel, UNAVAILABLE on a throw.
  function chip(id, run) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sel-chip";
    btn.id = id;
    btn.textContent = "SHARE CARD";
    btn.onclick = async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = "DRAWING…";
      try {
        const outcome = await run();
        btn.textContent = outcome === "shared" ? "SHARED" : outcome === "downloaded" ? "DOWNLOADED" : label;
      } catch (error) {
        Log.warn("ui", "share card failed: " + (error && error.message));
        btn.textContent = "UNAVAILABLE";
      } finally {
        btn.disabled = false;
      }
    };
    return btn;
  }

  // Build the model at TAP time (the screen may have been rebuilt), render the
  // portrait card and hand it to the share sheet / download.
  async function share(build, name, text) {
    const model = build();
    const blob = await ShareCard.render(model, "portrait");
    return ShareCard.deliver(blob, "apex26-" + slug(name) + ".png", { title: "APEX 26", text: text || model.title, url: model.link });
  }
  function append(parent, id, build, name, text) {
    if (!parent || !available()) return null;
    const btn = chip(id, () => share(build, name, text));
    parent.appendChild(btn);
    return btn;
  }

  return Object.freeze({ available, slug, chip, share, append });
})();
Object.freeze(ShareCardChips);
