#!/usr/bin/env bash
# @doc Installs CI apt packages without the mirror when it can: none if dpkg has them, cached .debs, then bounded apt.
# Full description (#5519, 2026-11-11): from about 13:50Z a runner apt mirror / DNS outage
# ("Temporary failure resolving 'security.ubuntu.com'") failed every browser leg in the
# mesa-xvfb step and the lint job in `Install lint binaries`, before any spec ran: each leg
# spent about five minutes on three apt attempts and turned its PR red. The order here makes
# that outage cost nothing when the job has what it needs, and seconds when it does not:
#   1. every package already installed (dpkg-query)        -> no apt, no network, exit 0
#   2. the .debs in --cache DIR cover the missing ones      -> `dpkg -i` offline, exit 0
#   3. no apt source host resolves (getent)                 -> fail at once: "runner package
#      mirror unreachable", exit 3, instead of three five-minute apt attempts
#   4. bounded apt (the mesa-xvfb rules of 2026-09-30 and 2026-11-10: per-call caps, one
#      shared --budget, `dpkg --configure -a` after a cut-short attempt); the .debs apt
#      fetched stay in --cache DIR (Dir::Cache::Archives) for the caller's actions/cache save,
#      and `populated=1` goes to $GITHUB_OUTPUT so the caller saves only then.
# A post-condition re-checks dpkg: nothing here reports success with a package missing.
# Measured on job 130492997085 (2026-11-11, passing): the image already carries xvfb and
# libgl1-mesa-dri; apt fetched 8 .debs (libegl1, libgles2, mesa-utils + their deps).
#
# usage: bash tools/ci/apt-cached-install.sh [--label L] [--cache DIR] [--budget S] [--plan] pkg...
#   --plan  print the missing packages (also `missing=` to $GITHUB_OUTPUT) and exit 0.
# Test seams (tests/unit/apt-cached-install.test.mjs): APT_SUDO (default: sudo unless root),
# APT_SOURCES (apt source files/dirs), APT_RETRY_SLEEP (seconds between attempts, default 10).
# @section runner
set -uo pipefail
LABEL=apt; CACHE=""; BUDGET=300; PLAN=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --label) LABEL=$2; shift 2 ;;
    --cache) CACHE=$2; shift 2 ;;
    --budget) BUDGET=$2; shift 2 ;;
    --plan) PLAN=1; shift ;;
    -h|--help) sed -n '2,2p' "$0"; exit 0 ;;
    --) shift; break ;;
    -*) echo "$LABEL: unknown flag $1" >&2; exit 2 ;;
    *) break ;;
  esac
done
PKGS=("$@")
[[ ${#PKGS[@]} -gt 0 ]] || { echo "usage: apt-cached-install.sh [--label L] [--cache DIR] [--budget S] [--plan] pkg..." >&2; exit 2; }
if [[ -n ${APT_SUDO+x} ]]; then SUDO=$APT_SUDO; elif [[ $(id -u) -ne 0 ]]; then SUDO=sudo; else SUDO=""; fi
read -r -a SOURCES <<< "${APT_SOURCES:-/etc/apt/sources.list /etc/apt/sources.list.d}"
RETRY_SLEEP=${APT_RETRY_SLEEP:-10}

out() { if [[ -n ${GITHUB_OUTPUT:-} ]]; then echo "$1" >> "$GITHUB_OUTPUT"; fi; }
installed() { dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q '^install ok installed$'; }
missing() { local p; for p in "${PKGS[@]}"; do installed "$p" || printf '%s\n' "$p"; done; }

mapfile -t MISS < <(missing)
if [[ $PLAN == 1 ]]; then out "missing=${MISS[*]}"; echo "${MISS[*]}"; exit 0; fi
if [[ ${#MISS[@]} -eq 0 ]]; then
  echo "$LABEL: all ${#PKGS[@]} packages already installed (no apt, no network)"
  exit 0
fi
echo "$LABEL: missing ${MISS[*]}"

# 2. Offline from the cache. Only .debs whose package is not installed: never downgrade what the
# image ships. A partial or broken set is undone (dpkg --remove) so apt starts from a clean state.
if [[ -n $CACHE && -d $CACHE ]]; then
  debs=(); names=()
  for f in "$CACHE"/*.deb; do
    [[ -e $f ]] || continue
    p=$(dpkg-deb -f "$f" Package 2>/dev/null) || continue
    installed "$p" && continue
    debs+=("$f"); names+=("$p")
  done
  if [[ ${#debs[@]} -gt 0 ]]; then
    if $SUDO timeout 120 dpkg -i "${debs[@]}" && [[ -z $(missing) ]]; then
      echo "$LABEL: installed ${#debs[@]} cached .debs offline (no apt, no network)"
      exit 0
    fi
    echo "::warning::$LABEL: the cached .debs did not install cleanly; removing them and falling back to apt"
    undo=(); for p in "${names[@]}"; do installed "$p" || undo+=("$p"); done
    if [[ ${#undo[@]} -gt 0 ]]; then $SUDO timeout 60 dpkg --remove --force-depends "${undo[@]}" || true; fi
  fi
fi

# 3. Fail fast when no apt source host resolves: an outage costs seconds, with its own text.
mapfile -t HOSTS < <(grep -rhsv '^[[:space:]]*#' "${SOURCES[@]}" 2>/dev/null | grep -oE 'https?://[^/[:space:]]+' | sed -E 's#^https?://##; s#^[^@]*@##; s#:[0-9]+$##' | sort -u)
if [[ ${#HOSTS[@]} -gt 0 ]]; then
  resolved=0
  for h in "${HOSTS[@]}"; do
    if timeout 5 getent hosts "$h" >/dev/null 2>&1; then resolved=1; break; fi
  done
  if [[ $resolved == 0 ]]; then
    echo "::error::$LABEL: runner package mirror unreachable: no apt host resolves (${HOSTS[*]}) and no cached .debs cover ${MISS[*]}"
    exit 3
  fi
fi

# 4. Bounded apt (moved from .github/actions/mesa-xvfb, 2026-09-30 / 2026-11-10).
# BOUNDED: a stalled mirror or a held dpkg lock spent the caller's whole job budget (PR #537,
# job 109932275468: 31.6 min in apt). Each call is capped, apt retries a fetch itself with a
# per-connection timeout and waits at most 60 s for the dpkg lock; all attempts share --budget.
# REPAIR: the cap can kill apt mid-dpkg, leaving "dpkg was interrupted" that fails every later
# attempt in seconds (job 129623589272); after a failed attempt finish it with
# `dpkg --configure -a`, and if the packages are then installed the setup is done.
APT_OPTS=(-o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 -o DPkg::Lock::Timeout=60)
if [[ -n $CACHE ]]; then
  mkdir -p "$CACHE" 2>/dev/null || $SUDO mkdir -p "$CACHE"
  $SUDO mkdir -p "$CACHE/partial"
  APT_OPTS+=(-o "Dir::Cache::Archives=$CACHE/" -o APT::Keep-Downloaded-Packages=true)
fi
deadline=$((SECONDS + BUDGET))
apt_with_budget() {
  local remaining=$((deadline - SECONDS)) cap=$1
  shift
  if [[ $remaining -le 0 ]]; then return 124; fi
  if [[ $cap -gt $remaining ]]; then cap=$remaining; fi
  $SUDO timeout "$cap" apt-get "$@" "${APT_OPTS[@]}"
}
repair_dpkg() {
  local remaining=$((deadline - SECONDS)) cap=60
  if [[ $remaining -le 0 ]]; then return 0; fi
  if [[ $cap -gt $remaining ]]; then cap=$remaining; fi
  $SUDO timeout "$cap" dpkg --configure -a || true
}
ok=0
for attempt in 1 2 3; do
  if apt_with_budget 120 update -qq \
     && apt_with_budget 180 install -y -qq --no-install-recommends "${MISS[@]}"; then
    ok=1; break
  fi
  repair_dpkg
  if [[ -z $(missing) ]]; then
    echo "::warning::$LABEL: apt attempt $attempt was cut short; dpkg --configure -a finished the install"
    ok=1; break
  fi
  remaining=$((deadline - SECONDS))
  if [[ $attempt -eq 3 || $remaining -le 0 ]]; then break; fi
  echo "::warning::$LABEL: apt attempt $attempt failed or timed out; retrying"
  if [[ $remaining -gt $RETRY_SLEEP ]]; then sleep "$RETRY_SLEEP"; else sleep "$remaining"; fi
done
if [[ $ok != 1 ]]; then
  echo "::error::$LABEL: apt could not install ${MISS[*]} within $BUDGET s and up to 3 attempts (runner mirror down?)"
  exit 1
fi
left=$(missing)
if [[ -n $left ]]; then echo "::error::$LABEL: apt finished but dpkg still lacks: $left"; exit 1; fi
if [[ -n $CACHE ]]; then
  $SUDO rm -rf "$CACHE/partial" "$CACHE/lock"
  $SUDO chown -R "$(id -u):$(id -g)" "$CACHE" 2>/dev/null || true
  if compgen -G "$CACHE/*.deb" >/dev/null; then out "populated=1"; fi
fi
echo "$LABEL: installed ${MISS[*]} via apt"
