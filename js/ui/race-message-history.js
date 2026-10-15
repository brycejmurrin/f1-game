/* Delivered cards only: showAnnounce calls delivered after painting its card.
   Pending, suppressed and stale queue entries never enter this transcript. */
const RaceMessageHistory = (function () {
  "use strict";
  const MAX = 20;
  function create(G) {
    const rows = [];
    let list = null, empty = null, fold = null;
    const clean = (value, max) => String(value == null ? "" : value).slice(0, max);
    function render() {
      if (!list) return;
      list.replaceChildren();
      empty.hidden = rows.length > 0;
      for (const row of rows) {
        const li = document.createElement("li"), meta = document.createElement("small"), text = document.createElement("span");
        const seconds = Math.max(0, row.time), minutes = Math.floor(seconds / 60);
        meta.textContent = "LAP " + row.lap + " · " + minutes + ":" + String(Math.floor(seconds % 60)).padStart(2, "0") + " · " + row.kind.toUpperCase() + (row.who ? " · " + row.who : "");
        text.textContent = row.text;
        li.append(meta, text); list.appendChild(li);
      }
    }
    function delivered(text, options) {
      const o = options || {};
      // Menu notifications (clipboard, save status, etc.) are not race events.
      if (G.state !== "race" && G.state !== "count" && G.state !== "quali") return false;
      const message = clean(text, 1000).trim();
      if (!message) return false;
      const who = clean(o.who, 80), kind = clean(o.kind || "race", 40);
      if (o.quiet === true) {
        // Quiet is showAnnounce's existing-card refresh, not another delivered
        // event. Keep the original timestamp while updating its visible text.
        const last = rows[rows.length - 1];
        if (!last || last.kind !== kind || last.who !== who) return false;
        rows[rows.length - 1] = Object.freeze(Object.assign({}, last, { text: message }));
      } else rows.push(Object.freeze({ text: message, who, kind,
        lap: Math.max(1, Math.floor(Number(G.player && G.player.lap) || 1)),
        time: Number.isFinite(G.raceT) ? Math.max(0, G.raceT) : 0 }));
      if (rows.length > MAX) rows.shift();
      if (fold && fold.open) render();
      return true;
    }
    function mount() {
      const host = document.querySelector("#pausemenu .sheet-body");
      if (!host || fold) return;
      fold = document.createElement("details"); fold.id = "pm-message-history";
      const summary = document.createElement("summary"); summary.className = "adv-more-btn"; summary.textContent = "RECENT RACE MESSAGES";
      empty = document.createElement("p"); empty.className = "adv-help"; empty.textContent = "No race messages delivered this session.";
      const help = document.createElement("p"); help.className = "adv-help"; help.textContent = "Last twenty displayed cards, oldest first. Reading here does not replay speech.";
      list = document.createElement("ol"); list.className = "race-message-list"; list.setAttribute("aria-label", "Delivered race messages");
      fold.append(summary, help, empty, list); fold.addEventListener("toggle", () => { if (fold.open) render(); });
      const quit = document.getElementById("pm-quit"); host.insertBefore(fold, quit && quit.parentElement === host ? quit : null); render();
    }
    function clear() { rows.length = 0; if (fold) fold.open = false; render(); }
    mount();
    return Object.freeze({ delivered, clear, mount, rows: () => rows.slice(), render });
  }
  return Object.freeze({ MAX, create });
})();
Object.freeze(RaceMessageHistory);
