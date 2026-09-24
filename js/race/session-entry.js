"use strict";
/* One owner for the asynchronous gap before a race or qualifying sheet commits.
 * The scenery request may outlive its menu, and a newer selection supersedes it. */
const SessionEntry = (function () {
  function create() {
    let generation = 0, pending = null;
    function cancel() { generation++; pending = null; }
    function begin(kind, key, prepare, commit, valid, recover) {
      if (pending && pending.kind === kind && pending.key === key) return pending.promise;
      const mine = ++generation;
      const current = () => mine === generation;
      const promise = (async () => {
        try {
          // Start after `pending` is installed. A synchronous prepare failure
          // otherwise runs catch/finally before the assignment below and leaves
          // its already-rejected promise latched as the pending request.
          await Promise.resolve().then(prepare);
          if (!current()) return { kind: "canceled", reason: "superseded" };
          if (!valid()) {
            cancel();
            if (recover) recover();
            return { kind: "canceled", reason: "settings changed" };
          }
          return await commit();
        } catch (e) {
          if (!current()) return { kind: "canceled", reason: "superseded" };
          if (recover) recover(e);
          throw e;
        } finally {
          if (current()) pending = null;
        }
      })();
      pending = { kind, key, promise };
      return promise;
    }
    return { begin, cancel };
  }
  return { create };
})();
Object.freeze(SessionEntry);
