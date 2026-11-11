#!/usr/bin/env bash
# @doc Installs CI apt packages without the mirror when it can: none if dpkg has them, cached .debs, then bounded apt.
# Full description (#5519, 2026-11-11): from about 13:50Z a runner apt mirror / DNS outage
# ("Temporary failure resolving 'security.ubuntu.com'") failed every browser leg in the
# mesa-xvfb step and the lint job in `Install lint binaries`, before any spec ran: each leg
# spent about five minutes on three apt attempts and turned its PR red. The order here makes
# that outage cost nothing when the job has what it needs, and seconds when it does not:
#   1. every package already installed (dpkg-query)        -> no apt, no network, exit 0
#   2. the .debs in --cache DIR cover the missing ones      -> `dpkg -i` offline, exit 0
#   3. a mirror name resolves only sometimes                -> pin its address for this job (3a)
#      no apt mirror answers (DNS + TCP, mirror+file lists) -> fail at once: "runner package
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
# APT_SOURCES (apt source files/dirs), APT_RETRY_SLEEP (seconds between attempts, default 10),
# APT_REACH (command HOST PORT that exits 0 when a mirror answers; default getent + TCP connect),
# APT_RESOLVE (HOST -> IPv4 via the system resolver), APT_DOH (HOST -> "IP RESOLVER"), APT_HOSTS_FILE.
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

# 3. Fail fast when no apt mirror answers: an outage costs seconds, with its own text.
# The runner image's sources name `mirror+file:/etc/apt/apt-mirrors.txt` (job 130569884615:
# "W: Failed to fetch mirror+file:/etc/apt/apt-mirrors.txt/dists/resolute/InRelease  Temporary
# failure resolving 'security.ubuntu.com'"), so the hosts come from that file as well as from
# plain URIs. A mirror ANSWERS when its name resolves and it accepts a TCP connection on its
# scheme's port within 5 s; one answering mirror is enough to try apt (apt's mirror method walks
# the list itself). Skipped behind a proxy (apt reaches the mirror through it, not directly).
apt_uris() {
  local u
  grep -rhsv '^[[:space:]]*#' "${SOURCES[@]}" 2>/dev/null | grep -oE '(mirror\+file:|https?://)[^[:space:]]+' | while read -r u; do
    case $u in
      mirror+file:*) grep -hsv '^[[:space:]]*#' "${u#mirror+file:}" | grep -oE 'https?://[^[:space:]]+' ;;
      *) echo "$u" ;;
    esac
  done
}
reach() {
  if [[ -n ${APT_REACH:-} ]]; then "$APT_REACH" "$1" "$2"; return; fi
  # shellcheck disable=SC2016 # $0/$1 expand in the child bash, by design
  timeout 5 getent hosts "$1" >/dev/null 2>&1 && timeout 5 bash -c 'exec 3<>"/dev/tcp/$0/$1"' "$1" "$2" 2>/dev/null
}
proxied() {
  [[ -n ${https_proxy:-}${HTTPS_PROXY:-}${http_proxy:-}${HTTP_PROXY:-} ]] && return 0
  apt-config dump 2>/dev/null | grep -qiE '^Acquire::https?::Proxy "[^"]+"'
}
mapfile -t MIRRORS < <(apt_uris | sed -nE 's#^(https?)://([^/@]*@)?([^/:]+)(:([0-9]+))?.*#\1 \3 \5#p' \
  | while read -r scheme host port; do
      if [[ -z $port ]]; then if [[ $scheme == https ]]; then port=443; else port=80; fi; fi
      echo "$host:$port"
    done | sort -u)
# 3a. Pin a FLAKY mirror name for this job (#5519, 2026-11-11 15:13Z: Canonical's authoritative DNS for
# ubuntu.com answered intermittently, SERVFAIL "Name servers did not respond", while the mirrors themselves
# served InRelease in 0.56 s). Each mirror host is resolved three times through the system resolver; 3/3
# answers change nothing. Fewer: pin the system's own answer, or with none, a public resolver's (DoH:
# Cloudflare, then Google), as one /etc/hosts line, logged as a ::warning:: naming host, IP and source.
# Only hosts from the runner's own apt sources / mirror lists; never a hard-coded address; never when the
# system resolver answers every time. INTEGRITY: apt verifies the signed InRelease and every package hash
# (and an https mirror's certificate names the host), so a wrong address cannot deliver a tampered
# package; it can only fail, which is the state this step starts from.
HOSTS_FILE=${APT_HOSTS_FILE:-/etc/hosts}
valid_ip() { [[ $1 =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; }
resolve_system() {
  if [[ -n ${APT_RESOLVE:-} ]]; then "$APT_RESOLVE" "$1"; return; fi
  timeout 5 getent ahostsv4 "$1" 2>/dev/null | awk 'NR == 1 { print $1 }'
}
resolve_public() {   # prints "IP RESOLVER"
  if [[ -n ${APT_DOH:-} ]]; then "$APT_DOH" "$1"; return; fi
  local url ip
  for url in "https://cloudflare-dns.com/dns-query" "https://dns.google/resolve"; do
    ip=$(curl -fsS --max-time 5 -H 'accept: application/dns-json' "$url?name=$1&type=A" 2>/dev/null \
      | grep -oE '"data": ?"[0-9.]+"' | grep -oE '[0-9.]+' | head -1)
    if [[ -n $ip ]] && valid_ip "$ip"; then echo "$ip $url"; return 0; fi
  done
  return 1
}
pinned() { awk -v h="$1" '$1 !~ /^#/ { for (i = 2; i <= NF; i++) if ($i == h) f = 1 } END { exit !f }' "$HOSTS_FILE" 2>/dev/null; }
# `pin_flaky_mirrors force` (after a FAILED apt attempt): pin every mirror host not yet pinned, even on 3/3.
# The records' TTLs are under a minute (Cloudflare DoH 15:21Z: security.ubuntu.com A ttl 40, azure CNAME
# 57 -> A 7), so three lookups can all come from systemd-resolved's cache and the name be lost mid-apt;
# a healthy day never gets here (attempt 1 succeeds), an outage day retries with pinned names.
PIN_OK=1
pin_flaky_mirrors() {
  local force=${1:-} m h a ip src answers seen=" " _
  [[ $PIN_OK == 1 && ${#MIRRORS[@]} -gt 0 ]] || return 0
  for m in "${MIRRORS[@]}"; do
    h=${m%:*}
    [[ $seen == *" $h "* ]] && continue
    seen+="$h "
    pinned "$h" && continue
    answers=0; ip=""
    for _ in 1 2 3; do
      a=$(resolve_system "$h")
      if [[ -n $a ]] && valid_ip "$a"; then answers=$((answers + 1)); ip=$a; fi
    done
    [[ $answers -eq 3 && -z $force ]] && continue
    if [[ -n $ip ]]; then src="the system resolver ($answers/3 answers)"
    else
      read -r ip src < <(resolve_public "$h") || true
      if [[ -z ${ip:-} ]] || ! valid_ip "$ip"; then
        echo "::warning::$LABEL: $h did not resolve through the system resolver (0/3) or a public resolver; not pinned"
        continue
      fi
    fi
    if echo "$ip $h" | $SUDO tee -a "$HOSTS_FILE" >/dev/null; then
      echo "::warning::$LABEL: $h resolved $answers/3 times through the system resolver; pinned $ip (from $src) in $HOSTS_FILE for this job${force:+ (after a failed apt attempt)}"
    fi
  done
}
if proxied; then PIN_OK=0; fi
if [[ ${#MIRRORS[@]} -gt 0 && $PIN_OK == 1 ]]; then
  answered=0
  pin_flaky_mirrors
  for m in "${MIRRORS[@]}"; do
    if reach "${m%:*}" "${m##*:}"; then answered=1; break; fi
  done
  if [[ $answered == 0 ]]; then
    echo "::error::$LABEL: runner package mirror unreachable: no apt mirror answers (${MIRRORS[*]}) and no cached .debs cover ${MISS[*]}"
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
APT_LOG=$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/apex-apt.XXXXXX")
trap 'rm -f "$APT_LOG"' EXIT
LAST_STEP=apt-get
apt_with_budget() {
  local remaining=$((deadline - SECONDS)) cap=$1
  shift
  if [[ $remaining -le 0 ]]; then return 124; fi
  if [[ $cap -gt $remaining ]]; then cap=$remaining; fi
  LAST_STEP="apt-get $1 (cap ${cap} s)"
  # Tee'd so a failed attempt can name its cause (#5519: job 130499870210 sat silent 2 min in
  # `update -qq` until the cap killed it). pipefail is on: the status is apt's, not tee's.
  $SUDO timeout "$cap" apt-get "$@" "${APT_OPTS[@]}" 2>&1 | tee -a "$APT_LOG"
}
explain_attempt() {
  local rc=$1
  if [[ $rc -eq 124 ]]; then echo "::warning::$LABEL: apt attempt $attempt: $LAST_STEP was killed by its cap"
  else echo "::warning::$LABEL: apt attempt $attempt: $LAST_STEP exited $rc"; fi
  echo "::group::$LABEL: last apt output (attempt $attempt)"
  tail -n 15 "$APT_LOG"
  echo "::endgroup::"
}
repair_dpkg() {
  local remaining=$((deadline - SECONDS)) cap=60
  if [[ $remaining -le 0 ]]; then return 0; fi
  if [[ $cap -gt $remaining ]]; then cap=$remaining; fi
  $SUDO timeout "$cap" dpkg --configure -a || true
}
ok=0
for attempt in 1 2 3; do
  : > "$APT_LOG"
  rc=0
  apt_with_budget 120 update -qq \
    && apt_with_budget 180 install -y -qq --no-install-recommends "${MISS[@]}" || rc=$?
  if [[ $rc -eq 0 ]]; then ok=1; break; fi
  explain_attempt "$rc"
  pin_flaky_mirrors force
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
