#!/bin/sh
# Writes the runtime configuration the app loads from /config.js.
#
#   LOOKMORELIKE_API_BASE  where beenfar's API is, as a path on this origin:
#                          "/" (default) when beenfard is mounted at the root,
#                          or e.g. "/beenfar-api" when the reverse proxy strips
#                          that prefix. It must be a path: beenfar refuses
#                          cookie-authenticated requests from another origin.
set -eu

base="${LOOKMORELIKE_API_BASE:-/}"

fail() {
    echo "lookmorelike: LOOKMORELIKE_API_BASE='$base' $1" >&2
    exit 1
}

case "$base" in
    //*) fail "is on another origin; it must be a path on this origin such as / or /beenfar-api" ;;
    /*) ;;
    *) fail "must be a path starting with /, such as / or /beenfar-api" ;;
esac
# Plain path characters only: the value is written into JavaScript.
if printf '%s' "$base" | grep -q '[^A-Za-z0-9._~/-]'; then
    fail "contains characters that are not allowed in a path prefix"
fi

mkdir -p /tmp/lml
printf "window.__LML_CONFIG__ = { apiBase: '%s' }\n" "$base" > /tmp/lml/config.js
echo "lookmorelike: API base is '$base'"
