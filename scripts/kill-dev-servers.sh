#!/usr/bin/env bash
# Stop local Designer dev processes listening on the default API and Vite ports.
# Defaults must match server/dev-defaults.ts (PORT / VITE_PORT fallbacks).
set -euo pipefail

kill_port() {
  local port=$1
  local pids
  pids="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [ -z "$pids" ]; then
    echo "Port $port: nothing listening"
    return 0
  fi
  echo "Port $port: SIGTERM → $pids"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  sleep 0.4
  pids="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "Port $port: SIGKILL → $pids"
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  fi
}

kill_port "${PORT:-4731}"
kill_port "${VITE_PORT:-4732}"
echo "Done."
