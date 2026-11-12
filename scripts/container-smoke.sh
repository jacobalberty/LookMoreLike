#!/usr/bin/env bash
# Checks a built image the way a reverse proxy would use it:
#
#   scripts/container-smoke.sh <image>
#
# The routes of the app fall back to index.html but a missing file does not,
# content types and cache headers are right, and the runtime configuration
# follows LOOKMORELIKE_API_BASE (and a bad value stops the container).
set -euo pipefail

image=${1:?usage: container-smoke.sh <image>}
name="lml-smoke-$$"
fail=0
pass() { echo "ok   $*"; }
bad() { echo "FAIL $*" >&2; fail=1; }

cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

start() { # [env...]
  cleanup
  docker run -d --name "$name" -p 127.0.0.1::8080 "$@" "$image" >/dev/null
  port=$(docker port "$name" 8080/tcp | head -n1 | sed 's/.*://')
  for _ in $(seq 1 50); do
    curl -fs "http://127.0.0.1:$port/_health" >/dev/null 2>&1 && return 0
    sleep 0.2
  done
  docker logs "$name" >&2
  return 1
}

# status and one header (lower-cased name) of a GET
get() { curl -s -o /dev/null -D - "http://127.0.0.1:$port$1"; }
status() { get "$1" | head -n1 | awk '{print $2}'; }
header() { get "$1" | tr -d '\r' | awk -F': ' -v h="$2" 'tolower($1)==tolower(h){print $2}'; }
body() { curl -s "http://127.0.0.1:$port$1"; }
expect() { # description actual wanted
  if [ "$2" = "$3" ]; then pass "$1"; else bad "$1: got '$2', want '$3'"; fi
}
expect_match() { # description actual regex
  if [[ "$2" =~ $3 ]]; then pass "$1"; else bad "$1: got '$2', want /$3/"; fi
}

start
expect "/ is the app" "$(status /)" 200
expect_match "/ is html" "$(header / content-type)" '^text/html'
expect "a route of the app falls back to index.html" "$(status /networks)" 200
expect "a deep route falls back to index.html" "$(status /devices/pending)" 200
expect "the fallback is the app" "$(body /networks | grep -c '<div id="app">')" 1
expect "a missing script is a 404, not the app" "$(status /assets/nope.js)" 404
expect "a missing file elsewhere is a 404" "$(status /missing.js)" 404

asset=$(body / | grep -o '/assets/[^"]*\.js' | head -n1)
[ -n "$asset" ] || { bad "index.html names no script"; }
expect_match "built script content type" "$(header "$asset" content-type)" '^(application|text)/javascript'
expect "built assets are cached for good" "$(header "$asset" cache-control)" "public, max-age=31536000, immutable"
expect "index.html is not cached" "$(header / cache-control)" "no-cache"
expect "config.js is not cached" "$(header /config.js cache-control)" "no-cache"
expect_match "config.js is javascript" "$(header /config.js content-type)" '^(application|text)/javascript'
expect "config.js defaults to the root" "$(body /config.js)" "window.__LML_CONFIG__ = { apiBase: '/' }"
expect_match "a content security policy is sent" "$(header / content-security-policy)" "default-src 'self'"
expect "no sniffing" "$(header / x-content-type-options)" nosniff
expect "no framing" "$(header / x-frame-options)" DENY
expect "the server does not name its version" "$(header / server | grep -c '[0-9]\.[0-9]' || true)" 0

start -e LOOKMORELIKE_API_BASE=/beenfar-api
expect "config.js follows LOOKMORELIKE_API_BASE" "$(body /config.js)" "window.__LML_CONFIG__ = { apiBase: '/beenfar-api' }"

for badvalue in "https://beenfar.example.com" "//beenfar.example.com" "api" "/a'b" "/a b"; do
  cleanup
  if docker run --rm --name "$name" -e "LOOKMORELIKE_API_BASE=$badvalue" "$image" >/dev/null 2>&1 & pid=$!; sleep 3; kill -0 "$pid" 2>/dev/null; then
    docker rm -f "$name" >/dev/null 2>&1 || true
    bad "the container started with LOOKMORELIKE_API_BASE='$badvalue'"
  else
    pass "LOOKMORELIKE_API_BASE='$badvalue' stops the container"
  fi
  wait "$pid" 2>/dev/null || true
done

exit $fail
