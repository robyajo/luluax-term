#!/usr/bin/env bash
# ==============================================================================
# LuluaX-Term — macOS Development Launcher (Apple Silicon & Intel)
# ==============================================================================

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}======================================================${NC}"
echo -e "${CYAN}      LuluaX-Term — macOS Development Environment     ${NC}"
echo -e "${CYAN}======================================================${NC}"

ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    echo -e "${GREEN}✓ Platform: macOS Apple Silicon ($ARCH - M-Series Chip)${NC}"
else
    echo -e "${YELLOW}ℹ Platform: macOS Intel ($ARCH)${NC}"
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR] Node.js is not installed!${NC}"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
fi

echo -e "${CYAN}Compiling TypeScript source (src -> dist-electron)...${NC}"
npx tsc

PORT=${PORT:-3980}

echo -e "${CYAN}[1/2] Starting backend terminal server on port ${PORT}...${NC}"
node dist-electron/server.js &
SERVER_PID=$!

trap "echo -e '\n${YELLOW}Stopping LuluaX-Term server (PID: $SERVER_PID)...${NC}'; kill $SERVER_PID 2>/dev/null; exit 0" SIGINT SIGTERM EXIT

sleep 2

echo -e "${CYAN}[2/2] Opening application window...${NC}"

if [ -f "dist-electron/main.js" ] && [ -d "node_modules/electron" ]; then
    echo -e "${GREEN}✓ Launching via Electron desktop window...${NC}"
    npx electron dist-electron/main.js || true
elif [ -d "/Applications/Google Chrome.app" ]; then
    open -na "Google Chrome" --args --app=http://127.0.0.1:${PORT} --window-size=1240,820
elif [ -d "/Applications/Microsoft Edge.app" ]; then
    open -na "Microsoft Edge" --args --app=http://127.0.0.1:${PORT} --window-size=1240,820
else
    open "http://127.0.0.1:${PORT}"
fi

echo -e "\n${GREEN}>> LuluaX-Term running at: http://127.0.0.1:${PORT}${NC}"
wait $SERVER_PID
