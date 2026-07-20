#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! curl -sf -o /dev/null http://127.0.0.1:8080/ 2>/dev/null; then
  if [ ! -d node_modules ]; then
    npm install --prefer-offline --no-audit --no-fund
  fi
  nohup npm run dev > /tmp/signal-dev.log 2>&1 &
  for i in $(seq 1 30); do
    if curl -sf -o /dev/null http://127.0.0.1:8080/ 2>/dev/null; then
      echo "Signal dev server ready on 0.0.0.0:8080"
      exit 0
    fi
    sleep 1
  done
  echo "Dev server failed to start; see /tmp/signal-dev.log" >&2
  exit 1
else
  echo "Signal already running on 8080"
fi
