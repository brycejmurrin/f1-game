/* Apex 26 — WGX debug labels (#2964).
   install(device) wraps GPUDevice create* so every buffer / texture / sampler /
   pipeline / bind group / query set carries a `label`, and wraps command
   encoders so beginRenderPass / beginComputePass push/pop a debug group named
   after the pass. Labels are free on the GPU path and feed Dawn / WebKit
   validation messages (`[Invalid Buffer (wgx-buffer-3)] …`). No-op if the
   device was already wrapped. */
const WGXDebugLabels = (function () {
  "use strict";

  const COUNTERS = Object.create(null);

  function next(kind) {
    COUNTERS[kind] = (COUNTERS[kind] || 0) + 1;
    return "wgx-" + kind + "-" + COUNTERS[kind];
  }

  function ensureLabel(desc, kind) {
    if (!desc || typeof desc !== "object") return desc;
    if (!desc.label) desc.label = next(kind);
    return desc;
  }

  /** Dawn-shaped validation string that names the labelled object — the form
   *  real GPUValidationError messages use when user-defined labels are on. */
  function validationMessage(kind, label, detail) {
    return "[Invalid " + kind + " (" + label + ")] " + (detail || "is invalid.");
  }

  function wrapPass(encoder, beginName, kind) {
    const orig = encoder[beginName];
    if (typeof orig !== "function") return;
    encoder[beginName] = function (desc) {
      const d = ensureLabel(desc || {}, kind);
      try { if (typeof encoder.pushDebugGroup === "function") encoder.pushDebugGroup(d.label); } catch (_) { /* stub devices */ }
      const pass = orig.call(encoder, d);
      if (pass && typeof pass.end === "function") {
        const end = pass.end.bind(pass);
        pass.end = function () {
          let out;
          try { out = end(); } finally {
            try { if (typeof encoder.popDebugGroup === "function") encoder.popDebugGroup(); } catch (_) { /* stub */ }
          }
          return out;
        };
      } else {
        try { if (typeof encoder.popDebugGroup === "function") encoder.popDebugGroup(); } catch (_) { /* stub */ }
      }
      return pass;
    };
  }

  function wrapEncoder(enc) {
    if (!enc || enc.__wgxDebugLabels) return enc;
    enc.__wgxDebugLabels = true;
    wrapPass(enc, "beginRenderPass", "render-pass");
    wrapPass(enc, "beginComputePass", "compute-pass");
    return enc;
  }

  function install(device) {
    if (!device || device.__wgxDebugLabels) return device;
    device.__wgxDebugLabels = true;

    const sync = [
      ["createBuffer", "buffer"],
      ["createTexture", "texture"],
      ["createSampler", "sampler"],
      ["createBindGroup", "bind-group"],
      ["createBindGroupLayout", "bind-group-layout"],
      ["createPipelineLayout", "pipeline-layout"],
      ["createRenderPipeline", "render-pipeline"],
      ["createComputePipeline", "compute-pipeline"],
      ["createShaderModule", "shader-module"],
      ["createQuerySet", "query-set"],
    ];
    for (let i = 0; i < sync.length; i++) {
      const method = sync[i][0], kind = sync[i][1];
      const orig = device[method];
      if (typeof orig !== "function") continue;
      device[method] = function (desc) {
        return orig.call(device, ensureLabel(desc, kind));
      };
    }

    if (typeof device.createRenderPipelineAsync === "function") {
      const origAsync = device.createRenderPipelineAsync.bind(device);
      device.createRenderPipelineAsync = function (desc) {
        return origAsync(ensureLabel(desc, "render-pipeline"));
      };
    }
    if (typeof device.createComputePipelineAsync === "function") {
      const origAsync = device.createComputePipelineAsync.bind(device);
      device.createComputePipelineAsync = function (desc) {
        return origAsync(ensureLabel(desc, "compute-pipeline"));
      };
    }

    const origEnc = device.createCommandEncoder;
    if (typeof origEnc === "function") {
      device.createCommandEncoder = function (desc) {
        const enc = origEnc.call(device, desc ? ensureLabel(desc, "command-encoder") : desc);
        return wrapEncoder(enc);
      };
    }
    return device;
  }

  /** Reset auto-label counters — unit tests only. */
  function _resetCounters() {
    for (const k of Object.keys(COUNTERS)) delete COUNTERS[k];
  }

  return { install, ensureLabel, validationMessage, _resetCounters };
})();

if (typeof window !== "undefined") window.WGXDebugLabels = WGXDebugLabels;
