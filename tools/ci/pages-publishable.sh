#!/usr/bin/env bash
# @doc Pages monotonic guard: true when the live apex-sha is an ancestor of the given commit, else false.
# @section runner
#
# pages-publishable.sh <commit-sha> <site-url>
#
# The Pages workflow tests ONE commit and publishes THAT commit's artifact, so
# the only remaining way to move the live site backwards is an older run that
# reaches the deploy step after a newer one has published. This answers "may
# this commit still be published?" from the one source that knows what is
# live: the <meta name="apex-sha"> the deploy stamps into index.html.
#
#   live sha unreadable        -> true  (after 3 reads 2 s apart; warned; a CDN hiccup must not wedge
#                                 deploys, and the check runs again under the
#                                 Pages lock before anything is published)
#                                 With --strict: false. The SECOND call, under
#                                 the Pages lock, is the last thing between a
#                                 stale run and a live rollback, so there an
#                                 unreadable live sha is a refusal, not a pass
#                                 (2026-09-22). The unlocked first call stays
#                                 fail-open: it only decides whether to enter
#                                 the environment, never whether to publish.
#   live sha == commit         -> false (already live)
#   live sha ancestor of commit-> true  (publishing moves the site forward)
#   anything else              -> false (a newer build is live, or history
#                                 diverged; publishing could move it back)
#
# Only the verdict goes to stdout, so a caller can write
# `publish=$(bash tools/ci/pages-publishable.sh ...)` straight into
# $GITHUB_OUTPUT; the reasoning goes to stderr, where the job log shows it.
# Needs a checkout deep enough to hold the live commit (fetch-depth: 0).
set -eu
STRICT=0
for a in "$@"; do [ "$a" = "--strict" ] && STRICT=1; done
set -- $(for a in "$@"; do [ "$a" = "--strict" ] || printf '%s\n' "$a"; done)
SHA="${1:?commit sha}"
SITE_URL="${2:?site url}"

# The read is retried before it counts as unreadable (#7261, decision 7249-10 A):
# under --strict an empty read refuses the deploy and pages.yml exits 1, so ONE
# github.io blip used to turn the tip red. The loop, not curl's --retry, owns
# the retries: --retry cannot see a 200 whose body has no apex-sha (a CDN edge
# serving a partial shell), and stacking both would make 3 tries 12. Exactly
# PAGES_READ_TRIES reads, PAGES_READ_DELAY s apart, then the verdict below is
# what it always was. (Both knobs exist for the unit test, which stubs curl.)
PAGES_READ_TRIES="${PAGES_READ_TRIES:-3}"
PAGES_READ_DELAY="${PAGES_READ_DELAY:-2}"
live_sha=""
try=1
while :; do
  live_html="$(curl -fsS --max-time 20 "${SITE_URL%/}/index.html?_=$$-$try" 2>/dev/null || true)"
  live_sha="$(printf '%s' "$live_html" | sed -n 's/.*<meta name="apex-sha" content="\([0-9a-f]\{40\}\)".*/\1/p' | head -n 1)"
  [ -n "$live_sha" ] && break
  [ "$try" -ge "$PAGES_READ_TRIES" ] && break
  echo "live apex-sha read $try/$PAGES_READ_TRIES empty at ${SITE_URL}; retrying in ${PAGES_READ_DELAY}s" >&2
  sleep "$PAGES_READ_DELAY"
  try=$((try + 1))
done

if [ -z "$live_sha" ]; then
  if [ "$STRICT" = 1 ]; then
    echo "::error::live apex-sha unreadable at ${SITE_URL} after $PAGES_READ_TRIES reads under the Pages lock; refusing to publish $SHA blind (--strict)" >&2
    echo false; exit 0
  fi
  echo "::warning::live apex-sha unreadable at ${SITE_URL}; publishing $SHA without the monotonic check" >&2
  echo true; exit 0
fi
if [ "$live_sha" = "$SHA" ]; then
  echo "already live: $SHA" >&2
  echo false; exit 0
fi
if git cat-file -e "${live_sha}^{commit}" 2>/dev/null && git merge-base --is-ancestor "$live_sha" "$SHA"; then
  echo "live $live_sha is an ancestor of $SHA — publishing moves the site forward" >&2
  echo true; exit 0
fi
echo "NOT PUBLISHABLE: live $live_sha is not an ancestor of $SHA — a newer build is already live, or history diverged" >&2
echo false
