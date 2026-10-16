/* Apex 26 — CamGroups: the ONE table of which player cameras count as
   "onboard" and which take the cockpit HUD layout, by CamModes id.

   Two questions, two frozen tables, decided from what each rig draws
   (js/camera/vantage.js, js/camera/drive-onboard.js):

   ONBOARD — the driver's own car fills the view, so MAP AUTO hides the map
   (js/ui/hud.js) to keep the road clear:
     cockpit  the driver's eye: tub, halo, steering wheel
     helmet   the same cockpit from inside the lid (vantage.js HELMET_EYE_FWD)
     visor    the cockpit WITHOUT its wheel (a linked phone is the wheel) —
              still tub, halo, mirrors, front wheels and nose
     hood     bolted to the nose: the car's front is the bottom of the frame
     tcam     on the airbox: the engine cover / halo ahead of the lens
   REAR is not onboard: it looks backwards over the gearbox at the field.

   COCKPIT_LAYOUT — MOVE & SIZE (js/ui/hud-layout.js) gives this one the cockpit
   layout because a STEERING WHEEL sits across the bottom centre of the
   screen, where the shipped OVERTAKE / AERO / ENERGY / TYRES strip lives,
   and its LCD carries gear and speed (body.cockpit-cam hides those chips):
     cockpit   the driver's eye, the wheel's screen readable
   HELMET_LAYOUT — the same wheel seen from inside the lid, but the HUD is the
   VISOR: nothing is left to the LCD (on a phone its digits are a few pixels
   tall), so gear, speed and the chips all paint, at offsets of their own that
   clear the wheel and the touch columns (hud-layout.js HELMET strips). Reported
   2026-10-05 from a phone: in HELMET "the HUD isn't really showing" — it had
   taken the cockpit's hides (chips, gear, speed) and showed the top row alone.
     helmet
   VISOR is out of both: it draws no wheel and no dash (vantage.js "the wheel
   and its dash left out"), so its bottom centre is the nose, exactly as HOOD's
   is — and HOOD always used the other layout. */
const CamGroups = (function () {
  "use strict";
  const ONBOARD = Object.freeze({ cockpit: 1, helmet: 1, visor: 1, hood: 1, tcam: 1 });
  const COCKPIT_LAYOUT = Object.freeze({ cockpit: 1 });
  const HELMET_LAYOUT = Object.freeze({ helmet: 1 });
  return Object.freeze({
    ONBOARD, COCKPIT_LAYOUT, HELMET_LAYOUT,
    isOnboard: (id) => !!ONBOARD[id],
    usesCockpitLayout: (id) => !!COCKPIT_LAYOUT[id],
    /** The MOVE & SIZE set a camera paints: "cockpit" | "helmet" | "other". */
    layoutSet: (id) => (COCKPIT_LAYOUT[id] ? "cockpit" : HELMET_LAYOUT[id] ? "helmet" : "other"),
  });
})();
