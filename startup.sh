#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# :8081 is QA-only — a revive must never inherit a stale built-output preview.
node scripts/preview.mjs stop || true
# Preferred port, with fallback: if it is busy, take the next open one.
# Priority: 1. explicit $PORT (authoritative)  2. healthy saved port
#           3. healthy preferred port  4. first TCP-free port at/above preferred.
# The chosen port is saved to .grok/dev-port so later runs find the server.
PREFERRED=8082
PORT_FILE=".grok/dev-port"

# tcp_open <port>: true if anything accepts TCP on 127.0.0.1:<port>.
# node is already required by `npm run dev`, so this beats a curl probe:
# a port held by a non-HTTP process looks free to curl but fails the bind.
tcp_open() {
  node -e '
const net=require("net"),port=+process.argv[1];
const s=net.createConnection({port:port,host:"127.0.0.1",timeout:800});
s.on("connect",()=>{s.destroy();process.exit(0);});
s.on("timeout",()=>{s.destroy();process.exit(1);});
s.on("error",()=>{process.exit(1);});' "$1"
}

if [ -n "${PORT:-}" ]; then
  # An explicit $PORT wins outright — used as given, not scanned or replaced.
  case "$PORT" in *[!0-9]*) echo "PORT must be numeric, got '$PORT'" >&2; exit 1;; esac
  echo "$PORT" > "$PORT_FILE"
else
  saved="$(cat "$PORT_FILE" 2>/dev/null || true)"
  for p in "$saved" "$PREFERRED"; do
    if [ -n "$p" ] && curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:$p/"; then
      exit 0
    fi
  done
  PORT="$PREFERRED"
  while tcp_open "$PORT"; do
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
fi
PORT="$PORT" npm run dev >>/tmp/app-startup.log 2>&1 &
