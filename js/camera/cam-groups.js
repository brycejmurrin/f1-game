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

   COCKPIT_LAYOUT — MOVE & SIZE (js/ui/hud-layout.js) gives these the cockpit
   layout because a STEERING WHEEL sits across the bottom centre of the
   screen, where the shipped OVERTAKE / AERO / ENERGY / TYRES strip lives:
     cockpit, helmet   both draw the wheel (helmet had used the chase layout,
                       so the strip painted over the wheel)
   VISOR is out: it draws no wheel and no dash (vantage.js "the wheel and its
   dash left out"), so its bottom centre is the nose, exactly as HOOD's is —
   and HOOD always used the other layout. */
const CamGroups = (function () {
  "use strict";
  const ONBOARD = Object.freeze({ cockpit: 1, helmet: 1, visor: 1, hood: 1, tcam: 1 });
  const COCKPIT_LAYOUT = Object.freeze({ cockpit: 1, helmet: 1 });
  return Object.freeze({
    ONBOARD, COCKPIT_LAYOUT,
    isOnboard: (id) => !!ONBOARD[id],
    usesCockpitLayout: (id) => !!COCKPIT_LAYOUT[id],
  });
})();
