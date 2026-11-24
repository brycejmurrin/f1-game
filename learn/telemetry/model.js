/* Telemetry Detective — authored samples and distance alignment for Learn. */
const TelemetryLesson = (() => {
  "use strict";

  const { brakingDuel, cumDist, distAtT, sampleAt, timeAtDist } = DataTelemetryModel;
  const maxSampleGap = 1.5;

  function fixtureLane(label, samples) {
    const car = Object.freeze(samples.map(([speed, brake, throttle], i) =>
      Object.freeze({ t: i / 4, speed, brake, throttle })));
    const cum = cumDist(car);
    Object.freeze(cum.t);
    Object.freeze(cum.d);
    return Object.freeze({ label, car, cum: Object.freeze(cum) });
  }

  const fixture = Object.freeze({
    source: "Synthetic worked example",
    from: 10,
    to: 90,
    lanes: Object.freeze([
      fixtureLane("A", [
        [216, 0, 100], [216, 0, 100], [198, 100, 0], [162, 100, 0], [144, 0, 40],
        [162, 0, 95], [180, 0, 100], [198, 0, 100], [216, 0, 100],
      ]),
      fixtureLane("B", [
        [216, 0, 100], [216, 0, 100], [216, 0, 100], [180, 100, 0], [126, 100, 0],
        [126, 0, 40], [144, 0, 95], [162, 0, 100], [180, 0, 100],
      ]),
    ]),
  });

  function alignedPrefix(lane) {
    const samples = lane?.car || [];
    const car = [];
    let reason = "Both lanes must cover the whole interval.";
    if (!samples.length || samples[0].t !== 0) {
      reason = "Both lanes need a sample at the alignment origin.";
    } else {
      for (const row of samples) {
        if (!Number.isFinite(row.speed) || !Number.isFinite(row.t)) {
          reason = "Unavailable: missing telemetry channels.";
          break;
        }
        if (car.length && row.t - car.at(-1).t > maxSampleGap) {
          reason = "Unavailable: telemetry gap after the alignment origin.";
          break;
        }
        if (row.speed < 0 || (car.length && (row.speed === 0 || row.t <= car.at(-1).t))) {
          reason = "Distance must increase through both lanes.";
          break;
        }
        car.push(row);
      }
    }
    return { car, cum: cumDist(car), reason };
  }

  function analyze(lanes, from, to, reference = 0) {
    if (lanes.length !== 2 || !Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from) {
      return { available: false, reason: "Choose two lanes and a valid distance interval." };
    }
    const aligned = lanes.map(alignedPrefix);
    for (const lane of aligned) {
      if (lane.car.length < 2 || lane.cum.d.at(-1) < to) return { available: false, reason: lane.reason };
    }
    const result = brakingDuel(aligned[0], aligned[1], from, to);
    if (result.available && reference === 1) {
      result.deltaBefore = 0 - result.deltaBefore;
      result.deltaAfter = 0 - result.deltaAfter;
      result.change = 0 - result.change;
    }
    return result;
  }

  const finiteOrNull = value => Number.isFinite(value) ? value : null;

  function sampleReading(lane, value, axis) {
    const isTime = axis === "time";
    const last = (isTime ? lane.cum.t : lane.cum.d).at(-1);
    const covered = Number.isFinite(value) && value >= 0 && value <= last;
    const t = covered ? (isTime ? value : timeAtDist(lane.cum, value)) : null;
    const distance = covered ? (isTime ? distAtT(lane.cum, t) : value) : null;
    const sample = covered ? sampleAt(lane.car, t) : null;
    return { t, distance, speed: finiteOrNull(sample?.speed), brake: finiteOrNull(sample?.brake),
      throttle: finiteOrNull(sample?.throttle) };
  }

  function deltaAt(lanes, distance, reference) {
    const times = lanes.map(lane => distance >= 0 && distance <= lane.cum.d.at(-1)
      ? timeAtDist(lane.cum, distance) : null);
    if (times.length !== 2 || times.some(t => !Number.isFinite(t))) return null;
    return reference === 1 ? times[0] - times[1] : times[1] - times[0];
  }

  function readAt(lanes, value, axis = "distance", reference = 0) {
    const aligned = lanes.map(alignedPrefix);
    return {
      lanes: aligned.map(lane => sampleReading(lane, value, axis)),
      delta: axis === "time" ? null : deltaAt(aligned, value, reference),
    };
  }

  function series(lanes, from, to, reference = 0, steps = 128) {
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from ||
      !Number.isInteger(steps) || steps < 1) return [];
    const aligned = lanes.map(alignedPrefix);
    return Array.from({ length: steps + 1 }, (_, i) => {
      const distance = from + (to - from) * i / steps;
      return { distance, delta: deltaAt(aligned, distance, reference) };
    });
  }

  return Object.freeze({ fixture, analyze, readAt, series });
})();
