Fixed: Raising a race's disconnect grace re-arms a live lobby ICE timer, so a Wi-Fi blip that started in the lobby no longer drops the rival 5 s into the race.
Fixed: Truncated pre-sync state frames no longer replace a held snapshot (or flush garbage when the clock lands).
Fixed: The reliable EVENT backlog under SCTP pressure is capped; a late BYE/GO can still displace the oldest queued critical.
