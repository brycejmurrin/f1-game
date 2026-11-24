/* VSC pit-strategy teaching model: milliseconds, metres and km/h. */
const VscLesson = (() => {
  "use strict";

  const distance = 400;
  const safetyCarSpeed = 60;
  const pitPath = Object.freeze([4000, 18000, 2500, 5500]);
  const baseline = {
    gapBehind: 14000,
    greenSpeed: 180,
    vscSpeed: 80,
    vscEnds: 22000,
    boxPace: 14000,
    stayPace: 1000,
    traffic: 0,
  };
  const fixtures = Object.freeze({
    default: Object.freeze({ ...baseline }),
    hardLife: Object.freeze({ ...baseline, boxPace: 5000 }),
    earlyGreen: Object.freeze({ ...baseline, vscEnds: 9000, boxPace: 5000 }),
    traffic: Object.freeze({ ...baseline, vscEnds: 9000, boxPace: 5000, traffic: 3000 }),
    green: Object.freeze({ ...baseline, regime: "green", vscEnds: 0, boxPace: 5000 }),
    safetyCar: Object.freeze({ ...baseline, regime: "safetyCar", vscSpeed: safetyCarSpeed, vscEnds: 30000, gapBehind: 3500, boxPace: 5000 }),
  });

  const travelTime = (metres, speed) => Math.round(metres * 3600 / speed);
  const travelled = (elapsed, speed) => elapsed * speed / 3600;

  function evaluate(input, serviceAdjustment = 0) {
    const standardPitTime = pitPath.reduce((total, time) => total + time, 0);
    const pitTime = standardPitTime + serviceAdjustment;
    const greenTrack = travelTime(distance, input.greenSpeed);
    const fullCautionTime = travelTime(distance, input.vscSpeed);
    const cautionMs = Math.min(input.vscEnds, fullCautionTime);
    const cautionMetres = cautionMs === fullCautionTime ? distance : travelled(cautionMs, input.vscSpeed);
    const restartMetres = distance - cautionMetres;
    const trackTime = cautionMs + travelTime(restartMetres, input.greenSpeed);
    const greenLoss = pitTime - greenTrack;
    const boxLoss = pitTime - trackTime;
    const referenceCautionMs = Math.min(fullCautionTime, Math.max(0, input.vscEnds - input.gapBehind));
    const remainingMetres = referenceCautionMs === fullCautionTime ? 0 : distance - travelled(referenceCautionMs, input.vscSpeed);
    const referenceTrackTime = referenceCautionMs + travelTime(remainingMetres, input.greenSpeed);
    const referenceArrival = input.gapBehind + referenceTrackTime;
    const rejoin = referenceArrival - pitTime;
    const traffic = rejoin < 0 ? input.traffic : 0;
    const boxTotal = boxLoss + input.boxPace + traffic;
    const stayTotal = greenLoss + input.stayPace;
    return { pitTime, greenTrack, cautionMs, cautionMetres, restartMetres, trackTime,
      referenceCautionMs, referenceTrackTime, referenceArrival,
      greenLoss, boxLoss, rejoin, traffic, boxTotal, stayTotal };
  }

  function progress(elapsed, input, result) {
    const [entry, transit, , exit] = pitPath;
    const serviceEnd = result.pitTime - exit;
    const boundaries = [entry, entry + transit, serviceEnd, result.pitTime];
    const lengths = [0, 0.2, 0.78, 0.78, 1];
    let pit = 1;
    let pitPhase = "Rejoined";
    const phase = boundaries.findIndex(end => elapsed < end);
    if (phase >= 0) {
      const start = boundaries[phase - 1] || 0;
      const fraction = (elapsed - start) / (boundaries[phase] - start);
      pit = lengths[phase] + fraction * (lengths[phase + 1] - lengths[phase]);
      pitPhase = ["Entry", "Transit", "Service", "Exit"][phase];
    }
    const onTrack = Math.min(elapsed, result.trackTime);
    const underCaution = Math.min(onTrack, result.cautionMs);
    const track = travelled(underCaution, input.vscSpeed) +
      travelled(onTrack - underCaution, input.greenSpeed);
    const referenceElapsed = Math.max(0, elapsed - input.gapBehind);
    const referenceCaution = Math.min(referenceElapsed, result.referenceCautionMs);
    const reference = travelled(referenceCaution, input.vscSpeed) +
      travelled(referenceElapsed - referenceCaution, input.greenSpeed);
    return { pit, pitPhase, track: elapsed >= result.trackTime ? 1 : track / distance,
      reference: elapsed >= result.referenceArrival ? 1 : Math.min(1, reference / distance),
      green: Math.min(1, elapsed / result.greenTrack) };
  }

  function compareRegimes(input, pitTime) {
    // Hold each illustrative pace for the full sector so only track pace changes.
    const speeds = { green: input.greenSpeed, vsc: input.vscSpeed, safetyCar: input.safetyCarSpeed ?? safetyCarSpeed };
    return Object.fromEntries(Object.entries(speeds).map(([mode, speed]) => {
      const trackTime = travelTime(distance, speed);
      return [mode, { speed, trackTime, loss: pitTime - trackTime }];
    }));
  }

  return Object.freeze({ distance, fixtures, pitPath, evaluate, progress, compareRegimes });
})();
