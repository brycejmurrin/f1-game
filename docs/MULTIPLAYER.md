# Apex 26 — multiplayer (`js/net/`)

Two to four players over WebRTC, with **no backend**. This was 227 lines inside
`CLAUDE.md` — 18% of the file every agent has to read — and almost none of it is
a convention an agent needs before editing something else. It is the reasoning
behind a set of unobvious choices, which is what a reference doc is for.

`AGENTS.md` keeps the one-paragraph summary and the rules that bind other code;
everything below is the why.

---

### `js/net/transport.js` — `NetTransport`

two channels — "state" (unreliable/unordered: snapshots + inputs; a late
packet is worthless) and "event" (reliable/ordered: lobby, start tick, lap
times, results). loopback() wires two endpoints IN ONE PAGE with injectable
latency/jitter/loss so the netcode is testable with no network at all; rtc()
is the real RTCPeerConnection. Both deliver only on pump(), so latency and
loss are reproducible rather than wall-clock. A TURN RELAY SHIPS BY DEFAULT (a
Metered free-tier credentials URL) because without one two devices ON THE SAME
WI-FI often cannot connect: the only host candidate a browser offers is mDNS-
obfuscated, and when that name will not resolve the sole remaining pair is
srflx-to-srflx, which needs router hairpinning many do not do. The key is
readable in devtools — inherent to client-side TURN, which is why the operator
documents this exact fetch from a browser — and apex26.turnApi overrides it
outright. prefetchIce() must be AWAITED BEFORE a connection is built (lobby's
readyIce()): iceServers are fixed at construction, so a fetch that lands 200
ms later gathers STUN-only and every wire dump reads relay:0 while the relay
is demonstrably alive

### `js/net/sdp.js` — `NetSdp`

the invite code's payload as BYTES. A gathered data-channel SDP is ~700 B of
text and almost none of it is information — we only ever negotiate one m-line,
so every line is either a template constant or one of five facts (fingerprint,
ufrag, pwd, setup role, candidates). Packing those is ~90 B, which takes the
code from ~670 chars to ~240 and is what makes it SCANNABLE rather than merely
pasteable. It never EDITS an SDP — it extracts and rebuilds — and
packChecked() hands the rebuild to a throwaway RTCPeerConnection BEFORE a
human sees it, falling back to the deflated full text if this browser refuses
our own reconstruction. TCP candidates are dropped on purpose. Candidates are
capped at MAX_CANDS and selected ROUND-ROBIN BY KIND (RETAIN, relay first) —
never the first N, because SDP lists them in GATHERING order and relay is
always last, so a plain truncation drops the relay on exactly the machines
with enough interfaces to need one

### `js/net/nostr.js` — `NetNostr`

the room-code rendezvous, over PUBLIC NOSTR RELAYS via a vendored Trystero
(vendor/trystero-0.25.3, MIT, dynamic import()). Nostr and not a public MQTT
broker because accepting arbitrary events from anonymous clients is what a
relay is FOR — HiveMQ's and EMQX's free brokers say outright they must NOT be
used by real applications, and an earlier build did exactly that. SIGNALLING
ONLY: it carries the two invite/answer STRINGS and the race then runs over our
own PC. The DEFAULT path is `directExchange()`: our own WebSockets straight to
the relays, reusing Trystero's framing helpers (createEvent/subscribe) so the
events are well-formed Nostr — the payload sealed with AES-GCM under a key
derived from the room code (`NetRendezvous.seal`/`open`, called on every
exchange), offers and answers on SEPARATE hashed topics so neither side reads
its own message back. The full Trystero room join (createDataChannel("data"),
no options, i.e. reliable+ordered — precisely wrong for snapshots) survives
only as an OPT-IN LEGACY branch behind localStorage apex26.nostrTrystero. The
host posts and waits; the guest passes a `reply` because it cannot answer
until it has seen the invite. ROOM CODES ARE BEST-EFFORT AND THE INVITE LINK
IS NOT: public relays increasingly refuse anonymous ephemeral events with a
NIP-01 OK=false, and getRelaySockets() still reports a refusing relay OPEN
because the WebSocket is. The `all_rejected` detection for that is
LEGACY-BRANCH-ONLY: the vendor turns each refusal into a console.warn and
nothing else, so the legacy exchange() intercepts that warning and reports
`all_rejected` when every live relay has refused — but the default
directExchange() reads only `["EVENT", …]` frames and ignores OK=false, so a
pool refusing every event is a silent wait until the timeout. Measured on
hardware (legacy branch): all six shipped relays healthy, wellorder answering
"blocked: spam not permitted", both players on spinners. Pick relays with
tools/net/nostr-probe.mjs — which tests the only criterion that decides this,
whether a relay accepts an ephemeral event from an UNKNOWN pubkey — never by
reputation or uptime

### `js/net/rendezvous.js` — `NetRendezvous`

room codes — the BACKUP way in, and the only part of the game leaning on
someone else's server. NOTHING TO DEPLOY: a public Nostr relay network is the
default meeting place (js/net/nostr.js), and worker/rendezvous.js (one
Cloudflare Durable Object per code) is an optional upgrade when its URL is
set. On the DEFAULT public path the payload is sealed with AES-GCM under a key
derived from the room code (`seal()`/`open()`, called by
`NetNostr.directExchange` on every exchange) and the room id is a hash of the
code, so a relay operator carries bytes it cannot read and the code is the only
secret.

The optional private Worker path now uses the same browser-side AES-GCM
envelope. `httpPut` sends versioned ciphertext and `httpGet` opens it locally,
so the Worker operator cannot read the SDP it carries. Because a fresh AES-GCM
IV makes even identical retries produce different bytes, the host also sends a
separate random owner capability; the Worker uses that stable capability—not
ciphertext equality—to permit a retry while rejecting another writer. During a
rolling deployment the client can still read a legacy plaintext record and the
Worker accepts legacy payloads, but every new private-relay write is sealed. A
code is DISPOSABLE, not an account: nothing personal is retained and the Worker
deletes the room after two minutes. It carries the SAME invite/answer strings
the manual flow uses, so the relay is a courier and never a participant. Every
call resolves to a typed error, never throws — when the relay is down the lobby
must fall back to the link/QR, which need nothing.
Shown even when unconfigured: a feature that hides itself on an unset URL
guarantees nobody discovers it

### `js/net/qr.js` — `NetQr`

byte-mode, level-L QR ENCODER (versions 1-20, standard mask selection). The
invite QR holds the invite LINK, so the guest scans it with their ORDINARY
CAMERA APP and lands in the lobby with the code already filled in — no in-page
scanner, and none possible: BarcodeDetector is absent on desktop Linux Chrome
and iOS Safari (measured). Encoder only; decoding is an order more code for a
job the OS already does. Verified by jsQR (a devDependency) in
tests/unit/net-qr.test.mjs — self-consistency proves nothing here, since a wrong mask or a
transposed format field produces a picture that looks exactly right and cannot
be read

### `js/net/scan.js` — `NetScan`

reading a QR with the device CAMERA, so the answer stops being a copy/paste.
Two transfers are unavoidable — each side must learn the other's DTLS
fingerprint, and generateCertificate() takes no seed — so the second one is
scanned instead of typed. Carries a VENDORED jsQR (Apache-2.0,
vendor/jsqr-1.4.0, injected ON DEMAND and never in the boot path) because
BarcodeDetector exists on neither iOS Safari nor desktop Linux Chrome, which
is exactly the iOS-to-desktop pairing this is for. stop() kills every track
and is wired to decode, cancel, lobby close and page-hide: a camera outliving
its screen is a privacy bug nothing on screen would reveal

### `js/net/handshake.js` — `NetHandshake`

signalling with no server: vanilla ICE (gather fully, so one static string
suffices) → slimmed SDP → deflate → base64url invite code, pasted between
players. Embeds version.json's build and REFUSES a mismatched peer — different
builds mean different splines, barriers and constants. Scenery is deliberately
not checked (props never affect physics)

### `js/net/snapshot.js` — `NetSnapshot`

the wire format (13 B/car: s/x/head/speed/gear/ lap, quantised to 1 cm and 1
cm/s) + the interpolation buffer. Remote cars draw ~100 ms in the past between
two packets; a late packet EXTRAPOLATES ALONG s, which follows the road by
construction and so cannot dead-reckon a rival into a barrier. s and head both
wrap the short way — getting that wrong sends a car backwards down the lap
once per lap. predict() leads sample(): contact must not be resolved against
the delayed DRAWN pose

### `js/net/session.js` — `NetSession`

clock sync (NTP-style; keeps the LOWEST-RTT sample, since a slow reply is a
queued reply and queuing is pure error), packet routing, typed JSON events,
and a heartbeat, so an abandoned car can be handed back to the AI instead of
standing still on track

### `js/net/netplay.js` — `NetPlay`

the game side (NetPlay.create(G)). AUTHORITY: each peer fully owns its own
car; the host additionally owns the AI and race control. So your own car is
NEVER corrected — no rollback, no reconciliation, no host advantage — at the
cost of the two screens disagreeing by ~1 m under heavy contact. A rival is
POSED from replicated state, so updateCar() early-outs on netPlay.owns(c),
exactly as it already does for an incident-sim takeover. tick() also runs
through the paused gate: one player opening a menu cannot stop a shared world.
UP TO FOUR PLAYERS, in a STAR: the host holds one session per guest and each
guest holds one, to the host. Rivals are a Map keyed by G.wireId(c) =
teamIndex*2 + seat — a byte both peers compute identically, which is what lets
a snapshot say WHICH car it describes. cars[] index cannot: makeCars() drops
the custom team unless the local player picked it, so the grids differ in
length and order. The host RELAYS — guests have no connection to each other,
so it forwards every rival in one multi-entry snapshot, unaltered and under
that guest's own id. Authority does not move; it is a courier. A packet with
an unknown id is DROPPED, never guessed at — which is also how a guest ignores
its own car coming back round the relay

### `js/net/lobby.js` — `NetLobby`

the VS FRIEND screen. INVITES ARE SEQUENTIAL — one negotiation in flight,
INVITE ANOTHER once a guest lands. Not a limit of the wire (createInvite and
rtc() are per-transport) but of people: with several offers outstanding a
pasted answer must be matched to the offer that produced it, and that is the
one thing the person pasting cannot tell you. A guest's profile is filed under
the CONNECTION it arrived on, never a `from` in the payload — a peer that can
name itself can name somebody else. The exception is a guest receiving a
RELAYED roster: there a `from` means the host is speaking for another guest,
and trusting the host is not new trust. Without that relay a guest never
learns the other guests exist, has no slot for them, and drops their packets.
The two code pastes ARE the signalling server — the one thing WebRTC cannot
start without, and the one thing two people already have between them. Opens
the session ITSELF (the guest learns which race to load from the host, so the
session must exist before a track does) and hands it to NetPlay once the race
is up. The profile it sends is part IDS, never resolved multipliers — a peer
declaring {cornering: 9} would simply be faster. Its transport factory is
injectable: an RTCPeerConnection whose ICE never completes spins forever, so a
test that builds one HANGS rather than fails (__apex.lobbyFake)
