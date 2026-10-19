// @doc UI explorer mission recipes and independent-browser task briefs.
export const MODE_TITLES = Object.freeze({ missions: "Player missions", atlas: "UI atlas", transitions: "Transition filmstrips", responsive: "Phone stress", faults: "Failure recovery", accessibility: "Accessibility", minimize: "Short reproductions", scene: "Scene investigation" });
const click = (selector) => ({ type: "click", selector });
const wait = (selector) => ({ type: "wait", selector, state: "visible" });
const check = (label) => ({ type: "checkpoint", label });

export const MISSIONS = [
  { version: 1, id: "first-race", goal: "Start a wet Monaco Grand Prix from a fresh profile.", actions: [click("#mb-race"), wait("#select:not([hidden])"), click('#sel-tracks .track-row:has-text("Monaco")'), click("#sel-go"), wait("#race-settings:not([hidden])"), { type: "select", selector: "#rs-weather-sel", value: "wet" }, check("Wet Monaco race setup"), click("#rs-go"), wait("#hud:not([hidden])"), check("First race reached")], oracle: { type: "game", track: "monaco", weather: "wet" } },
  { version: 1, id: "customize-car", goal: "Create and fit a named livery, then return to the title.", actions: [click("#mb-garage"), wait("#carsetup:not([hidden])"), click("#cs-tab-livery"), click("#cs-options .cs-liv-create"), { type: "fill", selector: "#cs-options .cs-liv-ed-name", value: "Explorer livery" }, click("#cs-options .cs-liv-ed-save"), check("Custom livery fitted"), click("#cs-done"), wait("#overlay:not([hidden])")], oracle: { type: "selector", selector: "#mb-race", state: "visible" } },
  { version: 1, id: "return-settings", goal: "Start a race, pause, and find the controls settings.", actions: [click("#mb-race"), click("#sel-go"), click("#rs-go"), wait("#hud:not([hidden])"), click("#pausebtn"), wait("#pausemenu:not([hidden])"), click("#pm-settings"), click("#pm-open-controls"), wait("#pm-panel-controls:not([hidden])"), check("Controls reached from a race")], oracle: { type: "selector", selector: "#pm-panel-controls", state: "visible" } },
  { version: 1, id: "settings-persistence", goal: "Choose the Light theme and verify the control, live preference and saved value before and after reload.",
    actions: [click("#mb-settings"), click("#pm-open-appearance"), wait("#pm-uitheme-sel"), { type: "select", selector: "#pm-uitheme-sel", value: "light" },
      { type: "assert", oracle: { type: "binding", selector: "#pm-uitheme-sel", runtime: "light", saved: "light" } },
      check("Light theme applied and saved"), { type: "reload" }, wait("#mb-settings"), click("#mb-settings"), click("#pm-open-appearance"), wait("#pm-uitheme-sel"),
      { type: "assert", oracle: { type: "binding", selector: "#pm-uitheme-sel", runtime: "light", saved: "light" } }, check("Light theme survived reload")],
    oracle: { type: "binding", selector: "#pm-uitheme-sel", runtime: "light", saved: "light" } },
];

/** No navigation hints or debug hooks: independent browser tools get only the goal. */
export function missionBrief(mission, url) {
  const target = new URL(url);
  if (!["http:", "https:"].includes(target.protocol)) throw new Error("Mission URL must use http(s)");
  return { task: `Explore ${target.href} as a first-time player in a fresh browser profile. Goal: ${mission.goal} Use visible controls only; do not inspect source or call debug hooks. Stop after 30 actions or 180 seconds. Record exact visible labels, actions, confusing wording, dead ends, console errors if available, and screenshots. Do not join multiplayer, send messages, make purchases, or publish anything. Report reached / blocked / not-run truthfully and return an ordered action history.`, timeout_seconds: 240, max_cost_usd: 2 };
}
