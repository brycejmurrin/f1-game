"use strict";
const SessionEntry = (function () {
  function create() {
    let generation = 0, pending = null;
    function cancel() { generation++; pending = null; }
    function begin(kind, key, prepare, commit, valid, recover) {
      if (pending && pending.kind === kind && pending.key === key) return pending.promise;
      const mine = ++generation;
      const current = () => mine === generation;
      const canceled = (reason) => ({ kind: "canceled", generation: mine, reason });
      const outcome = (async () => {
        try {
          await Promise.resolve().then(() => current() ? prepare() : undefined);
          if (!current()) return canceled("superseded");
          if (!valid()) {
            cancel();
            if (recover) recover();
            return canceled("settings changed");
          }
          const value = await commit(current);
          if (!current()) return Object.assign(canceled("superseded"), { value });
          return { kind: value === false ? "failed" : "committed", generation: mine, value };
        } catch (e) {
          if (!current()) return canceled("superseded");
          if (recover) recover(e);
          return { kind: "failed", generation: mine, error: e };
        } finally {
          if (current()) pending = null;
        }
      })();
      const promise = outcome.then((r) => {
        if ("error" in r) throw r.error;
        return r.kind === "canceled" && !("value" in r) ? { kind: r.kind, reason: r.reason } : r.value;
      });
      promise.outcome = outcome;
      pending = { kind, key, promise };
      return promise;
    }
    const owns = (r) => !!r && r.generation === generation;
    return { begin, cancel, owns };
  }
  return { create };
})();
Object.freeze(SessionEntry);
