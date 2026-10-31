Fixed: online races send each guest one datagram per update instead of two or three (the host's car rides inside the relay packet).
Fixed: less per-frame work drawing cars' active-aero wings, and the AI's decision records keep one shape for the whole race.
Fixed: the helmet-cam visor glint now paints on the live site (it only drew with the developer API loaded).
Fixed: the garage no longer rebuilds its room keys every frame or writes your save on every tune-slider movement.
Fixed: GLX on phones clears its post-effect buffers instead of leaving them undefined (a lead for the iPhone black screen); bloom and blur spread is back to its intended size there.
