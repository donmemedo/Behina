#!/bin/sh
set -eu
case "${CONFIGURATION:-}" in Release*) ;; *) exit 0 ;; esac
config="${SRCROOT}/App/capacitor.config.json"
url=$(/usr/bin/plutil -extract server.url raw -o - "$config")
cleartext=$(/usr/bin/plutil -extract server.cleartext raw -o - "$config")
case "$url" in
  https://?*) ;;
  *) echo "error: Release requires APP_MODE=production APP_URL=https://your-domain cap sync" >&2; exit 1 ;;
esac
if [ "$cleartext" != "false" ]; then
  echo "error: Release requires cleartext=false in the synced Capacitor configuration" >&2
  exit 1
fi
