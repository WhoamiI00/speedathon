#!/usr/bin/env bash
# T3: backup tick driver for the Dial call queue (PLAN §5). The /dashboard normally pings this every 5 s;
# run this on a laptop in case the dashboard is closed or its tab is throttled.
#   scripts/tick-loop.sh                          # http://localhost:3000
#   scripts/tick-loop.sh https://speedathon-np.vercel.app
URL="${1:-http://localhost:3000}"
INTERVAL="${TICK_INTERVAL:-5}"
echo "ticking $URL/api/calls/tick every ${INTERVAL}s (Ctrl-C to stop)"
while true; do
  out=$(curl -s -m 65 -X POST "$URL/api/calls/tick" || echo '{"error":"curl failed"}')
  echo "$(date +%H:%M:%S) $out"
  sleep "$INTERVAL"
done
