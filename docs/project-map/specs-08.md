# Browser specs map — batch 08

All 160,000 assigned bytes were read in 26 individually returned chunks of at most 8,000 bytes; whole-source manifest hashes match all twelve files. `specs-08-evidence.json` records whole/part/chunk hashes, read provenance, intersecting case and assertion spans, setup, hooks and limitations. Ranges are half-open UTF-8 bytes; lines are inclusive. Assertion sites count lexical `expect` calls, not executions. No tests or browser runs were performed.

Ten files are complete. Montreal covers [4925,11387), beginning inside its foundation assertions; its setup is outside this batch. New hooks covers [0,19465), ending inside the Shanghai-case comment, before its remaining body/assertion. Whole-source AST supplies enclosing case bounds only; it does not establish raw reading of unassigned bytes.

Production navigation used attached apex-lsp: NetPlay links lobby/lazy loading/game; NetLobby links lazy loading/game; Tracks is consumed by game, agent and camera surfaces. MusicLib and SpotifyMusic link the audio panel and lazy loader (untyped window exports caused explicit text-match fallback). GameAudio resolves to the engine declaration; a separate stub declaration exists. Reference counts and limits are in JSON.

## `tests/specs/montreal-foundation.spec.js`

Montreal terrain, emitted scenery and bridge support grounding; finite tight walls and low elevation range.

Unassigned setup belongs to batch 07. Assigned loops cover session diagnostics, support vertices and terrain-footprint samples.

Assigned suffix only: starts inside the foundation case after its setup and initial assertions. AST enclosing bounds do not imply unassigned setup was read. Sampled probes and model diagnostics establish geometry contracts, not visual quality.

| Case source lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 5–205 (partial) | Foundation geometry and landmark contract (assigned assertion suffix) | 28 |

Cleanup: No cleanup in assigned suffix; page lifecycle belongs to enclosing case.

## `tests/specs/monza-foundation.spec.js`

Monza race-frame scenery, timing lines before turns, Roggia dip/Lesmo crest, required landmarks, bank-aware verge terrain, barriers and overhead clearance.

Raw Playwright page; BOOT_MS; race monza/day/dry; profile(240), geometry/model/wall/groundY diagnostics.

One day/dry build and twelve lateral probes; not full road raster or visual sign-off. Sector offsets pinned to built arc, not raw metadata.

| Case source lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 6–116 | keeps terrain, landmarks, water, barriers, and overhead intent valid | 18 |

Cleanup: Fresh page fixture owns teardown; no explicit restoration.

## `tests/specs/multiplayer-lobby.spec.js`

VS FRIEND entry/close/host steps; invalid, empty and wrapped invite codes; identity-only profiles and locally recomputed upgrades; fragment links, clipboard fallback, diagnostic failure text and QR link payload.

sharedTest, lobbyReset, 844x390; fake transport by default. Invite-link test navigates through about:blank and fresh URL. Clipboard recording stub.

Fake loopback avoids ICE gathering. Only construction/close tests real RTCPeerConnection; no NAT or real handshake established. QR test checks symbol dimensions/payload choice, independent decoder is elsewhere.

| Case source lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 54–68 | the REAL transport can be constructed, not just the fake one | 3 |
| 70–79 | the menu has a way in, and it opens the lobby | 5 |
| 81–91 | closing the lobby tears the half-built connection down | 3 |
| 93–106 | hosting moves to the invite step and reports progress | 3 |
| 108–120 | a junk code is refused with an explanation, not a stack trace | 2 |
| 122–128 | an empty box asks for the code rather than failing silently | 1 |
| 130–154 | a short final wrapped fragment reaches the real invite decoder through buttons and paste | 4 |
| 156–170 | the profile on the wire is IDS, never resolved multipliers | 3 |
| 172–193 | a peer's multipliers are recomputed locally from its ids | 4 |
| 195–203 | an unknown team in a profile is refused rather than crashing | 2 |
| 205–242 | the invite goes out as a link, and the link opens straight into joining | 5 |
| 244–274 | SHARE falls back to the clipboard, and says so instead of failing | 5 |
| 276–300 | a failed connection says WHICH failure it was | 5 |
| 302–321 | the QR encodes the invite LINK, not the bare code | 4 |
| 323–333 | sharing before there is a code says so rather than sharing nothing | 2 |

Cleanup: menu resets prior lobby and fake peer. Real transport closed immediately; invite-link lobby closed after navigation. Clipboard stub persists for shared page; no explicit restore shown.

## `tests/specs/multiplayer-npeer.spec.js`

Cross-peer wire identity, byte-sized IDs, exact remote seat without fallback, unknown packet rejection, separate human grid boxes and seatless spectator publication policy.

sharedTest; toMenu/netStop/pinFreePlay; Monza go/jump then netLoopback at 1000ms.

One rival via loopback, virtual time; n-peer data shape does not prove multiple live remote peers or transport.

| Case source lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 44–58 | the lazy net stack exposes seatless spectator policy | 1 |
| 60–77 | a rival is held under a wire id, not a grid index | 6 |
| 79–88 | the rival got the seat it asked for, with no fallback | 2 |
| 90–106 | a packet for an unknown car is dropped, not posed over somebody | 1 |
| 108–122 | the two humans do not start in the same box | 2 |

Cleanup: Next start returns title and stops session; no per-case afterEach.

## `tests/specs/multiplayer-roles.spec.js`

Human/local role split, human bicycle-model state, remote input independence, per-car upgrade braking, identical local versus fed human trajectories.

sharedTest; toMenu/netStop/pinFreePlay Monza; reset seed, promoted AI, carRole/carInput, step and act.

Seeded headless stepping and fixed input; tolerances compare trajectories. This file intentionally has no networking.

| Case source lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 37–54 | the player starts as both human and local; the AI is neither | 5 |
| 56–91 | promoting an AI car to human gives it the bicycle-model state | 8 |
| 93–126 | a non-local human car ignores the local Input entirely | 3 |
| 128–151 | part upgrades are per-car, not shared from the local player | 1 |
| 153–188 | a human car drives identically from local Input and from fed input | 3 |

Cleanup: Remote input comparison clears local input and demotes car; equivalence case restores local role and clears fed input. Next load resets prior session/race.

## `tests/specs/multiplayer-room.spec.js`

Waiting room host permissions, readiness toggle/gating, latest profile and live settings; settings injection rejection; GO race/qualifying transitions, garage/picker replacement and all-screen cleanup; qualifying waits for matching rival lap.

sharedTest; lobbyReset/pinFreePlay; lobbyWatch and HELLO/SETTINGS/READY/GO/QUALI events; 844x390; slow cases allow circuit builds.

Loopback peer events delivered by lobby pump; full host rules and READY required before GO. DOM tap in qualifying tests checks rule, not pointer actionability. netRoom can remain set after room-only cases.

| Case source lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 68–75 | connecting lands in the room, not on the grid | 2 |
| 77–86 | only the host may change the race; the guest is told who does | 4 |
| 88–93 | the host sees the race controls and a START | 3 |
| 95–107 | START is refused until BOTH drivers are ready | 4 |
| 109–117 | READY is a toggle, and un-readying disables START again | 3 |
| 119–129 | the rival's car shows up, and the LATEST choice wins | 3 |
| 131–148 | the guest's room follows the host's settings live | 5 |
| 150–174 | invalid host settings cannot mutate state or inject room markup | 4 |
| 176–187 | GO is what actually starts the guest's race | 1 |
| 189–204 | the garage REPLACES the room rather than opening under it | 4 |
| 206–236 | the host's EDIT RACE is a circuit picker, not a second garage | 9 |
| 238–260 | lights-out clears whatever screen the guest was standing on | 3 |
| 269–280 | the host's GRID choice reaches the guest and is shown | 2 |
| 282–293 | GO opens qualifying instead of the grid, and the lobby keeps the session | 3 |
| 295–334 | TO THE GRID waits for the rival's lap, then races | 6 |

Cleanup: Next enterRoom cancels/rearms lobby and quits prior race. GO checks empty visible screen list. Room-only cases can leave netRoom set until next race.

## `tests/specs/multiplayer-scan-cancel.spec.js`

Leaving an unresolved QR scan by CANCEL, lobby CLOSE or backgrounding stops every live camera track.

Per-test page fixture; serial suite; buildY4m(false), cameraLaunch(config project 0), BOOT_MS, lobbyFake; waits for live srcObject tracks; 300s case budget.

Blank Y4M prevents accidental successful decode from preempting teardown. Fake camera launch and synthetic document.hidden cover lifecycle, not physical hardware.

| Case source lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 79–86 | CANCEL stops the camera | 3 |
| 88–95 | closing the lobby stops the camera | 2 |
| 97–106 | a camera does not survive the tab being backgrounded | 2 |

Cleanup: Tests assert zero live tracks; context teardown isolates permanent hidden getter in last case. Module-scoped generated Y4M managed by camera helper.

## `tests/specs/multiplayer-scan.spec.js`

QR camera pipeline decodes invite into its field and releases stream immediately on success.

Per-test fixture; serial; buildY4m(true), CODE, cameraLaunch; fresh page and fake lobby.

Real browser getUserMedia/video/canvas/jsQR with generated QR photons; loopback prevents handshake. 45s value assertion independent of 300s test budget; loaded runner can still miss decode window.

| Case source lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 93–100 | the camera reads a code and puts it where it belongs | 2 |
| 102–110 | the camera is released the moment it has the code | 3 |

Cleanup: Successful decode hides scanner and leaves zero live tracks; context teardown owns isolation; Y4M helper owns generated camera fixture.

## `tests/specs/multiplayer-seats.spec.js`

Guest yields colliding seat with names and clears READY; host retains priority; teammates unaffected; occupied garage chip/picker markers prevent reuse; solo switching retains normal seat behavior.

sharedTest; lobbyReset/toMenu/pinFreePlay; Red Bull index 3; complete host settings; mySeat and awaitPeer probes.

Two-player rank rule with synthetic HELLO; no live concurrent garage race. Waits for peer delivery to avoid false passing.

| Case source lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 92–115 | the guest yields the seat, and is TOLD it moved | 6 |
| 117–126 | the host keeps its seat | 2 |
| 128–141 | yielding drops READY | 2 |
| 143–152 | team-mates are left alone | 3 |
| 164–179 | a held seat's chip is disabled and says TAKEN | 3 |
| 181–200 | switching team lands on a free seat, not blindly on seat 0 | 3 |
| 202–214 | the picker marks the taken seat before you tap it | 2 |
| 221–230 | no session means no held seats and no disabled chips | 2 |
| 232–246 | solo, switching team still lands on seat 0 | 2 |

Cleanup: Next seatedAs returns title and rewrites store; click route calls toMenu again for residual netRoom. No afterEach shown.

## `tests/specs/multiplayer-session.spec.js`

Session authority, remote pose/road reconstruction/extrapolation, disconnect AI handoff, seeded loss tolerance, synchronized countdown/arm deadline/full lamp sequence, reliable owned laps, host result/flag authority, local-only collision impulse and unchanged local physics.

sharedTest; toMenu/netStop/pinFreePlay; awaits bounded race start verdict with grid tier; headless reset; netLoopback, netPeerSend/Event/Close and netStartArm/HostStart.

In-page loopback and manual virtual netTick/physics clocks; no signalling, second browser or real network. Loss uses fixed seeds; local car equivalence samples one input/seed.

| Case source lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 65–68 | solo racing reports no session at all | 1 |
| 70–86 | starting a session promotes a rival to a second human driver | 5 |
| 88–120 | a rival is posed from packets, not simulated locally | 4 |
| 122–144 | a packet moves the rival to where its owner says it is | 4 |
| 146–161 | a rival's world position is rebuilt from its road position | 2 |
| 163–181 | a rival with speed coasts along the road between packets | 3 |
| 183–212 | when a guest drops, the host keeps the race reconnectable and hands the car to AI | 7 |
| 214–230 | when the host actually leaves, the guest session still ends and its cars return to AI | 5 |
| 232–268 | a session survives a lossy link | 3 |
| 270–292 | both grids are released at the same moment, not the same delay | 4 |
| 294–321 | a peer that arrives late still sees the lights, not just the green | 2 |
| 333–354 | a peer waiting on the moment holds the gantry dark | 3 |
| 356–382 | the host waits for its guest's circuit instead of counting down alone | 2 |
| 384–411 | the arm deadline releases a host whose guest never reports in | 3 |
| 413–457 | a host-named moment plays all five lamps in sequence, not backfilled | 6 |
| 459–479 | a lap time reaches the rival over the reliable channel | 3 |
| 481–498 | a lap time for a driver the peer does not own is refused | 2 |
| 500–539 | the guest adopts the host's classification, not its own | 3 |
| 541–558 | the guest flies the host's flags rather than deciding its own | 3 |
| 560–600 | contact with a rival pushes MY car, and never theirs | 4 |
| 602–627 | the local car is still driven locally, with no correction | 2 |

Cleanup: Next race stops prior session; local equivalence clears inputs and netStop. StartPending consumed after release; disconnect checks car role restoration.

## `tests/specs/music-library.spec.js`

IndexedDB upload persistence/deduplication/removal, valid WAV playback/playlist identity, backend music delegation/exclusion/resume, Spotify dormancy/configuration/redirect URI and Client-ID token invalidation.

Per-test fixture; boot music preference and pointerdown lazy-audio gate; MusicLib hydrate/list; settings dialog/audio details; resetLibrary proves empty store and playlist; in-memory PCM WAV; stub backend/window logs and Spotify request capture.

Fresh contexts, real silent WAV, no audible output assertion. Recording backend tests delegation; Spotify connect never called, no OAuth/SDK playback. Request silence is bounded by observed boot/config windows.

| Case source lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 134–166 | a picked audio file joins the playlist as user:<n> and renders a row | 12 |
| 168–204 | an uploaded track survives a page reload (IndexedDB, not memory) | 6 |
| 206–224 | a non-audio file is refused with a message and never reaches the playlist | 6 |
| 226–243 | picking the same file twice stores it once | 6 |
| 245–267 | the row's remove button drops the track everywhere, permanently | 8 |
| 269–295 | removeTrack keeps currentTrackId on the same song when an EARLIER entry goes | 10 |
| 319–350 | an installed music backend receives every music call | 7 |
| 352–394 | the built-in playlist is silent under a backend and comes back when it goes | 11 |
| 400–437 | with no Client ID stored, Spotify is completely dormant on a full page load | 14 |
| 439–450 | redirectUri() is origin + pathname with no query or hash | 4 |
| 452–470 | redirectUri() strips a query and hash the game was launched with | 4 |
| 472–527 | storing a Client ID arms the feature; clearing it disarms it — with no network either way | 17 |
| 533–565 | changing the Client ID drops the token minted by the previous app | 5 |

Cleanup: Fresh page/context isolates IDB, storage and stubs. Upload removals verified across reload; backend explicitly removed for resume case; Client ID clearing disarms; no explicit restoration for other isolated pages.

## `tests/specs/new-hooks.spec.js`

Debug-hook contracts: cold null/false guards, timing ranges and advance, sector split behavior, race/TT lap history, field schema/order/player/fractions, AI placement guards/reflection, energy clamp/visibility, lap floor/clamp, track profile count/schema/range/elevation.

sharedTest; load reuses boot then race/go/jump. Explicit page.goto supplies cold-state tests. BOOT_MS and 844x390. Profile cases sample Monza, Spa, then partial Shanghai.

Assigned prefix ends inside Shanghai elevation case comment before its remaining body/assertion. Title/schema labels are structural; no claim of that final assertion. Live go/jump cases can advance between host calls; energy write/read intentionally same evaluate.

| Case source lines | Contract / scenario | Assigned assertion sites |
|---|---|---:|
| 34–39 | returns null before a track is loaded | 1 |
| 41–59 | returns an object with all expected fields | 13 |
| 61–67 | pos is between 1 and total | 3 |
| 69–73 | sector is 1, 2, or 3 | 1 |
| 75–80 | gear is between 1 and 8 | 2 |
| 82–87 | energy is between 0 and 1 | 2 |
| 89–95 | raceT advances after stepping physics | 1 |
| 103–108 | returns null before a track is loaded | 1 |
| 110–119 | returns idx, elapsed, bests, last | 6 |
| 121–130 | bests are null before first lap completes | 1 |
| 132–151 | sector index is 0 in S1 and 1 in S2 | 2 |
| 159–164 | returns null before a track is loaded | 1 |
| 166–173 | returns mode, laps, best, lastLap in race mode | 4 |
| 175–184 | TT mode has mode:'tt' | 2 |
| 192–197 | returns null before a track is loaded | 1 |
| 199–204 | returns an array with one entry per car | 2 |
| 206–221 | each entry has required fields | 10 |
| 223–228 | exactly one entry is the player | 1 |
| 230–236 | pos is sequential 1..n and leader has gap 0 | 3 |
| 238–245 | frac values are in [0, 1) | 2 |
| 253–258 | returns false before a track is loaded | 1 |
| 260–269 | returns false when called on the player car | 1 |
| 271–275 | returns false for out-of-range index | 1 |
| 277–288 | places an AI car at the specified fraction | 4 |
| 290–301 | aiPlace result is reflected in fieldState | 1 |
| 309–313 | returns false before a track is loaded | 1 |
| 315–329 | sets energy to the given value | 2 |
| 331–335 | clamps to 0 | 1 |
| 337–341 | clamps to 1 | 1 |
| 343–353 | energy is visible in timing() after setEnergy() | 1 |
| 361–365 | returns false before a track is loaded | 1 |
| 367–373 | sets the player lap counter | 2 |
| 375–379 | clamps negative to 0 | 1 |
| 381–385 | floors fractional input | 1 |
| 387–392 | lap change is visible in timing() | 1 |
| 400–407 | works on the default track loaded at startup (no race() call) | 2 |
| 409–413 | default returns 100 entries | 1 |
| 415–419 | respects custom n | 1 |
| 421–425 | clamps n to max 1000 | 1 |
| 427–437 | each entry has frac, y, k, hw, slope | 5 |
| 439–444 | fracs run from 0 up to just below 1 | 2 |
| 446–450 | all y values are finite numbers | 1 |
| 452–456 | hw (half-width) is positive everywhere | 1 |
| 458–464 | Spa has measurable elevation change (>10 m) | 1 |
| 466–503 (partial) | Shanghai stays flat-by-F1-standards, with a real back-straight crest | 0 |

Cleanup: No afterEach; shared page reloads for cold tests and per-case race starts otherwise. Assigned Shanghai suffix is owned by batch 09.
