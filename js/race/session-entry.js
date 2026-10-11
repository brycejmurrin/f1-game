"use strict";
/* One owner for the asynchronous gap before a race or qualifying sheet commits.
 * The scenery request may outlive its menu, and a newer selection supersedes it.
 *
 * `recover` is the caller's way out of a start that will not happen. It runs when `valid()` fails
 * ("settings changed": the start no longer matches what was asked for) and when prepare/commit throws;
 * it does NOT run when the request is superseded — the newer start owns the screen. startRace passes
 * quitToMenu, so a start that is cancelled for changed settings ends on the title: nothing here hands a
 * previous race back, and the pause RESTART (which has already unpaused it) is no exception. */
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
          // `current` lets a long commit re-check supersession after each of its own awaits.
          return await commit(current);
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
