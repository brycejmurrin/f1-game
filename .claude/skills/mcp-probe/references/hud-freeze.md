# HUD / DOM freeze repro (pit stop, lap change, any HUD that stops updating)

Setup per [`chrome.md`](chrome.md) (serve `:3456`, `chrome-start`, navigate, `race(id); go()`).
The HUD is DOM: no screenshot needed. Done = a value, not a picture.

1. Call a stop: `__apex.pit({arm: true})` (no pit control exists; `docs/DEBUG-HOOKS.md` § `pit`).
   Tyre wear must be on: `__apex.tyres({level: "real"})` before `race()`.
2. In ONE `evaluate_script`, sample a HUD element across frames and the pit state:
   ```js
   async () => { const s = [], w = ms => new Promise(r => setTimeout(r, ms));
     for (let i = 0; i < 20; i++) { s.push([document.getElementById("hud-time").textContent,
       __apex.pit()?.state]); await w(250); } return s; }
   ```
   Ids: `hud-pos`, `hud-lap`, `hud-time` in `index.html`. Text frozen while `state` moves
   (`approach`/`lane`/`box`/`out`) = DOM-side stall; text moving = the report is render-side.
3. Render-side check only if needed: `await __apex.awaitPresent()` then `take_screenshot`.
4. `list_console_messages` (`types:["error","warn"]`) for a thrown update loop.
5. `navigate_page about:blank`, then `chrome-stop`.
