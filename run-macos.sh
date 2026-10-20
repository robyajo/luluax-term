#!/usr/bin/env bash
# ========================================================
#   LuluaX-Term Launcher for macOS (Apple Silicon & Intel)
# ========================================================

echo "========================================================"
echo "         Starting LuluaX-Term Terminal Client           "
echo "========================================================"

# Determine directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

# Detect Architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    echo ">> System Detected: macOS Apple Silicon ($ARCH - M1/M2/M3/M4 Series)"
else
    echo ">> System Detected: macOS Intel ($ARCH)"
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed or not in PATH!"
    echo "Please install Node.js via Homebrew (brew install node) or from https://nodejs.org"
    exit 1
fi

NODE_VER=$(node -v)
echo ">> Node.js Version: $NODE_VER"

# Start Server in background
echo "[1/2] Starting local terminal backend server..."
node server.js &
SERVER_PID=$!

# Trap exit to cleanup background server process
trap "kill $SERVER_PID 2>/dev/null; exit" SIGINT SIGTERM EXIT

# Wait for server to bind
sleep 2

# Open in Native Desktop Window Mode (Chrome / Edge / Brave / Safari)
echo "[2/2] Launching LuluaX-Term Application Window..."

if [ -d "/Applications/Google Chrome.app" ]; then
    open -na "Google Chrome" --args --app=http://127.0.0.1:3980 --window-size=1200,800
elif [ -d "/Applications/Microsoft Edge.app" ]; then
    open -na "Microsoft Edge" --args --app=http://127.0.0.1:3980 --window-size=1200,800
elif [ -d "/Applications/Brave Browser.app" ]; then
    open -na "Brave Browser" --args --app=http://127.0.0.1:3980 --window-size=1200,800
else
    open http://127.0.0.1:3980
fi

echo ""
echo ">> LuluaX-Term is running at: http://127.0.0.1:3980"
echo ">> Press Ctrl+C in this terminal window to stop the server."

wait $SERVER_PID
