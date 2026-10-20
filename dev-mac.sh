#!/usr/bin/env bash
# ==============================================================================
# LuluaX-Term — macOS Development Launcher (Apple Silicon & Intel)
# ==============================================================================

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

# Text Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}======================================================${NC}"
echo -e "${CYAN}      LuluaX-Term — macOS Development Environment     ${NC}"
echo -e "${CYAN}======================================================${NC}"

# Detect Architecture (Apple Silicon arm64 vs Intel x86_64)
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    echo -e "${GREEN}✓ Platform: macOS Apple Silicon ($ARCH - M-Series Chip)${NC}"
else
    echo -e "${YELLOW}ℹ Platform: macOS Intel ($ARCH)${NC}"
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR] Node.js is not installed!${NC}"
    echo "Please install Node.js via: brew install node"
    exit 1
fi

echo -e "${GREEN}✓ Node.js version: $(node -v)${NC}"

# Check dependencies
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
fi

# Load .env if present
if [ -f ".env" ]; then
    echo -e "${GREEN}✓ Loaded environment from .env${NC}"
fi

PORT=${PORT:-3980}

# Start local server in background
echo -e "${CYAN}[1/2] Starting backend terminal server on port ${PORT}...${NC}"
node server.js &
SERVER_PID=$!

# Trap signals for clean shutdown
trap "echo -e '\n${YELLOW}Stopping LuluaX-Term server (PID: $SERVER_PID)...${NC}'; kill $SERVER_PID 2>/dev/null; exit 0" SIGINT SIGTERM EXIT

# Wait for server to bind
sleep 2

# Open Desktop App Window
echo -e "${CYAN}[2/2] Opening application window...${NC}"

if command -v npx &> /dev/null && [ -f "electron-main.js" ] && [ -d "node_modules/electron" ]; then
    echo -e "${GREEN}✓ Launching via Electron desktop window...${NC}"
    npx electron electron-main.js || true
elif [ -d "/Applications/Google Chrome.app" ]; then
    echo -e "${GREEN}✓ Launching via Google Chrome app window...${NC}"
    open -na "Google Chrome" --args --app=http://127.0.0.1:${PORT} --window-size=1240,820
elif [ -d "/Applications/Microsoft Edge.app" ]; then
    echo -e "${GREEN}✓ Launching via Microsoft Edge app window...${NC}"
    open -na "Microsoft Edge" --args --app=http://127.0.0.1:${PORT} --window-size=1240,820
elif [ -d "/Applications/Brave Browser.app" ]; then
    echo -e "${GREEN}✓ Launching via Brave Browser app window...${NC}"
    open -na "Brave Browser" --args --app=http://127.0.0.1:${PORT} --window-size=1240,820
else
    echo -e "${GREEN}✓ Opening in default browser...${NC}"
    open "http://127.0.0.1:${PORT}"
fi

echo -e "\n${GREEN}>> LuluaX-Term running at: http://127.0.0.1:${PORT}${NC}"
echo -e "${YELLOW}>> Press Ctrl+C in this terminal to stop the server.${NC}\n"

wait $SERVER_PID
