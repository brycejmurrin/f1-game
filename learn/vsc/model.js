/* VSC pit-strategy teaching model. All times are integer milliseconds. */
const VscLesson = (() => {
  "use strict";

  const pitPath = Object.freeze([4000, 18000, 2500, 5500]);
  const baseline = {
    gapBehind: 14000,
    greenTrack: 8000,
    vscTrack: 18000,
    boxPace: 14000,
    stayPace: 1000,
    traffic: 0,
  };
  const fixtures = Object.freeze({
    default: Object.freeze({ ...baseline }),
    hardLife: Object.freeze({ ...baseline, boxPace: 5000 }),
    earlyGreen: Object.freeze({ ...baseline, vscTrack: 13000, boxPace: 5000 }),
    traffic: Object.freeze({ ...baseline, vscTrack: 13000, boxPace: 5000, traffic: 3000 }),
  });

  function evaluate(input, serviceAdjustment = 0) {
    const standardPitTime = pitPath.reduce((total, time) => total + time, 0);
    const pitTime = standardPitTime + serviceAdjustment;
    const greenLoss = standardPitTime - input.greenTrack;
    const boxLoss = pitTime - input.vscTrack;
    const rejoin = input.gapBehind - boxLoss;
    const boxTotal = boxLoss + input.boxPace + input.traffic;
    const stayTotal = greenLoss + input.stayPace;
    return { pitTime, greenLoss, boxLoss, rejoin, boxTotal, stayTotal };
  }

  return Object.freeze({ fixtures, pitPath, evaluate });
})();
