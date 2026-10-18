/* NetSpectate — the role policy shared by NetPlay's seat assignment and send gates. */
"use strict";

const NetSpectate = (function () {
  const DRIVER = "driver";
  const SPECTATOR = "spectator";

  function kind(peer) {
    const value = typeof peer === "string" ? peer : peer && (peer.kind || peer.role);
    return value === SPECTATOR ? SPECTATOR : DRIVER;
  }

  function isSpectator(peer) {
    return kind(peer) === SPECTATOR;
  }

  function canPublish(role) {
    return role !== SPECTATOR;
  }

  return { DRIVER, SPECTATOR, kind, isSpectator, canPublish };
})();
Object.freeze(NetSpectate);
