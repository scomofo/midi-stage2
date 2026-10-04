#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# :8081 is QA-only — a revive must never inherit a stale built-output preview.
node scripts/preview.mjs stop || true
# Preferred port, with fallback: if it is busy, take the next open one.
# The chosen port is saved to .grok/dev-port so later runs find the server.
PREFERRED=8082
PORT_FILE=".grok/dev-port"

saved="$(cat "$PORT_FILE" 2>/dev/null || true)"
for p in "$saved" "$PREFERRED"; do
  if [ -n "$p" ] && curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:$p/"; then
    exit 0
  fi
done

PORT="$PREFERRED"
while curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$PORT/" 2>/dev/null; do
  PORT=$((PORT + 1))
  if [ "$PORT" -gt $((PREFERRED + 50)) ]; then
    echo "no open port near $PREFERRED" >&2
    exit 1
  fi
done
echo "$PORT" > "$PORT_FILE"
if [ "$PORT" != "$PREFERRED" ]; then
  echo "port $PREFERRED busy, dev server on $PORT" >&2
fi
PORT="$PORT" npm run dev >>/tmp/app-startup.log 2>&1 &
