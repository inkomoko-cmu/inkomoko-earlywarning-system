#!/bin/bash

# Inkomoko Early Warning System - Development Server Script
# Runs backend (FastAPI) and frontend (Next.js) concurrently

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Inkomoko Early Warning System - Development Server       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"

LOG_DIR="$PROJECT_ROOT/.logs"
mkdir -p "$LOG_DIR"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

PIDS=()

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Stopping servers...${NC}"
    for pid in "${PIDS[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
    wait "${PIDS[@]}" 2>/dev/null || true
    echo -e "${GREEN}Servers stopped.${NC}"
    exit 0
}

# Set trap to cleanup on exit
trap cleanup SIGINT SIGTERM EXIT

# ── Check ports ──────────────────────────────────────────────────────────────
check_port() {
    local port=$1 name=$2
    local pids
    pids=$(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
        echo -e "${YELLOW}⚠ Port $port ($name) in use — killing existing process(es)...${NC}"
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
}

check_port 8000 "Backend API"
check_port 3000 "Frontend"

# ── Backend ──────────────────────────────────────────────────────────────────
echo -e "\n${BLUE}[1/2] Starting backend (port 8000)...${NC}"
cd "$BACKEND_DIR"
if [[ -f .venv/bin/activate ]]; then
    source .venv/bin/activate
fi
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > "$BACKEND_LOG" 2>&1 &
PIDS+=($!)
echo -e "${GREEN}  PID: ${PIDS[-1]}  logs → ${YELLOW}tail -f $BACKEND_LOG${NC}"

# Wait a moment for API to bind
sleep 2

# ── Frontend ─────────────────────────────────────────────────────────────────
echo -e "${BLUE}[2/2] Starting frontend (port 3000)...${NC}"
cd "$FRONTEND_DIR"
npm run dev > "$FRONTEND_LOG" 2>&1 &
PIDS+=($!)
echo -e "${GREEN}  PID: ${PIDS[-1]}  logs → ${YELLOW}tail -f $FRONTEND_LOG${NC}"

# ── Summary ──────────────────────────────────────────────────────────────────
echo -e "\n${GREEN}✓ All servers starting!${NC}"
echo -e "\n${BLUE}URLs:${NC}"
echo -e "  Frontend:    ${GREEN}http://localhost:3000${NC}"
echo -e "  Backend API: ${GREEN}http://localhost:8000${NC}"
echo -e "  API Docs:    ${GREEN}http://localhost:8000/docs${NC}"
echo -e "\n${YELLOW}Press Ctrl+C to stop all servers${NC}\n"

# Wait for any child to exit
wait -n "${PIDS[@]}" 2>/dev/null || true
echo -e "${RED}A server exited unexpectedly — shutting down.${NC}"
