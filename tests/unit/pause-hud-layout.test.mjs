import { readCssSource } from "../helpers/css-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function openBanner({ profile = "standard", camId = "chase", now = () => 0 } = {}) {
  const shown = [];
  const announceText = {};
  Object.defineProperty(announceText, "textContent", {
    set(v) { shown.push(v); }, get() { return shown.at(-1) || ""; },
  });
  const els = {
    announceText, announceWho: { textContent: "" }, announceNum: { textContent: "" },
    announce: { className: "", hidden: true, dataset: {} }, announceLive: { textContent: "" },
  };
  let hudProfile = profile;
  const ctx = vm.createContext({
    performance: { now },
    RadioVoice: { SPEAKERS: { info: "radio", warning: "control", coach: "coach", comm: "announcer", box: "radio", race: "radio", "penalty-warn": "control", "penalty-hit": "control", practice: "coach" } },
    GameAudio: { radioLeadS: () => 0, radioSting() {} },
  });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/race/announce-banner.js"), "utf8"), ctx, { filename: absSrc("js/race/announce-banner.js") });
  const banner = vm.runInContext("AnnounceBanner", ctx).create({
    els: () => els, player: () => ({ name: "A Driver", num: 1 }), state: () => "race",
    hudProfile: () => hudProfile, camMode: () => 0, camModes: () => [{ id: camId }],
    radioVoice: () => ({ say() {} }), history: () => null,
  });
  return { banner, shown, setProfile(p) { hudProfile = p; } };
}

test("driving warnings survive camera changes while quiet views suppress optional tips", () => {
  for (const id of ["chase", "cockpit", "heli", "side", "cinematic", "low", "overhead"]) {
    const { banner, shown } = openBanner({ camId: id });
    for (const kind of ["warning", "penalty-warn", "penalty-hit", "race"]) {
      assert.equal(banner.announce("driver message", 2, kind), true, `${id} preserves ${kind}`);
      assert.equal(shown.at(-1), "driver message");
      banner.tick(10);
    }
    const before = shown.length;
    assert.equal(banner.announce("optional tip", 2, "coach"), ["chase", "cockpit"].includes(id), id);
    assert.equal(shown.length, before + (["chase", "cockpit"].includes(id) ? 1 : 0));
    const cast = openBanner({ camId: id, profile: "broadcast" });
    assert.equal(cast.banner.announce("optional tip", 2, "coach"), true, "broadcast keeps its optional tips");
    assert.equal(cast.shown.at(-1), "optional tip");
  }
});

test("any open screen hides race HUD chrome, DISPLAY keeps the live tower", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/hud.css"), "utf8");
  // Career / select / garage / datahub are `.screen` without `.dim`; gating
  // on dim + in-race left POS/LAP/CHASE reading through those scrims.
  assert.match(css, /body:has\(> \.screen:not\(\[hidden\]\)\)\s*:is\(/);
  assert.doesNotMatch(css, /body\.in-race:has\(>? ?\.screen\.dim:not\(\[hidden\]\)\)\s*:is\(/);
  assert.match(css, /\.hud-bottom/);
  assert.match(css, /\.hud-top/);
  assert.match(css, /#btn-cam/);
  assert.match(css, /\.dock/);
  assert.match(css, /body:has\(> #pmsettings:not\(\[hidden\]\) > :where\(#pmsettings-inner\) > :where\(#pm-settings-body\) > :where\(\.pm-groups\) > #pm-panel-display:not\(\[hidden\]\)\)\s*:is\(/);
  assert.doesNotMatch(css, /body:has\(>? ?#pmsettings:not\(\[hidden\]\)\)\s*:is\(/);
});

test("garage camera stack hides under a dim overlay, not under garage itself", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/carsetup.css"), "utf8");
  assert.match(css, /body:has\(> \.screen\.dim:not\(\[hidden\]\)\)\s*#cs-stack/);
  assert.match(css, /visibility:\s*hidden/);
});

test("compact pause stack tightens without changing type tokens", () => {
  const css = readCssSource("css/components.css");
  // max(36px, --tap-min), not a bare 36px: the 36 floor is the compact tighten
  // this test guards; the --tap-min arm only wins below 100% UI SIZE, where a
  // flat 36 local px painted RESUME at 14-18px (2026-08-21 sweep, pause @40).
  assert.match(css, /#pausemenu\s+\.sheet\[data-density="compact"\]\s+\.stack\s+button[^}]*min-height:\s*max\(36px,\s*var\(--tap-min\)\)/);
});

test("short phone pause (≤400px) caps the sheet and uses a 2-col tray with no holes", () => {
  const dialogs = readCssSource("css/dialogs.css");
  assert.match(dialogs, /@media\s*\(max-height:\s*400px\)[\s\S]*?#pausemenu\s*>\s*\.sheet\s*\{[^}]*max-height:\s*min\(100%,\s*calc\(100\s*\*\s*var\(--svhz\)/);
  assert.match(dialogs, /@media\s*\(max-height:\s*400px\)\s*\{[\s\S]*?#pausemenu\s+\.sheet-body\.stack\s*>\s*button:not\(\.as-tbtn\)\s*\{[^}]*min-height:\s*var\(--tap\)/);
  const overlays = fs.readFileSync(path.join(ROOT, "css/overlays.css"), "utf8");
  // two tiles to a row; no holes because the tray is a wrapping flex row whose tiles grow
  assert.match(overlays, /@media\s*\(max-height:\s*400px\)\s*\{[\s\S]*?#pausemenu\s+#pm-quick-doors\s*\{[^}]*--tray-cols:\s*2/);
  const exp = fs.readFileSync(path.join(ROOT, "css/experience.css"), "utf8");
  assert.match(exp, /#pm-quick-doors\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap/);
  assert.match(exp, /#pm-quick-doors\s*>\s*\*\s*\{[^}]*flex:\s*1\s+1\s+calc\(/, "every tile grows, so a short last row fills the tray");
  assert.match(exp, /#pm-quick-doors\s*>\s*details\[open\]\s*\{[^}]*flex-basis:\s*100%/, "an open disclosure tile takes the tray's full width");
});

test("the phone pause card (#5153 gap 10) is keyed on the body's own density + shape, for every layout", () => {
  const overlays = fs.readFileSync(path.join(ROOT, "css/overlays.css"), "utf8");
  const dialogs = readCssSource("css/dialogs.css");
  // Two keys, one specificity: the body's own-px tier, or the window itself being short (#5200).
  const PHONE = String.raw`body:is\(\[data-density="compact"\]\[data-shape="wide"\], \[data-pause-short\]\)`;
  // No layout gate: measured 2026-11-06 (docs/notes/UI-PR-D-MEASURE-2026-11-06.md), each
  // stored layout swapped in the 420 card and put QUIT 221-420 own px past the sheet.
  assert.doesNotMatch(overlays, /:root:not\(\[data-pause-layout\]\)/, "the phone card has no :root:not([data-pause-layout]) gate");
  assert.match(overlays, new RegExp(PHONE + String.raw` #pausemenu \.sheet-body \{[^}]*grid-template-areas: "ctx restart settings" "resume tools tools" "quit tools tools"`));
  assert.match(overlays, new RegExp(PHONE + String.raw` #pausemenu \.sheet-body \{[^}]*grid-template-rows: auto minmax\(0, 1fr\) auto`));
  // 5-up tray: ten tiles are two rows in the ~137 own px tools track of Safari 852x283 at 109 %.
  assert.match(overlays, new RegExp(PHONE + String.raw` #pausemenu #pm-quick-doors \{[^}]*--tray-cols: 5`));
  // The tile label steps down one notch (CI on ec39facd / 354334ed: MESSAGES 74 px in a 71 px text box in the
  // 852-wide windows with 59 px insets). A flat step: a container unit fit locally but not on CI's Chromium.
  assert.match(overlays, new RegExp(PHONE + String.raw` #pausemenu #pm-quick-doors > details \{ font-size: calc\(var\(--fs-micro\) \* 0\.92\); \}`));
  assert.doesNotMatch(overlays, /#pm-quick-doors[^{]*\{[^}]*container-type/, "no container unit decides the tray's type");
  // The race line never grows the doors' row.
  assert.match(overlays, new RegExp(PHONE + String.raw` #pm-race-context \{[^}]*max-height: var\(--pm-door\)`));
  // Layouts rearrange doors inside the card: WIDE puts the doors along the bottom, SIDE RIGHT mirrors.
  assert.match(overlays, new RegExp(String.raw`:root\[data-pause-layout="wide"\]:has\(> ` + PHONE + String.raw`\) #pausemenu \.sheet-body \{[^}]*"resume restart settings quit"`));
  assert.match(overlays, new RegExp(String.raw`:root\[data-pause-side="right"\]:has\(> ` + PHONE + String.raw`\) #pausemenu \.sheet-body \{[^}]*"tools tools resume"`));
  // SIDEBAR's full-height strip is geometry: the phone card keeps its own height.
  assert.match(overlays, new RegExp(PHONE + String.raw` #pausemenu > \.sheet \{ height: auto; \}`));
  assert.doesNotMatch(overlays + dialogs, /body\[data-density="compact"\]\[data-shape="wide"\] (#pausemenu|#pm-|:is\(#pm-)/, "no pause rule is left on the own-px key alone");
});

// #5200 (Bryce, iPhone Home Screen app, build 25617: "on pause menu there's no resume"). At UI SIZE 51 % a landscape
// phone is a NORMAL-density body in own px, so it got the 420 card, whose RESUME was a position: absolute "thumb
// reach" bar; the scrolling body's edge-fade mask clipped it the moment the list overflowed. Measured before the
// fix at 852x393: sheet 214 px wide, body scrolls 209 own px, elementFromPoint at RESUME's centre is the sheet.
test("RESUME is the first door in the markup of every mode and is never taken out of flow (#5200)", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const dlg = html.slice(html.indexOf('<dialog id="pausemenu"'), html.indexOf("</dialog>", html.indexOf('<dialog id="pausemenu"')));
  assert.match(dlg, /^<dialog id="pausemenu"[^>]*data-esc-close="pm-resume"/, "Escape and the pad's B resolve to RESUME");
  const buttons = [...dlg.matchAll(/<button\b([^>]*)>/g)].map((m) => m[1]);
  assert.match(buttons[0], /id="pm-resume"/, "RESUME is the first button of the pause dialog");
  assert.match(buttons[0], /\bautofocus\b/, "RESUME takes the default focus");
  assert.doesNotMatch(buttons[0], /\b(hidden|disabled)\b/, "RESUME ships visible and enabled");
  assert.equal(buttons.filter((b) => /\bautofocus\b/.test(b)).length, 1, "nothing else on the card asks for focus");
  // No mode rule can remove it: race, time trial, practice, career and VS FRIEND all share setPaused, and no
  // script writes RESUME's hidden / disabled / display. (RESTART is the door a networked race disables.)
  const jsDir = path.join(ROOT, "js");
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === "vendor" ? [] : walk(path.join(d, e.name))) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []);
  const refs = [];
  for (const f of walk(jsDir)) {
    const src = fs.readFileSync(f, "utf8");
    if (/pm-resume|pmResume/.test(src)) refs.push(path.relative(ROOT, f));
    assert.doesNotMatch(src, /pm-resume"\)\.(hidden|disabled|style|remove|setAttribute)|pmResume\.(hidden|disabled|style|remove)/, path.relative(ROOT, f) + " never hides or disables RESUME");
  }
  // A new reader of RESUME is a new way to lose it: name it here after reading what it does with the button.
  assert.deepEqual(refs.sort(), ["js/camera/replay-buf.js", "js/game.js", "js/perf/bench-run.js"]);
  assert.match(fs.readFileSync(path.join(jsDir, "camera/replay-buf.js"), "utf8"), /const resume = document\.getElementById\("pm-resume"\);\s*if \(!resume \|\| !resume\.parentNode\) return;/, "replay-buf only uses RESUME as the anchor for its own tile");
  // No stylesheet positions, hides or collapses it: out of flow under a scroller's mask is how it vanished.
  for (const f of fs.readdirSync(path.join(ROOT, "css")).filter((n) => n.endsWith(".css"))) {
    const css = fs.readFileSync(path.join(ROOT, "css", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of css.matchAll(/([^{}]*#pm-resume[^{}]*)\{([^}]*)\}/g)) {
      assert.doesNotMatch(m[2], /position:\s*(absolute|fixed|sticky)|display:\s*none|visibility:\s*hidden|opacity:\s*0(?![.\d])/, f + ": " + m[1].trim() + " keeps RESUME in flow and painted");
    }
  }
  const dialogs = readCssSource("css/dialogs.css");
  assert.doesNotMatch(dialogs, /--pm-resume-h/, "the thumb-reach bar and its reserved sheet padding are gone");
  assert.match(dialogs, /#pausemenu #pm-resume \{\s*min-height: max\(var\(--tap\), var\(--tap-paint\), calc\(44px \/ var\(--ui-scale\)\)\);/, "RESUME paints at least 44 px at every UI SIZE");
});

test("a short landscape window gets the phone pause card at every UI SIZE (#5200)", () => {
  const overlays = fs.readFileSync(path.join(ROOT, "css/overlays.css"), "utf8");
  const opts = fs.readFileSync(path.join(ROOT, "js/ui/pause-opts.js"), "utf8");
  // The stamp reads the media query (the layout viewport), never innerHeight or --ui-scale.
  assert.match(opts, /matchMedia\("\(orientation: landscape\) and \(max-height: 500px\)"\)/);
  assert.match(opts, /document\.body\.toggleAttribute\("data-pause-short", !!mq\.matches\)/);
  assert.match(opts, /mq\.addEventListener\("change", stamp\)/, "a rotate or a toolbar re-asks");
  // The card uses the width at a small UI SIZE: 760 own px is 388 painted at 51 %.
  assert.match(overlays, /--sheet-w: min\(calc\(max\(760px, 620px \/ var\(--ui-scale\)\) \* var\(--look-pause-w, 1\)\), 100%\);/);
  // The stamp flips with the query, in a VM.
  const listeners = [];
  const attrs = new Set();
  const mq = { matches: true, addEventListener: (t, fn) => listeners.push(fn) };
  const body = { toggleAttribute: (n, on) => { if (on) attrs.add(n); else attrs.delete(n); } };
  const src = opts.slice(opts.indexOf("const mq = typeof matchMedia"), opts.indexOf('pm.addEventListener("click", onPauseClick, true);'));
  new Function("matchMedia", "document", src)(() => mq, { body });
  assert.ok(attrs.has("data-pause-short"), "stamped at init on a short landscape window");
  mq.matches = false; listeners[0]();
  assert.ok(!attrs.has("data-pause-short"), "removed when the window is tall again");
});

test("a queued INFO card older than ANN_STALE_MS of race time is dropped at the drain; a warning never is", () => {
  const { banner, shown } = openBanner({ profile: "broadcast" });
  banner.announce("HOLD", 5, "penalty-hit");
  shown.length = 0;
  banner.announce("UP TO P5", 2, "info");
  banner.announce("TRACK LIMITS", 2, "warning");
  banner.tick(9);
  assert.deepEqual(shown, ["TRACK LIMITS"], "the warning plays; the stale position call is dropped");
  banner.tick(10);
  assert.deepEqual(shown, ["TRACK LIMITS"], "UP TO P5 never reads out 9 s late");
  const fresh = openBanner({ profile: "broadcast" });
  fresh.banner.announce("HOLD", 5, "penalty-hit");
  fresh.banner.announce("TYRES AT 50%", 2, "info");
  fresh.shown.length = 0;
  fresh.banner.tick(6);
  assert.deepEqual(fresh.shown, ["TYRES AT 50%"], "a fresh info card still plays");
});

// #5068: the age was wall clock (performance.now), and tick() does not run while the
// race is paused, so a pause over 8 s dropped every queued engineer card for good.
test("a pause longer than ANN_STALE_MS does not age the queued info cards", () => {
  let now = 0;
  const { banner, shown } = openBanner({ profile: "broadcast", now: () => now });
  banner.announce("HOLD", 5, "penalty-hit");
  banner.announce("TYRES AT 50%", 2, "info");
  shown.length = 0;
  banner.tick(2);
  now = 60000;   // a minute in the pause menu: no ticks, wall clock moves on
  banner.tick(4);
  assert.deepEqual(shown, ["TYRES AT 50%"], "the queued card plays after the pause");
});

test("a full announce queue sheds comm and coach so a box call can queue", () => {
  const { banner, shown } = openBanner({ profile: "broadcast" });
  banner.announce("HOLD", 5, "comm");
  assert.equal(banner.announce("COACH TIP", 2, "coach"), true);
  assert.equal(banner.announce("TV LINE", 2, "comm"), true);
  assert.equal(banner.announce("TV TWO", 2, "comm"), false, "queue capped at two equal-priority lines");
  assert.equal(banner.announce("BOX BOX BOX — H", 2.2, "box"), true, "box queues by shedding the weakest waiting card");
  banner.tick(4);
  assert.ok(shown.includes("BOX BOX BOX — H"), "box is waiting behind the floor");
});

test("a give-back warning is not starved behind the caution's own radio card: it takes over at the floor", () => {
  const { banner, shown } = openBanner();
  banner.announce("SAFETY CAR. NO OVERTAKING", 3.3, "warning");
  banner.tick(0.5);
  banner.announce("GIVE THE POSITION BACK", 2.5, "penalty-warn");
  assert.deepEqual(shown, ["SAFETY CAR. NO OVERTAKING"], "the floor still holds: the SC card is not blinked away");
  let t = 0.5;
  while (shown.length < 2 && t < 6) { banner.tick(0.1); t += 0.1; }
  assert.equal(shown[1], "GIVE THE POSITION BACK");
  assert.ok(t <= 3.05, `the warning shows when the SC card's 3 s floor ends, not after its whole life (${t.toFixed(1)} s)`);
  const eq = openBanner();
  eq.banner.announce("TRACK LIMITS 1/4", 3.3, "penalty-warn");
  eq.banner.announce("POSITION RETURNED — NO PENALTY", 1.5, "penalty-warn");
  t = 0;
  while (eq.shown.length < 2 && t < 6) { eq.banner.tick(0.1); t += 0.1; }
  assert.ok(t > 3.7, `equal priority waits out the whole card (${t.toFixed(1)} s)`);
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const sc = game.match(/function scPassCall\(ev\) \{[\s\S]*?\n\}/)[0];
  assert.match(sc, /"GIVE THE POSITION BACK"[^;]*"penalty-warn", \(\) => scWatch\.info\(\)\.owed > 0\)/);
  assert.match(sc, /ev\.type === "cleared"\) \{ announce\("POSITION RETURNED — NO PENALTY", [\d.]+, "penalty-warn"\); return; \}/);
});

test("losing focus while visible pauses a solo race; an iOS audio interruption does too; neither in a friend race", () => {
  const game = fs.readFileSync(path.join(ROOT, "js/ui/platform-session.js"), "utf8");
  const blur = game.match(/window\.addEventListener\("blur", \(\) => \{[\s\S]*?\n\}\);/)[0];
  assert.match(blur, /document\.hidden \|\| document\.hasFocus\(\) \|\| navigator\.webdriver \|\| G\.netPlay\.active\(\)/, "settled, visible-only, never under automation or in MP");
  assert.match(blur, /if \(G.state === "race" \|\| G.state === "count"\) setPaused\(true, "blur"\);/);
  assert.match(game, /GameAudio\.onInterrupted\(\(\) => \{\s*if \(\(G.state === "race" \|\| G.state === "count"\) && !G\.netPlay\.active\(\)\) setPaused\(true, "audio-interrupted"\);/);
  const eng = fs.readFileSync(path.join(ROOT, "js/audio/engine.js"), "utf8");
  assert.match(eng, /ctx\.state === "interrupted" && _onInterrupted/);
});

test("a context lost within 3 s of becoming visible is iOS's late-reported BACKGROUND loss on every backend", () => {
  for (const f of ["js/render/glx/glx.js", "js/render/three/tlx.js", "js/render/webgpu/wgx.js"]) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    // pageshow fires on the FIRST load too; only a bfcache restore (persisted)
    // is a return. Unconditional, a real crash in the first 3 s after boot
    // was read as a background loss: uncounted reload, nothing latched.
    assert.match(src, /addEventListener\("pageshow", (?:\w+ = )?function \(e\) \{ if \(e && e\.persisted\) _shownAt = _nowMs\(\); \}\)/, f + " tracks when the page came back from the bfcache");
    assert.doesNotMatch(src, /addEventListener\("pageshow", function \(\) \{ _shownAt/, f + " must not treat the initial load as a return");
    assert.match(src, /_nowMs\(\) - _shownAt < 3000/, f + " treats a loss inside that window as the background loss");
  }
});
