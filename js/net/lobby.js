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
  const CONNECT_TIMEOUT_MS = 30000;

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
      answerHint: $("vs-answer-hint"), copyAnswer: $("vs-copy-answer"),
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
      role = asRole;
      transport = makeTransport({ role: asRole, name: asRole });
      if (!transport) {
        say("This browser cannot do WebRTC, so it cannot race a friend.", true);
        return null;
      }
      transport.onClose(() => say("Connection closed.", true));
      return transport;
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
        } else if (Date.now() - started > CONNECT_TIMEOUT_MS) {
          clearInterval(pollTimer);
          // Be honest about the most likely cause. Without a TURN relay some
          // networks genuinely cannot be traversed, and telling someone to
          // "try again" forever is worse than saying so.
          say("Could not connect. Some home/mobile networks block direct connections — "
            + "try again, or both switch to a different network.", true);
          try { transport.close(); } catch (e) {}
          transport = null;
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
    async function host() {
      show("hosting");
      if (!newTransport("host")) return;
      say("Preparing invite… (this can take a few seconds)");
      const res = await NetHandshake.createInvite(transport, localProfile());
      if (!res.ok) { say(res.message || "Could not create an invite.", true); return; }
      const e = els();
      if (e.invite) e.invite.value = res.code;
      say("Send that invite code to your friend.");
    }

    function join() {
      // Show the step FIRST: if the transport cannot be created, the error has
      // to land somewhere the player can see, and that is this screen.
      show("joining");
      if (!newTransport("guest")) return;
      say("Paste the invite code they sent you.");
    }

    async function makeAnswer() {
      const e = els();
      const code = e.inviteIn ? e.inviteIn.value : "";
      if (!code.trim()) { say("Paste their invite code first.", true); return; }
      say("Reading invite…");
      const res = await NetHandshake.acceptInvite(transport, code, localProfile());
      if (!res.ok) { say(res.message || "That invite could not be read.", true); return; }
      _peerProfile = res.peer;
      if (e.answer) { e.answer.value = res.code; e.answer.hidden = false; }
      if (e.answerHint) e.answerHint.hidden = false;
      if (e.copyAnswer) e.copyAnswer.hidden = false;
      waitForOpen();
      say("Send that answer code back, then wait for the race to start.");
    }

    async function acceptAnswer() {
      const e = els();
      const code = e.answerIn ? e.answerIn.value : "";
      if (!code.trim()) { say("Paste their answer code first.", true); return; }
      say("Reading answer…");
      const res = await NetHandshake.acceptAnswer(transport, code);
      if (!res.ok) { say(res.message || "That answer could not be read.", true); return; }
      _peerProfile = res.peer;
      waitForOpen();
    }

    async function copy(text) {
      try { await navigator.clipboard.writeText(text); say("Copied."); }
      catch (e) { say("Could not copy — select the code and copy it manually.", true); }
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
      if (e.copyAnswer) e.copyAnswer.hidden = true;
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
      clearInterval(pollTimer);
      clearInterval(pumpTimer);
      pumpTimer = null;
      session = null;
      if (transport) { try { transport.close(); } catch (err) {} }
      transport = null;
      role = null;
      _peerProfile = null;
      close();
    }

    function wire() {
      const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
      on("vs-host", host);
      on("vs-join", join);
      on("vs-make-answer", makeAnswer);
      on("vs-accept", acceptAnswer);
      on("vs-copy-invite", () => copy(($("vs-invite") || {}).value || ""));
      on("vs-copy-answer", () => copy(($("vs-answer") || {}).value || ""));
      on("vs-close", cancel);
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
      localProfile, modsFromProfile, setTransportFactory,
      status: () => ({ role, statusText, connected: !!transport && transport.status === "open" }),
    };
  }

  return { create };
})();
