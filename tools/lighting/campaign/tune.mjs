// @doc lighting-campaign: candidate values, sensitivity classification, and the minimal per-condition tune profile.
// @skill lighting-tuner
import { conditionKey } from "./config.mjs";

const SCHEMA = "apex26.lighting-campaign/v1";
const SENSITIVITY_TOLERANCE = 0.20;
const CLIP_TOLERANCE = 0.002;

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function snapToStep(value, min, step) {
  if (!Number.isFinite(step) || step <= 0) return value;
  const snapped = min + Math.round((value - min) / step) * step;
  return Number(snapped.toFixed(12));
}

function sortEntries(entries) {
  return entries.sort(([a], [b]) => a.localeCompare(b));
}

function sortedObject(value) {
  return Object.fromEntries(sortEntries(Object.entries(value)));
}

function profileDiff(baseline, selected) {
  return Object.fromEntries(
    sortEntries(Object.entries(selected))
      .filter(([id, value]) => !Object.is(value, baseline[id])),
  );
}

function resolveViewMean(view) {
  if (Number.isFinite(view?.meanDelta)) return view.meanDelta;
  if (Number.isFinite(view?.mean)) return view.mean;
  if (Number.isFinite(view?.metrics?.frame?.mean)) return view.metrics.frame.mean;
  throw new Error("view must provide metrics.frame.mean or meanDelta");
}

function normalizeCandidate(value, def) {
  return clamp(snapToStep(value, def.min, def.step), def.min, def.max);
}

function normalizeEvidenceView(view, index) {
  return {
    index,
    meanDelta: Number(view.meanDelta),
    blackClipDelta: Number(view.blackClipDelta || 0),
    whiteClipDelta: Number(view.whiteClipDelta || 0),
  };
}

function reproductionSucceeded(result) {
  if (typeof result === "boolean") return result;
  if (!isPlainObject(result)) return false;
  const gateChanged = result.gateStatusChanged === true ||
    result.gatesChanged === true ||
    result.gateChanged === true;
  if (gateChanged) return false;
  if (Object.hasOwn(result, "gates")) {
    if (!isPlainObject(result.gates) || result.gates.ok !== true) return false;
    if (Array.isArray(result.gates.failures) && result.gates.failures.length) return false;
  }
  if (typeof result.ok === "boolean") return result.ok;
  if (typeof result.pass === "boolean") return result.pass;
  if (typeof result.accepted === "boolean") return result.accepted;

  const views = Array.isArray(result.viewDeltas)
    ? result.viewDeltas
    : Array.isArray(result.views)
      ? result.views
      : null;
  if (!views) return false;
  return views.every((view) =>
    Number(view.meanDelta) <= SENSITIVITY_TOLERANCE &&
    Math.abs(Number(view.blackClipDelta || 0)) <= CLIP_TOLERANCE &&
    Math.abs(Number(view.whiteClipDelta || 0)) <= CLIP_TOLERANCE);
}

export function candidateValues(def, baseline) {
  if (!isPlainObject(def)) throw new Error("candidate values require a tune def");
  if (!Number.isFinite(def.min) || !Number.isFinite(def.max) || def.max < def.min)
    throw new Error("candidate values require finite min/max bounds");
  if (!Number.isFinite(baseline)) throw new Error("candidate values require a finite baseline");

  const clampedBaseline = clamp(baseline, def.min, def.max);
  const midpoint = (a, b) => (a + b) / 2;
  const positiveMidpoint = (a, b) => (a > 0 && b > 0 ? Math.sqrt(a * b) : midpoint(a, b));
  const rawValues = def.min < 0
    ? [def.min, midpoint(def.min, clampedBaseline), clampedBaseline, midpoint(clampedBaseline, def.max), def.max]
    : [def.min, clampedBaseline, positiveMidpoint(clampedBaseline, def.max), def.max];

  return Array.from(new Set(rawValues.map((value) => normalizeCandidate(value, def)))).sort((a, b) => a - b);
}

export function classifySensitivity(baselineViews, candidateViews, options = {}) {
  const controlChanged = options.controlChanged !== false;
  const gateExplanation = options.gateExplanation || null;

  const views = candidateViews == null
    ? baselineViews.map((view, index) => normalizeEvidenceView(view, index))
    : baselineViews.map((baselineView, index) => {
      const candidateView = candidateViews[index];
      if (!candidateView) throw new Error("candidate views must match baseline views");
      return {
        index,
        baselineMean: resolveViewMean(baselineView),
        candidateMean: resolveViewMean(candidateView),
        meanDelta: Math.abs(resolveViewMean(candidateView) - resolveViewMean(baselineView)),
        blackClipDelta: Math.abs(
          Number(candidateView?.metrics?.frame?.blackClipFraction || candidateView?.blackClipFraction || 0) -
          Number(baselineView?.metrics?.frame?.blackClipFraction || baselineView?.blackClipFraction || 0),
        ),
        whiteClipDelta: Math.abs(
          Number(candidateView?.metrics?.frame?.whiteClipFraction || candidateView?.whiteClipFraction || 0) -
          Number(baselineView?.metrics?.frame?.whiteClipFraction || baselineView?.whiteClipFraction || 0),
        ),
      };
    });

  return {
    active: controlChanged && views.some((view) => view.meanDelta > SENSITIVITY_TOLERANCE),
    controlChanged,
    gateExplanation,
    threshold: SENSITIVITY_TOLERANCE,
    views,
    maxMeanDelta: views.reduce((max, view) => Math.max(max, view.meanDelta), 0),
  };
}

export async function minimalProfile(baseline, selected, reproduce) {
  if (!isPlainObject(baseline) || !isPlainObject(selected)) throw new Error("profiles must be objects");
  if (typeof reproduce !== "function") throw new Error("minimal profile requires a reproduce function");

  let profile = profileDiff(baseline, selected);
  const completeBaseline = sortedObject(baseline);
  if (reproductionSucceeded(await reproduce(completeBaseline, { removed: null, profile: {} }))) return {};

  let removed;
  do {
    removed = false;
    for (const key of Object.keys(profile)) {
      const candidateProfile = { ...profile };
      delete candidateProfile[key];
      const candidate = sortedObject({ ...baseline, ...candidateProfile });
      if (reproductionSucceeded(await reproduce(candidate, { removed: key, profile: sortedObject(candidateProfile) }))) {
        profile = candidateProfile;
        removed = true;
      }
    }
  } while (removed);
  return sortedObject(profile);
}

export function buildConditionRecord(inputs) {
  if (!isPlainObject(inputs)) throw new Error("condition record inputs must be an object");
  const condition = inputs.condition || inputs;
  if (!condition || typeof condition.track !== "string" || typeof condition.tod !== "string" || typeof condition.weather !== "string")
    throw new Error("condition record requires track, tod, and weather");

  const baselineViews = Array.isArray(inputs.baselineViews) ? inputs.baselineViews.slice() : [];
  const finalViews = Array.isArray(inputs.finalViews) ? inputs.finalViews.slice() : (Array.isArray(inputs.views) ? inputs.views.slice() : []);
  if (baselineViews.length !== 3) throw new Error("condition record requires exactly three baseline views");
  if (finalViews.length !== 3) throw new Error("condition record requires exactly three final views");

  const key = typeof condition.key === "string"
    ? condition.key
    : conditionKey(condition.track, condition.tod, condition.weather);
  const profile = sortedObject(inputs.profile || {});

  return {
    schema: SCHEMA,
    track: condition.track,
    tod: condition.tod,
    weather: condition.weather,
    key,
    baseline: sortedObject(inputs.baseline || {}),
    selected: sortedObject(inputs.selected || {}),
    profile,
    minimalProfile: profile,
    sensitivity: inputs.sensitivity || null,
    rejectedCandidates: Array.isArray(inputs.rejectedCandidates) ? inputs.rejectedCandidates.slice() : [],
    rationale: inputs.rationale || "",
    baselineViews,
    finalViews,
    views: finalViews,
    gates: inputs.gates || { ok: true, failures: [] },
  };
}
