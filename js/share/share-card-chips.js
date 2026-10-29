/* Apex 26 — the SHARE CARD chip and its preview sheet: one shape for every result screen. */
"use strict";

const ShareCardChips = (function () {
  const SIZES = Object.freeze([["portrait", "PORTRAIT"], ["landscape", "LANDSCAPE"], ["square", "SQUARE"]]);
  let size = "portrait";   // this session's pick; nothing is stored

  function available() {
    return typeof ShareCardData !== "undefined" && typeof ShareCard !== "undefined";
  }
  // A file-name-safe slug: the card name never carries a save slot or a player name.
  function slug(value) {
    return String(value == null ? "" : value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "card";
  }
  // The image's text alternative: what the card says, in reading order.
  function altText(model) {
    const rows = (model.rows || []).map((r) => [r.pos ? "P" + r.pos : "", r.code, r.name, r.value].filter(Boolean).join(" "));
    const hero = model.hero && model.hero.value ? model.hero.label + " " + model.hero.value : "";
    return [model.title, model.trackName, model.subtitle, hero].concat(rows).filter(Boolean).join(". ") + ". Unofficial fan game card.";
  }

  // `run` resolves to an outcome. DRAWING… while it works, then SHARED /
  // DOWNLOADED / SAVED, the label again on a cancel, UNAVAILABLE on a throw.
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
        btn.textContent = outcome === "shared" ? "SHARED" : outcome === "downloaded" ? "DOWNLOADED"
          : outcome === "saved" ? "SAVED" : label;
      } catch (error) {
        Log.warn("ui", "share card failed: " + (error && error.message));
        btn.textContent = "UNAVAILABLE";
      } finally {
        btn.disabled = false;
      }
    };
    return btn;
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function button(id, cls, text) { const b = el("button", cls, text); b.type = "button"; b.id = id; return b; }

  // THE PREVIEW SHEET. The card is drawn first and shown as an <img alt>; SHARE is
  // then a fresh tap, so share() keeps its transient activation (an async render
  // used to outlive it: NotAllowedError). A size pick redraws. A modal <dialog>
  // with the house .screen/.sheet classes: Escape and focus come from the platform.
  function preview(build, name, text) {
    return new Promise((resolve) => {
      const model = build();
      const returnFocus = document.activeElement;
      const dlg = el("dialog", "screen dim");
      dlg.id = "share-card-preview";
      dlg.setAttribute("aria-labelledby", "scp-title");
      dlg.setAttribute("data-esc-close", "scp-close");
      const sheet = el("div", "sheet");
      sheet.style.setProperty("--sheet-w", "760px");
      const head = el("div", "sheet-head");
      const title = el("h2", null, "SHARE CARD"); title.id = "scp-title";
      head.appendChild(title);
      const body = el("div", "sheet-body pane");
      body.style.cssText = "display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:center;padding:10px";
      const img = el("img"); img.id = "scp-img"; img.alt = altText(model);
      img.style.cssText = "display:block;max-width:min(100%,460px);max-height:calc(var(--vhz,1vh)*52);object-fit:contain;border-radius:6px";
      const side = el("div");
      side.style.cssText = "display:grid;gap:8px;justify-items:start;min-width:0";
      const sizes = el("div"); sizes.setAttribute("role", "group"); sizes.setAttribute("aria-label", "Card size");
      sizes.style.cssText = "display:flex;flex-wrap:wrap;gap:6px";
      const status = el("p", null, "Drawing the card…"); status.id = "scp-status";
      status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
      side.append(el("div", "sel-label", "SIZE"), sizes, status);
      body.append(img, side);
      const foot = el("div", "sheet-foot");
      const shareBtn = button("scp-share", "bigbtn", "SHARE");
      const saveBtn = button("scp-save", "bigbtn alt", "SAVE IMAGE");
      const closeBtn = button("scp-close", "bigbtn alt", "CLOSE");
      if (!ShareCard.canShareFiles()) shareBtn.hidden = true;
      foot.append(shareBtn, saveBtn, closeBtn);
      sheet.append(head, body, foot);
      dlg.appendChild(sheet);

      let blob = null, url = null, outcome = "cancelled", drawing = 0;
      const fileName = () => "apex26-" + slug(typeof name === "function" ? name() : name) + (size === "portrait" ? "" : "-" + size) + ShareCard.extension(blob);
      const busy = (on) => { shareBtn.disabled = saveBtn.disabled = on; };
      async function draw() {
        const mine = ++drawing;
        busy(true); status.textContent = "Drawing the card…";
        for (const b of sizes.children) b.setAttribute("aria-pressed", String(b.dataset.size === size));
        try {
          const next = await ShareCard.render(model, size);
          if (mine !== drawing || !dlg.isConnected) return;
          blob = next;
          if (url) URL.revokeObjectURL(url);
          url = URL.createObjectURL(blob);
          img.src = url;
          status.textContent = "Card ready — " + size + ", " + Math.max(1, Math.round(blob.size / 1024)) + " KB.";
          busy(false);
        } catch (error) {
          if (mine !== drawing) return;
          Log.warn("ui", "share card draw failed: " + (error && error.message));
          status.textContent = error && error.code === "too-large"
            ? "This card is too large to share. Try another size." : "The card could not be drawn on this device.";
        }
      }
      for (const [id, label] of SIZES) {
        const b = button("scp-size-" + id, "sel-chip", label);
        b.dataset.size = id;
        b.onclick = () => { if (size !== id) { size = id; draw(); } };
        sizes.appendChild(b);
      }
      function close() {
        drawing++;
        if (dlg.open && typeof dlg.close === "function") dlg.close();
        dlg.remove();
        if (url) setTimeout(() => URL.revokeObjectURL(url), 30000);
        if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === "function") returnFocus.focus();
        resolve(outcome);
      }
      shareBtn.onclick = async () => {
        if (!blob) return;
        busy(true);
        try {
          const result = await ShareCard.deliver(blob, fileName(),
            { title: "APEX 26", text: typeof text === "function" ? text() : text || model.title, url: model.link, retry: true });
          if (result === "blocked") { status.textContent = "Tap SHARE again to open the share sheet."; return; }
          if (result === "cancelled") { status.textContent = "Share cancelled."; return; }
          outcome = result; close();
        } catch (error) {
          Log.warn("ui", "share card share failed: " + (error && error.message));
          status.textContent = "Sharing failed — use SAVE IMAGE instead.";
        } finally { busy(false); }
      };
      saveBtn.onclick = async () => {
        if (!blob) return;
        await ShareCard.download(blob, fileName());
        outcome = "saved";
        status.textContent = "Saved " + fileName() + ".";
      };
      closeBtn.onclick = close;
      dlg.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
      document.body.appendChild(dlg);
      if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
      closeBtn.focus();
      draw();
    });
  }

  function append(parent, id, build, name, text) {
    if (!parent || !available()) return null;
    const btn = chip(id, () => preview(build, name, text));
    parent.appendChild(btn);
    return btn;
  }

  return Object.freeze({ available, slug, chip, preview, append });
})();
Object.freeze(ShareCardChips);
