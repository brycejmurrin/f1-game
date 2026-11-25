Fixed: An update reload that the network cannot answer (a deploy in progress, a very slow or lost connection) now drops back to the game instead of leaving the installed iPhone app on an error page with no way to reload (#6627).
Fixed: A failed update no longer leaves a half-downloaded copy of the new build on the device, so it cannot be served offline or take storage space (#6625).
Fixed: If iOS clears the game's offline files but keeps the app installed, the next online launch downloads them again, so offline play comes back without waiting for a new release (#6629).
