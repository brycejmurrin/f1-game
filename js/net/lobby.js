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
      room: $("vs-room"), roomStep: $("vs-room"),
      code: $("vs-code"), codeEntry: $("vs-code-entry"),
      codeHead: $("vs-code-head"), codeHint: $("vs-code-hint"),
      codeShow: $("vs-code-show"), codeValue: $("vs-code-value"),
      codeInputWrap: $("vs-code-input"), codeIn: $("vs-code-in"),
      raceSummary: $("vs-race-summary"), raceNote: $("vs-race-note"),
      editRace: $("vs-edit-race"), editCar: $("vs-edit-car"),
      me: $("vs-me"), them: $("vs-them"),
      ready: $("vs-ready"), start: $("vs-start"),
      invite: $("vs-invite"), inviteIn: $("vs-invite-in"),
      answer: $("vs-answer"), answerIn: $("vs-answer-in"),
      answerHint: $("vs-answer-hint"), answerActions: $("vs-answer-actions"),
      answerWait: $("vs-answer-wait"), answerRaw: $("vs-answer-raw"),
      answerQrWrap: $("vs-answer-qr-wrap"), answerQr: $("vs-answer-qr"),
      scan: $("vs-scan"), scanVideo: $("vs-scan-video"),
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
      for (const k of ["pick", "hosting", "joining", "room", "code"]) if (e[k]) e[k].hidden = (k !== step);
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
        clearInterval(pumpTimer); pumpTimer = null;
        sessions.clear(); session = null;
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
      sessions.clear();
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
      sessions.set(SELF_ONE, session);
      clearInterval(pumpTimer);
      // Every session, not "the" session: a host with three guests has three
      // connections and all of them have to be pumped or the quiet ones look
      // like they dropped.
      pumpTimer = setInterval(() => {
        const now = performance.now();
        for (const s of allSessions()) s.pump(now);
      }, 25);

      // The LATEST hello wins, not the first: a profile is re-sent every time
      // someone changes team or livery in the waiting room, and keeping the
      // first would race the rival's car in whatever they happened to be
      // driving when the connection opened.
      session.onEvent(NetPlay.EV.HELLO, (p) => {
        const from = (p && p.from) || PEER_ONE;
        if (p) _peers.set(from, p);
        // Learning what they picked is the moment a clash becomes knowable.
        resolveSeatClash();
        renderRoom();
      });
      session.onEvent(NetPlay.EV.SETTINGS, (d) => { if (role === "guest") applySettings(d); });
      session.onEvent(NetPlay.EV.READY, (d) => {
        _ready.set((d && d.from) || PEER_ONE, !!(d && d.ready));
        renderRoom();
      });
      // GO is separate from SETTINGS on purpose. Settings now change LIVE while
      // both players sit in the room, so "the host chose a track" and "the host
      // pressed start" have to be different messages — they used to be the same
      // one, which is why arriving settings launched the race immediately.
      session.onEvent(NetPlay.EV.GO, () => { if (role === "guest") beginRace(); });
      // Only reaches the game while WE hold the session — once NetPlay owns it,
      // its own handler does this and the lobby is out of the loop.
      session.onEvent(NetPlay.EV.QUALI, (d) => { if (d && d.t > 0 && G.onPeerQuali) G.onPeerQuali(d); });
      session.sendEvent(NetPlay.EV.HELLO, localProfile());
      if (role === "host") publishSettings();
      openRoom();
    }

    // ---- the waiting room -------------------------------------------------
    // Both players sit here until the host starts. The host owns the race; each
    // player owns their own car. Nothing here reimplements a picker: the
    // buttons open the game's real #select / #race-settings / #carsetup
    // screens, which is how custom teams, liveries and the parts budget come
    // along for free rather than as a second, poorer copy.
    // peerId -> profile, and peerId -> ready. ONE entry today because there is
    // one transport; events do not carry a sender yet, so everything the far
    // side says is filed under PEER_ONE. When Phase C gives each session its own
    // id, only that constant is replaced — every read below is already keyed.
    const PEER_ONE = "peer";
    const _peers = new Map();
    const _ready = new Map();
    // The first (and today only) peer, for the callers and specs that ask about
    // "the other player" in the singular.
    const firstPeer = () => (_peers.size ? [..._peers.values()][0] : null);
    // Everyone we have heard from AT ALL, by either route. Readiness is not
    // conditional on a profile having arrived: READY and HELLO are separate
    // events and either can land first, so keying "who is in the room" off
    // _peers alone left a peer that had said READY but not yet HELLO invisible,
    // and START stayed disabled with both players saying they were done.
    const peerIds = () => new Set([..._peers.keys(), ..._ready.keys()]);
    // Everyone has to be ready, and there has to BE somebody: an empty room
    // where nobody has said anything must not read as unanimous consent.
    const peersReady = () => {
      const ids = [...peerIds()];
      return ids.length > 0 && ids.every((k) => _ready.get(k));
    };
    let selfReady = false;

    function openRoom() {
      selfReady = false;
      _ready.clear();
      show("room");
      // The lobby is a dialog over the menu, and the room is where both players
      // now wait — so it must survive the screens it opens.
      if (G.setNetRoom) G.setNetRoom(true);
      renderRoom();
      say(role === "host"
        ? "Pick the race, then start when you are both ready."
        : "The host is picking the race. Choose your car.");
    }

    function publishSettings() {
      if (!sessions.size || role !== "host") return false;
      // To every guest. The host owns the race, so the settings are one fact
      // that all of them have to receive — a guest that missed it would load a
      // different circuit.
      return broadcast(NetPlay.EV.SETTINGS, {
        track: G.trackIdx,
        laps: G.raceLaps, weather: G.raceWeather, tod: G.raceTimeOfDay,
        quali: !!G.raceQuali,
        difficulty: G.difficulty,
      });
    }

    // Guest: adopt the host's race setup wholesale. Any track/laps/weather the
    // guest had chosen is simply overridden for the session.
    function applySettings(d) {
      if (!d) return;
      if (typeof d.track === "number") G.trackIdx = d.track;
      if (d.laps != null) G.raceLaps = d.laps;
      if (d.quali != null) G.raceQuali = !!d.quali;
      if (d.weather != null) G.raceWeather = d.weather;
      if (d.tod != null) G.raceTimeOfDay = d.tod;
      if (d.difficulty != null) G.difficulty = d.difficulty;
      renderRoom();
    }

    // Called by game.js when a player comes back from the garage or the race
    // settings, so the other side sees the change without anyone pressing
    // anything. A room that only updates on START would let two people spend a
    // minute each choosing a car neither can see.
    function roomChanged(what) {
      if (!session) return false;
      // Resolve BEFORE announcing: a seat can be claimed while you are still in
      // the garage, and what goes on the wire should be the seat you end up in
      // rather than the one you are about to be moved out of. When it fires it
      // sends the hello itself, so this must not send a second.
      if (what === "car") { if (!resolveSeatClash()) broadcast(NetPlay.EV.HELLO, localProfile()); }
      else publishSettings();
      // Changing your mind un-readies you — otherwise READY means "I was happy
      // with something else".
      if (selfReady) setReady(false);
      renderRoom();
      return true;
    }

    function setReady(v) {
      selfReady = !!v;
      if (sessions.size) broadcast(NetPlay.EV.READY, { ready: selfReady });
      renderRoom();
    }

    function peerSeats() {
      const out = [];
      for (const p of _peers.values()) {
        if (p && p.team) out.push({ team: p.team, driver: p.driver || 0 });
      }
      return out;
    }

    // ---- seat exclusivity -------------------------------------------------
    // The garage can only grey out a seat it has ALREADY been told about, so
    // two people picking the same driver in the same instant gets through. The
    // room settles it afterwards, and the rule is a RANK rather than
    // `if (role === "guest")`: you yield to anyone ranked below you. Host is 0
    // and a guest is 1 today; when the room grows past two a guest becomes
    // 1 + join order and host-wins turns into join-order-wins with this line
    // unchanged, which is the whole reason it is written this way.
    function seatRank() { return role === "host" ? 0 : 1; }

    // Seats we would have to move OUT of, as opposed to peerSeats(), which is
    // every other player and is what the garage greys out. The two differ on
    // purpose: you may not PICK a seat someone else is in whatever your rank,
    // but you only YIELD one to somebody who outranks you.
    function blockingSeats() {
      return seatRank() === 0 ? [] : peerSeats();
    }

    const heldBy = (list, teamId, seat) =>
      list.some((s) => s.team === teamId && s.driver === seat);

    const seatName = (teamId, seat) => {
      const t = Teams.LIST.find((x) => x.id === teamId);
      const d = t && t.drivers ? t.drivers[seat] : null;
      return { driver: d ? d.name : "that seat", team: t ? t.short : "" };
    };

    // Where a yielding player goes. The team-mate seat first — they chose that
    // team for a reason and exclusivity is per SEAT, so it is nearly always
    // free — then the first free seat anywhere, walking Teams.LIST in order so
    // both screens would reach the same answer. With two players step one
    // always succeeds; step two is what makes three and four work with no
    // second rule.
    function firstFreeSeat(preferTeamId, blocked) {
      const pref = Teams.LIST.find((t) => t.id === preferTeamId);
      if (pref && pref.drivers) {
        for (let i = 0; i < pref.drivers.length; i++) {
          if (!heldBy(blocked, pref.id, i)) return { team: pref.id, driver: i };
        }
      }
      for (const t of Teams.LIST) {
        // Never move somebody INTO a custom team. makeCars() only puts one on
        // the grid for the player who selected it (js/game.js:1424), so the
        // other screens have no such car to pose them in.
        if (t.custom || !t.drivers) continue;
        for (let i = 0; i < t.drivers.length; i++) {
          if (!heldBy(blocked, t.id, i)) return { team: t.id, driver: i };
        }
      }
      return null;
    }

    // Returns true if it MOVED us. Runs on every hello, so the no-clash path
    // has to be cheap and silent.
    function resolveSeatClash() {
      if (!session) return false;
      const blocked = blockingSeats();
      if (!blocked.length) return false;
      const mine = localProfile();
      if (!heldBy(blocked, mine.team, mine.driver)) return false;
      const move = firstFreeSeat(mine.team, blocked);
      // Every seat on the grid spoken for is not reachable with four players
      // and twenty-odd seats, but silently leaving two cars in one is exactly
      // the failure this function exists to end — so leave the clash standing
      // and say so rather than pretending it resolved.
      if (!move) { say("Every seat is taken. Pick another car.", true); return false; }

      const ti = Teams.LIST.findIndex((t) => t.id === move.team);
      if (ti < 0) return false;
      const was = seatName(mine.team, mine.driver);
      const now = seatName(move.team, move.driver);
      G.teamIdx = ti; G.store.set("team", ti);
      G.driverIdx = move.driver; G.store.set("driver", move.driver);

      // Announced, never silent. #vs-status is already role="status"
      // aria-live="polite", so this reaches a screen reader too. A notice, not
      // an error: nothing failed, somebody was simply quicker.
      say(was.driver + " was taken — you're driving " + now.driver
        + (now.team ? " (" + now.team + ")" : "") + ".");
      broadcast(NetPlay.EV.HELLO, localProfile());
      // Your READY was for a car you are no longer in — the same reasoning
      // roomChanged() uses when you change your own mind.
      if (selfReady) setReady(false);
      // The garage REPLACES the room (openSetup hides #vsfriend), so a hello
      // can land while the chips are the screen — repaint them under the
      // player. The say() above is not lost meanwhile: #vs-status keeps its
      // text, so it is there when cs-done brings the room back.
      const garage = $("carsetup");
      if (garage && !garage.hidden && G.buildSetup) G.buildSetup();
      renderRoom();
      return true;
    }

    const TEAM_OF = (p) => (p && p.team && Teams.LIST.find((t) => t.id === p.team)) || null;

    // team.color is an [r,g,b] triple in 0..1 — the renderer's format, not CSS.
    // Handed to a style attribute raw it silently produces nothing.
    function css(rgb) {
      if (!Array.isArray(rgb)) return "#888";
      const b = rgb.map((v) => Math.max(0, Math.min(255, Math.round(v * 255))));
      return `rgb(${b[0]},${b[1]},${b[2]})`;
    }

    function driverLine(profile, label, ready) {
      const team = TEAM_OF(profile);
      const seat = profile ? (profile.driver || 0) : 0;
      const d = team && team.drivers ? team.drivers[seat] : null;
      // THREE-LETTER codes for both, the way a timing screen does it. Full
      // names spend the column on "Scuderia Ferrari HP" and then truncate the
      // driver — who is the part that says which of the two cars is theirs.
      // The full text stays as a tooltip rather than being lost.
      const who = team ? `${team.short} · ${d ? (d.code || d.name) : "—"}` : "choosing a car…";
      const full = team ? `${team.name}${d ? " · " + d.name : ""}` : "still choosing";
      const swatch = team ? `<span class="vs-swatch" style="background:${css(team.color)}"></span>` : "";
      return `<span class="vs-who">${label}</span>${swatch}`
        + `<span class="vs-car" title="${full}">${who}</span>`
        + `<span class="vs-ready ${ready ? "on" : ""}">${ready ? "READY" : "choosing"}</span>`;
    }

    function renderRoom() {
      const e = els();
      if (!e.roomStep || e.roomStep.hidden) return;
      const host = role === "host";
      const track = (Tracks.LIST && Tracks.LIST[G.trackIdx]) || null;
      const wx = G.raceWeather === "wet" ? "Wet" : G.raceWeather === "dry" ? "Dry" : "Mixed";
      const tod = G.raceTimeOfDay && G.raceTimeOfDay !== "default"
        ? G.raceTimeOfDay.charAt(0).toUpperCase() + G.raceTimeOfDay.slice(1) : "Default";
      if (e.raceSummary) {
        e.raceSummary.innerHTML =
          `<div><dt>Circuit</dt><dd>${track ? (track.name || track.id) : "—"}</dd></div>`
          + `<div><dt>Laps</dt><dd>${G.raceLaps}</dd></div>`
          + `<div><dt>Qualifying lap</dt><dd>${G.raceQuali ? "On" : "Off"}</dd></div>`
          + `<div><dt>Weather</dt><dd>${wx}</dd></div>`
          + `<div><dt>Time</dt><dd>${tod}</dd></div>`;
      }
      if (e.editRace) e.editRace.hidden = !host;
      if (e.raceNote) {
        e.raceNote.textContent = host ? "" : "The host chooses the circuit and conditions.";
        e.raceNote.hidden = host;
      }
      if (e.me) e.me.innerHTML = driverLine(localProfile(), "You", selfReady);
      // A row per other player. #vs-them is a LIST now, so this builds one
      // .vs-driver per peer rather than overwriting a single fixed row — with
      // one peer it renders exactly what it always did.
      //
      // Iterated over peerIds(), not _peers: somebody who has said READY but
      // whose profile has not arrived is still in the room, and showing nothing
      // for them is how you get a START that will not enable with no visible
      // reason why. That ordering is not hypothetical — it is the bug the
      // READY specs caught.
      if (e.them) {
        const ids = [...peerIds()];
        const row = (inner) => `<div class="vs-driver">${inner}</div>`;
        // "Them" while there is one other player, because that is what a person
        // says; P2/P3/P4 once there are several, because "them" no longer picks
        // anybody out.
        e.them.innerHTML = ids.length
          ? ids.map((k, i) => row(driverLine(_peers.get(k) || null,
              ids.length > 1 ? "P" + (i + 2) : "Them", !!_ready.get(k)))).join("")
          : row(driverLine(null, "Them", false));
      }
      if (e.ready) {
        e.ready.textContent = selfReady ? "NOT READY" : "READY";
        e.ready.setAttribute("aria-pressed", selfReady ? "true" : "false");
      }
      if (e.start) {
        // Only the host can start, and only once both have said they are done
        // choosing — a race that begins while someone is still in the garage
        // puts them on the grid in a car they did not pick.
        e.start.hidden = !host;
        e.start.disabled = !(selfReady && peersReady());
      }
    }

    function startFromRoom() {
      if (role !== "host" || !session) return false;
      // "Everyone", not "both" — the sentence has to survive a third player.
      if (!(selfReady && peersReady())) { say("Everyone needs to be ready.", true); return false; }
      publishSettings();
      broadcast(NetPlay.EV.GO, {});
      beginRace();
      return true;
    }

    // Start the race, THEN bind the session to it: NetPlay needs a built track
    // to find grid slots for the two drivers.
    // QUALIFYING COMES BEFORE THE HAND-OFF, which is the whole difficulty.
    //
    // beginRace() used to build the race and hand the connection to NetPlay in
    // one breath. A qualifying session happens BEFORE there is a race to hand
    // over, so with GRID: QUALIFYING the lobby keeps the connection through the
    // session — it is what carries the two lap times — and finishStart() runs
    // only when the players leave the sheet for the grid.
    function beginRace() {
      if (G.raceQuali && G.openQualiForNet) {
        say("Qualifying…");
        if (G.setNetRoom) G.setNetRoom(false);
        try {
          G.flow = "gp";
          G.openQualiForNet(finishStart);   // calls back when TO THE GRID is pressed
        } catch (e) {
          say("Could not start qualifying: " + (e && e.message), true);
          return;
        }
        close();         // the sheet is the screen now — but the SESSION stays open
        return;
      }
      finishStart();
    }

    // Our own driven lap, out over the reliable channel. During qualifying the
    // LOBBY still owns the session — NetPlay has not been handed it yet — so
    // this is the route, and game.js asks whichever of the two currently holds
    // the connection.
    function reportQuali(driverId, t) {
      if (!session || !(t > 0)) return false;
      return broadcast(NetPlay.EV.QUALI, { driverId, t: +t.toFixed(3) });
    }

    function finishStart() {
      say("Starting race…");
      // Out of the room: the game screens go back to behaving normally, or the
      // next visit to the garage would try to return to a lobby that has been
      // replaced by a Grand Prix.
      if (G.setNetRoom) G.setNetRoom(false);
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
        // The whole map, keyed the same way the lobby keyed it, so NetPlay
        // holds one connection per guest exactly as the room did.
        sessions: [...sessions.entries()].map(([id, s]) => ({ id, session: s })),
        session, role,
        peerProfile: firstPeer(),
        peerMods: modsFromProfile(firstPeer()),
        // The list form. NetPlay builds one remote slot per entry, so growing
        // the room is a matter of this array getting longer.
        peers: [..._peers.values()].map((p) => ({ profile: p, mods: modsFromProfile(p) })),
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

    // peerId -> NetSession. One entry today, because there is one transport —
    // but the room is a star: when it holds four players the HOST has three
    // sessions and each guest still has one, to the host. Routing every read
    // through the map now means Phase C's transport work adds entries rather
    // than rewriting this file.
    //
    // NetSession itself is untouched and stays one-per-transport: that is the
    // right shape (one clock estimate, one liveness clock, one handler table
    // per connection). There are simply several of them.
    const sessions = new Map();
    const SELF_ONE = "peer";
    // THE session, for the many call sites that mean "the connection we talk
    // over". On a guest that is the only one there will ever be — the host. On
    // the host today it is the single guest.
    let session = null;
    const allSessions = () => [...sessions.values()];
    // Say something to everyone. On a guest that is the host; on the host it is
    // every guest, which is what makes the relay and the lobby events reach a
    // room rather than a pair.
    function broadcast(type, data) {
      let ok = false;
      for (const s of allSessions()) { try { ok = s.sendEvent(type, data) || ok; } catch (e) {} }
      return ok;
    }
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
      if (res.peer) _peers.set(PEER_ONE, res.peer);
      if (e.answer) e.answer.value = res.code;
      if (e.answerHint) e.answerHint.hidden = false;
      if (e.answerActions) e.answerActions.hidden = false;
      if (e.answerRaw) e.answerRaw.hidden = false;
      // Step 2's placeholder prose is replaced by step 2 itself.
      if (e.answerWait) e.answerWait.hidden = true;
      drawAnswerQr(res.code);
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
      if (res.peer) _peers.set(PEER_ONE, res.peer);
      waitForOpen();
      return res;
    }

    // ---- getting a code IN, by any route ----------------------------------
    // Scan, paste button, paste event and invite link all land here, and all
    // four then behave identically: fill the box and RUN. Requiring a separate
    // confirming tap after a scan would be asking the player to agree with what
    // the camera just did.
    //
    // The invite QR carries a full URL, so a scan of it yields a link rather
    // than a code — unwrap it, and accept a bare code just as happily.
    function codeFrom(text) {
      const raw = String(text || "").trim();
      if (!raw) return "";
      return NetHandshake.inviteFromUrl(raw) || raw;
    }

    function deliver(kind, text) {
      const code = codeFrom(text);
      if (!code) return false;
      const e = els();
      const box = kind === "invite" ? e.inviteIn : e.answerIn;
      if (box) box.value = code;
      return kind === "invite" ? makeAnswer(code) : acceptAnswer(code);
    }

    let scanner = null;

    function stopScan() {
      if (scanner) { scanner.stop(); scanner = null; }
      const e = els();
      if (e.scan) e.scan.hidden = true;
    }

    // kind: "invite" (guest reading the host's screen) | "answer" (host reading
    // the guest's). Same camera, same decoder, different destination.
    async function scan(kind) {
      const e = els();
      if (!e.scan || !e.scanVideo) return { ok: false, error: "no_ui" };
      if (!NetScan.supported()) {
        say("This browser cannot use the camera — paste the code instead.", true);
        return { ok: false, error: "unsupported" };
      }
      stopScan();
      e.scan.hidden = false;
      say("Point the camera at their code…");
      scanner = NetScan.create();
      const res = await scanner.start(e.scanVideo, (text) => {
        stopScan();
        say("Got it.");
        deliver(kind, text);
      });
      if (!res.ok) { stopScan(); say(res.message || "Could not start the camera.", true); }
      return res;
    }

    // One tap instead of focus-select-paste-submit, which is the whole of the
    // remaining friction when the two players are not in the same room.
    async function pasteInto(kind) {
      let text = "";
      try { text = await navigator.clipboard.readText(); }
      catch (err) {
        say("Could not read the clipboard — paste into the box instead.", true);
        return { ok: false, error: "denied" };
      }
      if (!codeFrom(text)) { say("There is no code on the clipboard.", true); return { ok: false, error: "empty" }; }
      return deliver(kind, text);
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
    // Draw `payload` into `canvas`, revealing `wrap` only if it actually
    // encoded. A code too long for any version, or a page with no location to
    // build a URL from, hides the QR rather than showing an unreadable one —
    // the text code beside it still works.
    function paintQr(wrap, canvas, payload) {
      if (!wrap || !canvas) return false;
      const ok = !!(payload && NetQr.draw(canvas, payload, { px: 320 }));
      wrap.hidden = !ok;
      return ok;
    }

    function drawQr(code) {
      return paintQr($("vs-qr-wrap"), $("vs-qr"),
        code ? NetHandshake.inviteUrl(code) : null);
    }
    // The answer QR carries the RAW CODE, not a link. There is no "open this to
    // answer" journey — the host scans it from the very page holding their peer
    // connection, and following a URL would throw that connection away.
    function drawAnswerQr(code) {
      const e = els();
      return paintQr(e.answerQrWrap, e.answerQr, code || null);
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

    // ---- room codes (the BACKUP path) -------------------------------------
    // Same handshake, same codes on the wire — a relay carries the two strings
    // instead of a human. It is hidden unless a relay URL is configured, and it
    // never replaces the link/QR flow: everything else in this game is static
    // files that cannot break, and this one depends on a service somebody has
    // to keep alive. When it fails it must fall back, not fail the lobby.
    let codeWait = null;                 // cancel token for the polling loop

    function stopCodeWait() {
      if (codeWait) codeWait.cancelled = true;
      codeWait = null;
    }

    function showCodeStep(mode, headline, hint) {
      const e = els();
      show("code");
      if (e.codeHead) e.codeHead.textContent = headline;
      if (e.codeHint) e.codeHint.textContent = hint || "";
      if (e.codeShow) e.codeShow.hidden = mode !== "show";
      if (e.codeInputWrap) e.codeInputWrap.hidden = mode !== "input";
    }

    // HOST: make a code, publish the invite under it, wait for the answer.
    async function codeHost() {
      stopCodeWait();
      if (!NetRendezvous.configured()) { say(NO_RELAY, true); return { ok: false, error: "not_configured" }; }
      if (!newTransport("host")) return { ok: false, error: "no_transport", message: noConnectionMsg() };
      const code = NetRendezvous.makeCode();
      showCodeStep("show", "Your room code", "Read this to your friend.");
      const e = els();
      if (e.codeValue) e.codeValue.textContent = code;
      say("Preparing… (this can take a few seconds)");

      const invite = await NetHandshake.createInvite(transport, localProfile());
      if (!invite.ok) { say(invite.message || "Could not create an invite.", true); return invite; }

      say("Waiting for them to join…");
      codeWait = { cancelled: false };
      // One exchange, not a post and a poll: on the public relay both peers
      // meet in a live room and swap strings, and the private mailbox backend
      // is made to look the same from here.
      const got = await NetRendezvous.swap({
        code, mine: invite.code, slot: "offer", want: "answer",
        token: codeWait,
        onTick: () => say("Waiting for them to join… (code " + code + ")"),
      });
      if (!got.ok) {
        if (got.error !== "cancelled") say(got.message, true);
        return got;
      }
      const acc = await NetHandshake.acceptAnswer(transport, got.payload);
      if (!acc.ok) { say(acc.message || "That answer could not be read.", true); return acc; }
      if (acc.peer) _peers.set(PEER_ONE, acc.peer);
      waitForOpen();
      return { ok: true, code };
    }

    // GUEST: fetch the invite the host published, answer it under the same code.
    async function codeJoin(codeIn) {
      stopCodeWait();
      if (!NetRendezvous.configured()) { say(NO_RELAY, true); return { ok: false, error: "not_configured" }; }
      const e = els();
      const raw = codeIn != null ? codeIn : (e.codeIn ? e.codeIn.value : "");
      const code = NetRendezvous.normalise(raw);
      if (!NetRendezvous.valid(code)) {
        say("That is not a room code — six letters and numbers.", true);
        return { ok: false, error: "bad_code" };
      }
      if (!newTransport("guest")) return { ok: false, error: "no_transport", message: noConnectionMsg() };
      say("Looking for that room…");
      // The guest cannot answer until it has SEEN the host's invite, so it
      // hands the exchange a reply function instead of a string: whatever the
      // host posted comes in, and the answer this produces goes back out over
      // the same room without it being torn down in between.
      codeWait = { cancelled: false };
      let answered = null;
      const done = await NetRendezvous.swap({
        code, slot: "answer", want: "offer", token: codeWait,
        onTick: () => say("Looking for that room… (code " + code + ")"),
        reply: async (inviteCode) => {
          say("Found it — answering…");
          const res = await NetHandshake.acceptInvite(transport, inviteCode, localProfile());
          if (!res.ok) { answered = res; return null; }
          if (res.peer) _peers.set(PEER_ONE, res.peer);
          answered = res;
          return res.code;
        },
      });
      if (!done.ok) {
        // A reply that failed has the REAL reason (a stale invite, a build
        // mismatch); the exchange only knows that it did not produce a string.
        const why = (done.error === "reply_failed" && answered && !answered.ok) ? answered : done;
        if (why.error !== "cancelled") say(why.message || "Could not join that room.", true);
        return why;
      }
      waitForOpen();
      say("Joining…");
      return { ok: true, code };
    }

    // Said out loud rather than hidden: whoever sees this is the person who can
    // deploy worker/rendezvous.js and paste its URL into NetRendezvous.
    const NO_RELAY = "Room codes need a relay deployed (worker/rendezvous.js)."
      + " Use the invite link or QR instead — those need nothing.";

    // ---- open / close -----------------------------------------------------
    function open() {
      const e = els();
      if (!e.screen) return false;
      _peers.clear(); _ready.clear();
      show("pick");
      for (const f of ["invite", "inviteIn", "answer", "answerIn"]) if (e[f]) e[f].value = "";
      if (e.answerHint) e.answerHint.hidden = true;
      if (e.answerActions) e.answerActions.hidden = true;
      if (e.answerRaw) e.answerRaw.hidden = true;
      if (e.answerWait) e.answerWait.hidden = false;
      // Reopening must not show the PREVIOUS session's QR — it would point a
      // camera at a peer connection that no longer exists.
      if ($("vs-qr-wrap")) $("vs-qr-wrap").hidden = true;
      if (e.answerQrWrap) e.answerQrWrap.hidden = true;
      stopScan();
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
      // Leaving the screen with the camera still running is the failure this
      // module is most careful about — close() is also the SUCCESS path, since
      // the race starts by closing the lobby.
      stopScan();
      const e = els();
      if (e.screen) e.screen.hidden = true;
    }

    // Abandoning the lobby must tear the half-built connection down, or a
    // stale RTCPeerConnection sits there gathering candidates forever.
    function cancel() {
      stopScan();
      stopCodeWait();
      teardown();
      role = null;
      _peers.clear(); _ready.clear();
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
      on("vs-scan-invite", () => scan("invite"));
      on("vs-scan-answer", () => scan("answer"));
      on("vs-paste-invite", () => pasteInto("invite"));
      on("vs-paste-answer", () => pasteInto("answer"));
      on("vs-scan-cancel", () => { stopScan(); say(""); });
      // The room opens the game's REAL screens. They return here because
      // openGarage/openRaceSettings already take a return target, and game.js
      // routes it back to this dialog while a session is in the room.
      on("vs-edit-race", () => { if (role === "host" && G.openRaceSetup) G.openRaceSetup(); });
      on("vs-edit-car", () => { if (G.openGarageFrom) G.openGarageFrom("vsfriend"); });
      on("vs-ready", () => setReady(!selfReady));
      on("vs-code-host", codeHost);
      on("vs-code-join", () => {
        showCodeStep("input", "Enter their code", "Six letters and numbers.");
        const box = $("vs-code-in");
        if (box) { box.value = ""; box.focus(); }
      });
      on("vs-code-go", () => codeJoin());
      on("vs-code-copy", () => copy(($("vs-code-value") || {}).textContent || ""));
      on("vs-code-share", () => {
        const c = ($("vs-code-value") || {}).textContent || "";
        return handOff({ title: "Apex 26", text: "Race me on Apex 26 — room code " + c }, c);
      });
      on("vs-start", startFromRoom);
      on("vs-close", cancel);
      // A paste straight into the box runs too, so all four routes in behave
      // the same. Deferred a tick because the value is not in the textarea yet
      // while the paste event is being dispatched.
      const onPaste = (id, kind) => {
        const box = $(id);
        if (box) box.addEventListener("paste", () => setTimeout(() => deliver(kind, box.value), 0));
      };
      onPaste("vs-invite-in", "invite");
      onPaste("vs-answer-in", "answer");
      // A camera must not outlive the tab being backgrounded — on a phone that
      // is someone walking away with the light still on.
      document.addEventListener("visibilitychange", () => { if (document.hidden) stopScan(); });
      // No camera, no SCAN button. Unlike the settings grid, this row is built
      // before the screen is ever shown, so nothing reflows under a thumb.
      if (!NetScan.supported()) {
        for (const id of ["vs-scan-invite", "vs-scan-answer"]) {
          const b = $(id);
          if (b) b.hidden = true;
        }
      }
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
      scan, stopScan, pasteInto, deliver,
      codeHost, codeJoin, stopCodeWait,
      // Start watching for the channels to open. Normally called by
      // makeAnswer/acceptAnswer; exported so a test can reach onConnected() —
      // and therefore the waiting room — over a loopback transport, which has
      // no SDP for the handshake to work with but IS open.
      watchForOpen: waitForOpen,
      // The waiting room. roomChanged() is game.js's way back in after a player
      // returns from the garage or the race settings.
      roomChanged, setReady, startFromRoom, renderRoom,
      // Every seat somebody ELSE is in. Built from the profiles the room
      // already exchanges (EV.HELLO, re-sent on every garage exit), so this
      // adds no wire traffic — it only reads what was always being sent.
      peerSeats,
      // Our own qualifying lap goes out through whichever of the lobby and
      // NetPlay currently holds the connection; during the session that is the
      // lobby, because the hand-off has not happened yet.
      reportQuali,
      roomState: () => ({
        open: !!(els().roomStep && !els().roomStep.hidden),
        role, selfReady, peerReady: peersReady(), peer: firstPeer(),
        peers: [..._peers.values()],
      }),
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
