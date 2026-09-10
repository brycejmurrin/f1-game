#!/usr/bin/env bash
# @doc Prints the live site's `apex-sha` (the commit stamped into index.html), or nothing if unreadable; never fails.
# @section runner
#
# pages-live-sha.sh <site-url>
#
# The one source that knows what is live is the shell the deploy published:
# `<meta name="apex-sha">` in index.html. The release train reads it to decide
# whether anything new exists to publish and to diff the gate against exactly
# what is live. An unreadable site prints nothing; callers treat that as
# "unknown" and fail safe (run everything, publish).
set -u
SITE_URL="${1:?site url}"
curl -fsS --max-time 20 "${SITE_URL%/}/index.html?_=$$" 2>/dev/null \
  | sed -n 's/.*<meta name="apex-sha" content="\([0-9a-f]\{40\}\)".*/\1/p' | head -n 1
exit 0
