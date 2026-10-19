// Pass installGarageGpuAllocationProbe to page.addInitScript BEFORE goto().
// Sources checked 2026-10-18:
// https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/createBuffer
// https://developer.mozilla.org/en-US/docs/Web/API/GPUBuffer/destroy
// https://threejs.org/docs/pages/Info.html
// Mirrors the prototype-hook approach of tools/gfx/gpu-game-check.mjs.
// No GPU object is strongly retained by this instrumentation.
export function installGarageGpuAllocationProbe() {
  if (window.__garageGpuAlloc) return;
  const G = window.GPUDevice?.prototype;
  const B = window.GPUBuffer?.prototype;
  const T = window.GPUTexture?.prototype;
  const state = {
    supported: !!(G?.createBuffer && B?.destroy && G?.createTexture && T?.destroy),
    devicesObserved: 0, bufferCreated: 0, bufferDestroyed: 0,
    bufferCreatedBytes: 0, bufferDestroyedBytes: 0, bufferUndestroyedBytes: 0,
    bufferPeakUndestroyedBytes: 0, textureCreated: 0, textureDestroyed: 0,
    deviceDestroyed: 0, pipelineCreated: 0, pipelineAsyncCreated: 0, shaderModulesCreated: 0, queueSubmits: 0, byUsage: {},
  };
  const resources = new WeakMap(), devices = new WeakMap();
  const usageStats = (usage) => state.byUsage[usage] || (state.byUsage[usage] = {
    created: 0, destroyed: 0, createdBytes: 0, destroyedBytes: 0, undestroyedBytes: 0,
  });
  const owner = (device) => {
    let records = devices.get(device);
    if (!records) { records = new Set(); devices.set(device, records); state.devicesObserved++; }
    return records;
  };
  function retire(rec) {
    if (!rec || rec.destroyed) return;
    rec.destroyed = true; rec.owner.delete(rec);
    if (rec.kind === 'buffer') {
      const u = usageStats(rec.usage);
      state.bufferDestroyed++; state.bufferDestroyedBytes += rec.bytes;
      state.bufferUndestroyedBytes -= rec.bytes;
      u.destroyed++; u.destroyedBytes += rec.bytes; u.undestroyedBytes -= rec.bytes;
    } else state.textureDestroyed++;
  }
  window.__garageGpuAlloc = {
    read: () => JSON.parse(JSON.stringify(state)),
    semantics: 'Returned createBuffer descriptor bytes minus observed explicit buffer/device destroy. Not physical/resident VRAM; invalid objects and GC reclamation are not identified. Textures are counts only, excludes swapchain textures. No objects held strongly. byUsage keys are GPUBufferUsage bitmasks (MAP_READ=1, MAP_WRITE=2).',
  };
  if (!state.supported) return;
  for (const [name, key] of [['createRenderPipeline','pipelineCreated'],['createRenderPipelineAsync','pipelineAsyncCreated'],['createShaderModule','shaderModulesCreated']]) {
    const original = G[name]; if (!original) continue;
    G[name] = function () { const result = original.apply(this, arguments); state[key]++; return result; };
  }
  if (window.GPUQueue?.prototype?.submit) {
    const original = GPUQueue.prototype.submit;
    GPUQueue.prototype.submit = function () { const result = original.apply(this, arguments); state.queueSubmits++; return result; };
  }
  const createBuffer = G.createBuffer;
  G.createBuffer = function (descriptor) {
    const buffer = createBuffer.apply(this, arguments);
    const bytes = Number(descriptor.size), usage = Number(descriptor.usage);
    const records = owner(this), rec = { kind: 'buffer', bytes, usage, destroyed: false, owner: records };
    resources.set(buffer, rec); records.add(rec);
    const u = usageStats(usage);
    state.bufferCreated++; state.bufferCreatedBytes += bytes; state.bufferUndestroyedBytes += bytes;
    state.bufferPeakUndestroyedBytes = Math.max(state.bufferPeakUndestroyedBytes, state.bufferUndestroyedBytes);
    u.created++; u.createdBytes += bytes; u.undestroyedBytes += bytes;
    return buffer;
  };
  const destroyBuffer = B.destroy;
  B.destroy = function () {
    const result = destroyBuffer.apply(this, arguments);
    retire(resources.get(this)); return result;
  };
  const createTexture = G.createTexture;
  G.createTexture = function (descriptor) {
    const texture = createTexture.apply(this, arguments), records = owner(this);
    const rec = { kind: 'texture', destroyed: false, owner: records };
    resources.set(texture, rec); records.add(rec); state.textureCreated++;
    return texture;
  };
  const destroyTexture = T.destroy;
  T.destroy = function () {
    const result = destroyTexture.apply(this, arguments);
    retire(resources.get(this)); return result;
  };
  const destroyDevice = G.destroy;
  if (destroyDevice) G.destroy = function () {
    const result = destroyDevice.apply(this, arguments);
    const records = devices.get(this);
    if (records) { for (const rec of records) retire(rec); devices.delete(this); }
    state.deviceDestroyed++; return result;
  };
}
