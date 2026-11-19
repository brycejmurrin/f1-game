const CamGroups = (function () {
  "use strict";
  const ONBOARD = Object.freeze({ cockpit: 1, helmet: 1, visor: 1, hood: 1, tcam: 1 });
  const COCKPIT_LAYOUT = Object.freeze({ cockpit: 1 });
  const HELMET_LAYOUT = Object.freeze({ helmet: 1 });
  return Object.freeze({
    ONBOARD, COCKPIT_LAYOUT, HELMET_LAYOUT,
    isOnboard: (id) => !!ONBOARD[id],
    usesCockpitLayout: (id) => !!COCKPIT_LAYOUT[id],
    layoutSet: (id) => (COCKPIT_LAYOUT[id] ? "cockpit" : HELMET_LAYOUT[id] ? "helmet" : "other"),
  });
})();
