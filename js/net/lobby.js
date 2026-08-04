/*
 * NetLobby — getting two people into the same race, with no server.
 *
 * This is the piece that makes multiplayer usable by a person rather than by
 * __apex. It owns the #vsfriend screen and drives the whole sequence:
 *
 *   HOST                                  GUEST
 *   createInvite()  ──── code ────────▶   acceptInvite(code)
 *   acceptAnswer(code) ◀─── code ─────    (shows answer)
 *   ...DataChannels open...
 *   send HELLO (profile) ◀──────────▶    send HELLO (profile)
 *   send SETTINGS (track, laps, …) ──▶    applyRaceSettings()
 *   send START (tick)  ──────────────▶    both start together
 *
 * The two code pastes ARE the signalling server. That is the whole reason this
 * design has no backend: WebRTC needs an out-of-band exchange to get started,
 * and two people already have one — chat, SMS, a link. It is clumsier than a
 * room code, and it is free forever with nothing to run or keep up.
 *
 * WHAT THE PROFILE CARRIES, and what it deliberately doesn't. Team, driver,
 * livery and the PARTS SETUP IDS. Ids, never resolved multipliers — since
 * Phase 0 made part upgrades per-car, a peer sending `{cornering: 9}` would
 * simply be faster, so the numbers are always recomputed locally from the ids
 * through the same Parts.getMods() the local car uses. That does not make this
 * cheat-proof (nothing peer-to-peer is), but it means honest clients agree and
 * a tampered one has to work at it.
 *
 * The host owns the race settings for a plain reason: somebody has to, and
 * splitting the choice between two people is a negotiation with no natural
 * winner. The guest's own track/laps/weather selections are simply overridden
 * for the session.
 */
"use strict";

const NetLobby = (function () {
  // 30 s was too tight. A real ICE exchange over mobile data, with a relay
  // candidate in the mix, can legitimately take most of a minute — and this
  // timer starts at the LAST paste, so it is racing a handshake that has
  // already used up its patience elsewhere. A definite `failed` short-circuits
  // it anyway (see waitForOpen), so waiting longer only costs time in the case
  // where there is still hope.
  const CONNECT_TIMEOUT_MS = 60000;

  function create(G) {
    const $ = (id) => document.getElementById(id);
    let transport = null;
    let role = null;
    let pollTimer = null;
    let statusText = "";

    const els = () => ({
      screen: $("vsfriend"),
      pick: $("vs-pick"), hosting: $("vs-hosting"), joining: $("vs-joining"),
      invite: $("vs-invite"), inviteIn: $("vs-invite-in"),
      answer: $("vs-answer"), answerIn: $("vs-answer-in"),
      answerHint: $("vs-answer-hint"), answerActions: $("vs-answer-actions"),
      answerWait: $("vs-answer-wait"),
      status: $("vs-status"),
    });

    function say(msg, isError) {
      statusText = msg || "";
      const e = els().status;
      if (!e) return;
      e.textContent = statusText;
      e.classList.toggle("vs-error", !!isError);
    }

    function show(step) {
      const e = els();
      for (const k of ["pick", "hosting", "joining"]) if (e[k]) e[k].hidden = (k !== step);
    }

    // ---- what we tell the other side about ourselves ----------------------
    function localProfile() {
      const team = Teams.LIST[G.teamIdx] || Teams.LIST[0];
      let setup = null;
      try { setup = G.getTeamParts ? G.getTeamParts(team.id) : null; } catch (e) { setup = null; }
      return {
        team: team.id,
        driver: G.driverIdx || 0,
        // Ids only — see the header. The receiving side recomputes the
        // multipliers itself so a peer cannot simply declare better ones.
        parts: setup,
        livery: (G.getLiveryId ? G.getLiveryId(team.id) : null),
      };
    }

    // Turn a peer's declared ids into multipliers, locally. Falls back to the
    // team's factory numbers if anything about the setup does not resolve —
    // a rival with an odd save must still be raceable.
    function modsFromProfile(p) {
      if (!p || !p.team) return null;
      const team = Teams.LIST.find((t) => t.id === p.team);
      if (!team) return null;
      try { return G.modsFor(team, p.parts || Parts.getFactorySetup(team)); }
      catch (e) { return null; }
    }

    // ---- connection -------------------------------------------------------
    // How a transport gets made is injectable, for the same reason the wire
    // itself is: a test must be able to exercise this screen without building
    // a real RTCPeerConnection. That is not a convenience — a PC whose ICE
    // never completes (a sandboxed CI browser, a locked-down network) spins
    // indefinitely, so a test that constructs one does not fail, it HANGS.
    let makeTransport = (o) => NetTransport.rtc(o);
    function setTransportFactory(fn) { makeTransport = fn || ((o) => NetTransport.rtc(o)); }

    function newTransport(asRole) {
      // Always start from nothing. A previous attempt that timed out leaves a
      // dead RTCPeerConnection behind, and reusing it is how the lobby ended up
      // reporting "WebRTC is unavailable" on a device that had just
      // successfully generated an invite.
      teardown();
      role = asRole;
      transport = makeTransport({ role: asRole, name: asRole });
      if (!transport) {
        say("This browser cannot do WebRTC, so it cannot race a friend.", true);
        return null;
      }
      transport.onClose(() => {
        // A drop AFTER connecting must also stop the lobby's pump, or a 40 Hz
        // timer runs forever holding the whole peer connection alive.
        clearInterval(pumpTimer); pumpTimer = null; session = null;
        say("Connection closed.", true);
      });
      return transport;
    }

    // No live connection is NOT the same as no WebRTC support, and telling a
    // player the wrong one sends them looking for a browser problem that does
    // not exist.
    function noConnectionMsg() {
      return NetTransport.supported()
        ? "That attempt has ended. Tap HOST A RACE or JOIN A FRIEND to start over."
        : "This browser cannot do WebRTC, so it cannot race a friend.";
    }

    function teardown() {
      clearInterval(pollTimer);
      clearInterval(pumpTimer);
      pumpTimer = null;
      session = null;
      if (transport) { try { transport.close(); } catch (e) {} }
      transport = null;
    }

    // "It didn't work" is not an answer a player can act on, and the two ways
    // this fails need OPPOSITE responses. Which one happened is decided by
    // whether we ever learnt our own public address:
    //
    //   no srflx candidate  -> STUN never answered. The network is filtering
    //                          it, and a different network genuinely may work.
    //   srflx but no path   -> both sides know both addresses and the packets
    //                          still will not flow: symmetric NAT. Switching
    //                          Wi-Fi will not help; only a relay does, and a
    //                          relay costs someone money to run. Saying "try
    //                          again" here would send them round a loop that
    //                          cannot succeed.
    //
    // The stale case is the one worth catching separately, because our own
    // design causes it: the codes are carried by a human, and a NAT's UDP
    // mapping expires in about a minute. Take too long over the paste and the
    // addresses in the code are simply no longer valid.
    function failureMsg(st, secs) {
      const c = (st && st.candidates) || {};
      const last = st ? " (" + st.ice + "/" + st.connection + ")" : "";
      const slow = secs > 90;
      if (!c.srflx && !c.relay) {
        return "Could not connect after " + secs + "s" + last + "."
          + " This network never revealed a public address, so the other side had"
          + " nothing to reach. Try again on a different network — mobile data"
          + " often works where guest or office Wi-Fi does not.";
      }
      if (slow) {
        return "Could not connect after " + secs + "s" + last + "."
          + " The invite probably went stale — the addresses in a code stop working"
          + " after a minute or so. Start a new invite and paste the answer back"
          + " more quickly.";
      }
      return "Could not connect after " + secs + "s" + last + "."
        + " Both sides found an address but the direct link was blocked, which"
        + " usually means one of the networks needs a relay to get through."
        + (st && st.turn ? "" : " Racing over the same Wi-Fi is the reliable fix.");
    }

    // Poll for the DataChannels opening. There is no event that means "the
    // whole session is ready" — each channel opens separately — so the
    // transport raises open only once BOTH are up, and this waits for that.
    function waitForOpen() {
      clearInterval(pollTimer);
      const started = Date.now();
      say("Connecting…");
      pollTimer = setInterval(() => {
        if (!transport) { clearInterval(pollTimer); return; }
        if (transport.status === "open") {
          clearInterval(pollTimer);
          onConnected();
          return;
        }
        // Surface the ICE/connection state while we wait. This is the only
        // window into a handshake that cannot be reproduced in any test here,
        // so when it stalls the player can say WHERE rather than just "it
        // didn't work".
        const st = transport.stats ? transport.stats() : null;
        const secs = Math.round((Date.now() - started) / 1000);
        if (st) say("Connecting… " + secs + "s (" + (st.ice || "?") + "/" + (st.connection || "?") + ")");

        // A definite `failed` is final — ICE has exhausted every pair. Waiting
        // out the rest of the timer after that just makes the player watch a
        // spinner for a verdict already delivered. `disconnected` is NOT final:
        // it can recover on its own, so it keeps waiting.
        const dead = st && (st.ice === "failed" || st.connection === "failed");
        if (dead || Date.now() - started > CONNECT_TIMEOUT_MS) {
          clearInterval(pollTimer);
          say(failureMsg(st, secs), true);
          teardown();
          show("pick");            // leave the lobby usable, not dead
        }
      }, 250);
    }

    // The lobby runs BEFORE either side has a track loaded — which is the whole
    // point, since the guest learns which race to load from the host. So the
    // session is opened here and pumped on a short interval of its own; once
    // the race is up, NetPlay adopts the same session and the game loop takes
    // over pumping it at frame rate.
    function onConnected() {
      say("Connected.");
      session = NetSession.create({ transport });
      clearInterval(pumpTimer);
      pumpTimer = setInterval(() => { if (session) session.pump(performance.now()); }, 25);

      session.onEvent(NetPlay.EV.HELLO, (p) => { _peerProfile = _peerProfile || p; });
      session.onEvent(NetPlay.EV.SETTINGS, (d) => { if (role === "guest") applySettings(d); });
      session.sendEvent(NetPlay.EV.HELLO, localProfile());

      if (role === "host") {
        // The host owns the race setup: somebody has to, and splitting it
        // between two people is a negotiation with no natural winner.
        session.sendEvent(NetPlay.EV.SETTINGS, {
          track: G.trackIdx,
          laps: G.raceLaps, weather: G.raceWeather, tod: G.raceTimeOfDay,
          difficulty: G.difficulty,
        });
        beginRace();
      } else {
        say("Waiting for the host to pick the race…");
      }
    }

    // Guest: adopt the host's race setup wholesale. Any track/laps/weather the
    // guest had chosen is simply overridden for the session.
    function applySettings(d) {
      if (!d) return;
      if (typeof d.track === "number") G.trackIdx = d.track;
      if (d.laps != null) G.raceLaps = d.laps;
      if (d.weather != null) G.raceWeather = d.weather;
      if (d.tod != null) G.raceTimeOfDay = d.tod;
      if (d.difficulty != null) G.difficulty = d.difficulty;
      beginRace();
    }

    // Start the race, THEN bind the session to it: NetPlay needs a built track
    // to find grid slots for the two drivers.
    function beginRace() {
      say("Starting race…");
      try {
        // A friend race is a one-off Grand Prix, never a championship round
        // or a time trial. flow/session are the authority (game.js:587).
        G.flow = "gp";
        G.session = "race";
        G.startRace();
      } catch (e) {
        say("Could not start the race: " + (e && e.message), true);
        return;
      }
      const started = G.netPlay.start({
        session, role,
        peerProfile: _peerProfile,
        peerMods: modsFromProfile(_peerProfile),
      });
      clearInterval(pumpTimer);          // the game loop pumps it from here on
      pumpTimer = null;
      session = null;                    // owned by NetPlay now
      if (!started.ok) { say(started.message || "Could not start the session.", true); return; }
      // Host names the instant of lights-out; the guest receives it as an
      // event and both drive their countdown to the same moment. Without this
      // each side counts down on its own clock and the grids are released
      // however far apart the handshake happened to take.
      if (role === "host") G.netPlay.hostStart();
      close();
    }

    let _peerProfile = null;
    let session = null;
    let pumpTimer = null;

    // ---- the four buttons -------------------------------------------------
    // host/join/makeAnswer/acceptAnswer all RETURN their result as well as
    // rendering it. The DOM is the player's view of the handshake, not the
    // only way to reach it — without a return value the sole way to drive this
    // is clicking buttons and scraping textareas, which is exactly the kind of
    // test that fights actionability instead of exercising WebRTC.
    async function host() {
      show("hosting");
      if (!newTransport("host")) return { ok: false, error: "no_transport", message: noConnectionMsg() };
      say("Preparing invite… (this can take a few seconds)");
      const res = await NetHandshake.createInvite(transport, localProfile());
      if (!res.ok) { say(res.message || "Could not create an invite.", true); return res; }
      const e = els();
      if (e.invite) e.invite.value = res.code;
      const scannable = drawQr(res.code);
      say(scannable
        ? "Send them the link, or have them scan the code."
        : "Send that invite code to your friend.");
      return res;
    }

    function join() {
      // Show the step FIRST: if the transport cannot be created, the error has
      // to land somewhere the player can see, and that is this screen.
      show("joining");
      if (!newTransport("guest")) return;
      say("Paste the invite code they sent you.");
    }

    async function makeAnswer(codeIn) {
      const e = els();
      const code = codeIn != null ? codeIn : (e.inviteIn ? e.inviteIn.value : "");
      if (codeIn != null && e.inviteIn) e.inviteIn.value = codeIn;
      if (!code.trim()) { say("Paste their invite code first.", true); return { ok: false, error: "empty" }; }
      if (!transport) { say(noConnectionMsg(), true); return { ok: false, error: "no_transport" }; }
      say("Reading invite…");
      const res = await NetHandshake.acceptInvite(transport, code, localProfile());
      if (!res.ok) { say(res.message || "That invite could not be read.", true); return res; }
      _peerProfile = res.peer;
      if (e.answer) { e.answer.value = res.code; e.answer.hidden = false; }
      if (e.answerHint) e.answerHint.hidden = false;
      if (e.answerActions) e.answerActions.hidden = false;
      // Step 2's placeholder prose is replaced by step 2 itself.
      if (e.answerWait) e.answerWait.hidden = true;
      waitForOpen();
      say("Send that answer code back, then wait for the race to start.");
      return res;
    }

    async function acceptAnswer(codeIn) {
      const e = els();
      const code = codeIn != null ? codeIn : (e.answerIn ? e.answerIn.value : "");
      if (codeIn != null && e.answerIn) e.answerIn.value = codeIn;
      if (!code.trim()) { say("Paste their answer code first.", true); return { ok: false, error: "empty" }; }
      if (!transport) { say(noConnectionMsg(), true); return { ok: false, error: "no_transport" }; }
      say("Reading answer…");
      const res = await NetHandshake.acceptAnswer(transport, code);
      if (!res.ok) { say(res.message || "That answer could not be read.", true); return res; }
      _peerProfile = res.peer;
      waitForOpen();
      return res;
    }

    async function copy(text) {
      if (!text) { say("There is nothing to copy yet.", true); return false; }
      try { await navigator.clipboard.writeText(text); say("Copied."); return true; }
      catch (e) { say("Could not copy — select the code and copy it manually.", true); return false; }
    }

    // ---- handing the code to a human --------------------------------------
    // The invite goes out as a LINK, not a code: opening it drops the guest
    // straight into joining with the box already filled (see wire()), which
    // removes the "paste this into the right field" step entirely. The code
    // rides in the fragment, so it never reaches a server — which matters
    // because the entire design is that there ISN'T one.
    //
    // The ANSWER is shared as bare text on purpose. There is no "open this to
    // answer" flow — the host pastes it into a box they already have open — so
    // dressing it as a link would promise a journey that does not exist.
    //
    // navigator.share is a progressive enhancement: where it exists this opens
    // the OS share sheet (Messages, WhatsApp, AirDrop), and where it doesn't we
    // fall back to the clipboard. The button says which it will do rather than
    // disappearing, because a control that vanishes reflows the sheet and the
    // next tap lands on something else.
    const canShare = () => typeof navigator !== "undefined" && !!navigator.share;

    async function handOff(data, fallbackText) {
      if (!fallbackText) { say("There is nothing to share yet.", true); return false; }
      if (canShare()) {
        try { await navigator.share(data); say("Shared."); return true; }
        catch (e) {
          // Closing the share sheet is a decision, not a failure — say nothing
          // and leave the code on screen.
          if (e && e.name === "AbortError") return false;
        }
      }
      return copy(fallbackText);
    }

    // The QR carries the invite LINK, not the code, and that distinction is the
    // whole feature: a link scanned by the guest's ordinary camera app opens
    // the game with the joining step showing and the code already filled in. A
    // QR of the bare code would just show them 240 characters to retype.
    //
    // No in-page scanner anywhere. BarcodeDetector is absent on desktop Linux
    // Chrome and on iOS Safari (measured), so scanning ourselves would serve a
    // minority while the OS camera serves nearly everyone.
    function drawQr(code) {
      const wrap = $("vs-qr-wrap"), canvas = $("vs-qr");
      if (!wrap || !canvas) return false;
      const url = code ? NetHandshake.inviteUrl(code) : null;
      // A code too long to encode, or a page with no location to build a URL
      // from, hides the QR rather than showing an unreadable one — the text
      // code below it still works.
      const ok = !!(url && NetQr.draw(canvas, url, { px: 320 }));
      wrap.hidden = !ok;
      return ok;
    }

    function shareInvite() {
      const e = els();
      const code = e.invite ? e.invite.value : "";
      const url = code ? NetHandshake.inviteUrl(code) : null;
      // No location to build a URL from (a file:// page): share the code itself
      // rather than the string "null".
      if (!url) return handOff({ title: "Apex 26", text: code }, code);
      return handOff({ title: "Apex 26", text: "Race me on Apex 26", url }, url);
    }

    function shareAnswer() {
      const code = (els().answer || {}).value || "";
      return handOff({ title: "Apex 26 answer", text: code }, code);
    }

    // ---- open / close -----------------------------------------------------
    function open() {
      const e = els();
      if (!e.screen) return false;
      _peerProfile = null;
      show("pick");
      for (const f of ["invite", "inviteIn", "answer", "answerIn"]) if (e[f]) e[f].value = "";
      if (e.answer) e.answer.hidden = true;
      if (e.answerHint) e.answerHint.hidden = true;
      if (e.answerActions) e.answerActions.hidden = true;
      if (e.answerWait) e.answerWait.hidden = false;
      // Reopening must not show the PREVIOUS session's QR — it would point a
      // camera at a peer connection that no longer exists.
      if ($("vs-qr-wrap")) $("vs-qr-wrap").hidden = true;
      // Re-fold the raw code: it is the fallback, and an open disclosure from
      // last time makes the sheet open on three lines of base64.
      const raw = document.querySelector("#vs-hosting .vs-raw");
      if (raw) raw.open = false;
      say("");
      e.screen.hidden = false;
      return true;
    }

    function close() {
      clearInterval(pollTimer);
      const e = els();
      if (e.screen) e.screen.hidden = true;
    }

    // Abandoning the lobby must tear the half-built connection down, or a
    // stale RTCPeerConnection sits there gathering candidates forever.
    function cancel() {
      teardown();
      role = null;
      _peerProfile = null;
      close();
    }

    function wire() {
      const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
      on("vs-host", host);
      on("vs-join", join);
      // Called with NO argument on purpose. Both take an optional code so a
      // test can drive the handshake without scraping textareas — and wiring
      // them as bare handlers passes the CLICK EVENT as that code, which is not
      // null, so the textarea is ignored and code.trim() throws on a MouseEvent.
      // The visible symptom is the opposite of a crash: pasting junk silently
      // does nothing instead of explaining itself.
      on("vs-make-answer", () => makeAnswer());
      on("vs-accept", () => acceptAnswer());
      on("vs-copy-invite", () => copy(($("vs-invite") || {}).value || ""));
      on("vs-copy-answer", () => copy(($("vs-answer") || {}).value || ""));
      on("vs-share-invite", shareInvite);
      on("vs-share-answer", shareAnswer);
      on("vs-close", cancel);
      // Name the button after what it will actually do on THIS device. With no
      // share sheet it copies the link, and a button labelled SHARE that
      // silently copies is a button that has lied. SHARE LINK and COPY CODE
      // stay distinct even then, because they hand over different things.
      const si = $("vs-share-invite");
      if (si && !canShare()) si.textContent = "COPY LINK";
      // The answer is the same string either way, so without a share sheet the
      // two buttons would be one button twice. Decided once here, at boot,
      // before the screen is ever shown — not a reflow under someone's thumb.
      const sa = $("vs-share-answer");
      if (sa && !canShare()) sa.hidden = true;
      // An invite link puts the code in the fragment, so opening one should
      // drop straight into joining rather than making them find the button.
      const fromUrl = NetHandshake.inviteFromUrl();
      if (fromUrl) {
        open();
        join();
        const box = $("vs-invite-in");
        if (box) box.value = fromUrl;
      }
      return true;
    }

    return {
      wire, open, close, cancel, host, join, makeAnswer, acceptAnswer,
      shareInvite, shareAnswer, canShare,
      localProfile, modsFromProfile, setTransportFactory,
      failureMsg,
      status: () => ({
        role, statusText,
        connected: !!transport && transport.status === "open",
        // The live ICE/connection state and the CANDIDATE TYPES — the only
        // window into a handshake that no in-process test can reproduce, and
        // the difference between "this network blocks STUN" and "these two
        // networks need a relay", which look identical from the outside.
        wire: transport && transport.stats ? transport.stats() : null,
      }),
    };
  }

  return { create };
})();
