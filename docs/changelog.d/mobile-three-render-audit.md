Fixed: Quitting a race while Three.js warms its shaders now releases the rear-view mirror target when warm-up finishes.
Improved: The Three.js lamp grid scans the current frame’s chunked geometry submissions. Mobile races with many car and effect draws spend less CPU work locating track lighting.
Fixed: Track lighting updates when replacement lamp groups have the same count or a track reuses its light buffer with new positions.
Improved: Updating a Three.js lamp grid avoids clearing 832 KiB of CPU-side texture data on each rebuild.
Fixed: Shader warm-up preserves live effect targets, and a resized mirror only starts displaying its new image after a successful render.
Fixed: Switching gamepads preserves controller-specific mappings and avoids phantom presses on reconnect. Spare controllers take fewer button reads.
Fixed: Switching songs cancels superseded loads and releases idle streamed media. Music resumes at the position where the page was hidden, and single-song playlists repeat from the beginning.
Fixed: Telemetry braking comparisons accept complete zones before a later outage. GPS dots disappear across measured coverage gaps.
Improved: Browsing circuits reuses the ghost store’s budget check, and selecting the current time of day avoids rebuilding the circuit.
Fixed: Saving or clearing an input ghost keeps other circuits’ tapes when another tab has written them and its storage notification is still queued.
