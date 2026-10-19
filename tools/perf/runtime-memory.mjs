// @doc Nonintrusive, feature-detected CDP heap/DOM/performance counters on a parent-owned browser session.
// @skill mcp-probe / js-debugger
// Runtime heap usage is isolate-scoped, not the browser's RSS or resident GPU bytes.
// https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-getHeapUsage
// https://chromedevtools.github.io/devtools-protocol/tot/Memory/#method-getDOMCounters
// https://chromedevtools.github.io/devtools-protocol/tot/Performance/#method-getMetrics
const HEAP_FIELDS = ['usedSize', 'totalSize', 'embedderHeapUsedSize', 'backingStorageSize'];
const DOM_FIELDS = ['documents', 'nodes', 'jsEventListeners'];
const metric = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? { status: 'available', value: v } : { status: 'unavailable', value: null };
/** No collection/preparation calls, forced GC, page evaluation, worker termination or cache drops.
 * Performance metrics are sampled only if the caller already enabled the domain;
 * opt in with enablePerformance:true to enable it (left enabled for its owner).
 * Deadlines bound waiting, not protocol execution; timeout records unknown, never zero.
 */
export async function runtimeMemory(cdp, { timeoutMs = 3000, enablePerformance = false } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 10000) throw new Error('timeoutMs bounds: 10..10000');
  if (typeof enablePerformance !== 'boolean') throw new Error('enablePerformance must be boolean');
  const request = async (command) => {
    let timer;
    try {
      const value = await Promise.race([
        Promise.resolve().then(() => cdp.send(command)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('CDP deadline; execution unknown')), timeoutMs); }),
      ]);
      if (!value || typeof value !== 'object') throw new Error('malformed CDP response');
      return { status: 'available', value };
    } catch (e) { return { status: 'unavailable', value: null, reason: String(e.message || e).slice(0, 300) }; }
    finally { clearTimeout(timer); }
  };
  // Sequential on one owned CDP connection; no competing domains/controllers.
  const heap = await request('Runtime.getHeapUsage');
  const dom = await request('Memory.getDOMCounters');
  let performanceEnable = null;
  if (enablePerformance) performanceEnable = await request('Performance.enable');
  const perf = performanceEnable?.status === 'unavailable' ? performanceEnable : await request('Performance.getMetrics');
  const fields = (result, names) => Object.fromEntries(names.map((k) => [k, metric(result.value?.[k])]));
  const domain = (result, names, key) => {
    const values = fields(result, names);
    const available = Object.values(values).some((v) => v.status === 'available');
    return { status: available ? 'available' : 'unavailable',
      ...(!available ? { reason: result.reason || 'CDP response has no usable counters' } : {}), [key]: values };
  };
  const metrics = Array.isArray(perf.value?.metrics) ? perf.value.metrics.slice(0, 100)
    .filter((m) => m && typeof m.name === 'string' && m.name.length > 0)
    .map((m) => ({ name: m.name.slice(0, 100), ...metric(m.value) })) : [];
  const perfAvailable = metrics.some((m) => m.status === 'available');
  return {
    schemaVersion: 1, scope: 'current CDP target/isolate; not process RSS, GPU residency or a leak verdict',
    collection: 'no forced GC or intrusive leak preparation',
    heap: domain(heap, HEAP_FIELDS, 'bytes'),
    dom: domain(dom, DOM_FIELDS, 'counters'),
    performance: { status: perfAvailable ? 'available' : 'unavailable',
      ...(!perfAvailable ? { reason: perf.reason || 'CDP response has no usable metrics; domain may be unenabled' } : {}),
      enabledByHelper: enablePerformance && performanceEnable?.status === 'available', metrics,
      interpretation: 'Metric names/units are protocol-version dependent. Empty metrics are unavailable or unenabled, not zero workload.' },
  };
}
