#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONDA_ENV_NAME="${CONDA_ENV_NAME:-lightTable}"
LOG_DIR="$ROOT_DIR/.logs"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
API_BASE="${NEXT_PUBLIC_API_BASE:-http://localhost:$BACKEND_PORT}"

BACKEND_PID=""
FRONTEND_PID=""
BACKEND_TAIL_PID=""
FRONTEND_TAIL_PID=""

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

check_port_free() {
  local port="$1"
  local name="$2"

  if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "$name port $port is already in use."
    echo "Stop the existing process first, then run this script again."
    exit 1
  fi
}

wait_for_http() {
  local url="$1"
  local name="$2"
  local tries="$3"

  for ((i = 1; i <= tries; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "$name is ready: $url"
      return 0
    fi
    sleep 1
  done

  echo "$name did not become ready in time."
  return 1
}

wait_for_port() {
  local port="$1"
  local name="$2"
  local tries="$3"

  for ((i = 1; i <= tries; i++)); do
    if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "$name is ready on port $port."
      return 0
    fi
    sleep 1
  done

  echo "$name did not become ready in time."
  return 1
}

cleanup() {
  trap - EXIT INT TERM

  for pid in "$BACKEND_TAIL_PID" "$FRONTEND_TAIL_PID" "$BACKEND_PID" "$FRONTEND_PID"; do
    if [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
}

trap cleanup EXIT INT TERM

require_command npm
require_command curl
require_command lsof

mkdir -p "$LOG_DIR"

if command -v conda >/dev/null 2>&1; then
  CONDA_BASE="$(conda info --base)"
elif [ -f "$HOME/anaconda3/etc/profile.d/conda.sh" ]; then
  CONDA_BASE="$HOME/anaconda3"
elif [ -f "$HOME/miniconda3/etc/profile.d/conda.sh" ]; then
  CONDA_BASE="$HOME/miniconda3"
else
  echo "Conda not found. Please install Anaconda/Miniconda or add conda to PATH."
  exit 1
fi

# shellcheck source=/dev/null
source "$CONDA_BASE/etc/profile.d/conda.sh"
conda activate "$CONDA_ENV_NAME"

PYTHON_BIN="$(command -v python)"
PIP_BIN="$(command -v pip)"

if ! "$PYTHON_BIN" -c "import importlib.util, sys; required = ('fastapi', 'uvicorn', 'dotenv', 'httpx', 'pydantic', 'multipart'); sys.exit(0 if all(importlib.util.find_spec(name) for name in required) else 1)" >/dev/null 2>&1; then
  echo "Installing backend dependencies..."
  "$PIP_BIN" install -r "$ROOT_DIR/requirements.txt"
fi

if [ ! -x "$ROOT_DIR/frontend/node_modules/.bin/next" ]; then
  echo "Installing frontend dependencies..."
  (
    cd "$ROOT_DIR/frontend"
    npm install
  )
fi

check_port_free "$BACKEND_PORT" "Backend"
check_port_free "$FRONTEND_PORT" "Frontend"

: >"$BACKEND_LOG"
: >"$FRONTEND_LOG"

echo "Resetting frontend dev cache..."
rm -rf "$ROOT_DIR/frontend/.next"

echo "Starting backend on port $BACKEND_PORT..."
(
  cd "$ROOT_DIR"
  exec "$PYTHON_BIN" -m uvicorn backend.main:app --host 0.0.0.0 --port "$BACKEND_PORT" --reload --reload-dir "$ROOT_DIR/backend"
) >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

echo "Starting frontend on port $FRONTEND_PORT..."
(
  cd "$ROOT_DIR/frontend"
  export NEXT_PUBLIC_API_BASE="$API_BASE"
  exec npm run dev
) >"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

tail -n +1 -f "$BACKEND_LOG" | sed 's/^/[backend] /' &
BACKEND_TAIL_PID=$!

tail -n +1 -f "$FRONTEND_LOG" | sed 's/^/[frontend] /' &
FRONTEND_TAIL_PID=$!

sleep 2

if ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
  echo "Backend failed to start. Check $BACKEND_LOG"
  exit 1
fi

if ! kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
  echo "Frontend failed to start. Check $FRONTEND_LOG"
  exit 1
fi

wait_for_http "http://127.0.0.1:$BACKEND_PORT/api/v1/status" "Backend" 30
wait_for_port "$FRONTEND_PORT" "Frontend" 60

echo
echo "LightTable is running."
echo "Frontend: http://localhost:$FRONTEND_PORT"
echo "Backend:  http://localhost:$BACKEND_PORT"
echo
echo "Press Ctrl+C to stop both services."

wait "$BACKEND_PID" "$FRONTEND_PID"
