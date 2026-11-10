Fixed: during a live F1 session (OpenF1's free feed pauses from 30 minutes before a session until 30 minutes after it ends) the Data Hub's RESULTS, LIVE, TELEMETRY and WATCH tabs now open the last stored session under a LIVE SESSION IN PROGRESS card instead of failing as "service unavailable"
Fixed: the SCHEDULE tab shows last season, labelled as such, while next year's calendar is not published yet, and an empty calendar is no longer remembered for a day
Fixed: Data Hub tables longer than 30 rows (calendar, standings) are no longer cut off
Fixed: the LIVE tab no longer re-downloads a whole finished session on every visit, its LIVE badge follows the session's real end time, and its "updated" time is the last timing answer
Fixed: the GPS trace export keeps gathering when another Data Hub tab cancels its requests
Fixed: TELEMETRY no longer shows a DRS channel, pill or "DRS —" text for 2026 laps, which have no DRS
Fixed: calendar files keep each race's events when the season is renumbered, instead of overwriting another race's
Fixed: WATCH & DRIVE finds the circuit for Abu Dhabi ("Yas Marina Circuit") and Madrid ("Madring") sessions by their OpenF1 names, not only by the 2026 calendar dates
