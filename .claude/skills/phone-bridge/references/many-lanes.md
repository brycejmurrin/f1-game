# Several lanes, one phone

Every session posts as the OWNER account, so the page cannot tell lanes apart: it runs every OWNER ` ```apex-cmd `
comment created after its hello, oldest first (`js/agent/apex-bridge.js`). On 2026-11-18 two sessions posted the
same block seconds apart because the hand-over of who drives crossed in flight, and a third lane's request was already queued.

- **One driver.** The bridge issue's body names the driving session's id before Bryce links the phone. Hand-over is a
  body edit by the current driver, and the new driver posts nothing until it has read the edited body. Nobody else
  posts an `apex-cmd` fence; a lane that needs a reading asks the driver in a plain comment naming the command.
- **Read the queue first.** Before posting, count the OWNER `apex-cmd` comments since the newest hello that have no
  reply with a matching `re`. They run before yours.
- **Link, queue, then send him in.** Bryce reads chat on the same phone, and the page neither polls nor draws while
  it is hidden. Commands posted before a hello are never replayed (SKILL.md §2), so the order is: get the hello,
  post every command block, and only then send Bryce ONE message: keep the game in front until the badge reads
  `CLAUDE LINK · <N> · TAP TO END`. N is the number of commands since that hello, other lanes' included; a `batch`
  counts as 1.
- **A new hello after your posts** (a reload, `path`, `bench start`, a cold launch of the Home Screen app) means the
  count restarted at 0 and the queue was dropped. Post the blocks again; never ask him to resend anything.
- **Do not ask mid-run.** A question in chat takes the game off screen. If nothing arrives, wait for the count he
  was given, then read the thread.
