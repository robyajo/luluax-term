#!/usr/bin/env bash
# ==============================================================================
# LuluaX-Term — macOS Native Package Builder (.dmg & .app)
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
echo -e "${CYAN}   LuluaX-Term — macOS Builder (Apple Silicon/Intel)  ${NC}"
echo -e "${CYAN}======================================================${NC}"

# Check Node.js & npm
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR] Node.js is required to build!${NC}"
    exit 1
fi

# Ensure dependencies are installed
if [ ! -d "node_modules/electron-builder" ]; then
    echo -e "${YELLOW}Installing electron & electron-builder...${NC}"
    npm install -D electron electron-builder
fi

# Determine target architecture
TARGET_ARCH="arm64" # Default to Apple Silicon
if [ "$1" = "--x64" ] || [ "$(uname -m)" = "x86_64" ]; then
    if [ "$1" != "--arm64" ]; then
        TARGET_ARCH="x64"
    fi
fi

if [ "$1" = "--universal" ]; then
    TARGET_ARCH="universal"
fi

echo -e "${GREEN}✓ Target Architecture: macOS ${TARGET_ARCH}${NC}"
echo -e "${CYAN}Starting electron-builder packaging...${NC}\n"

if [ "$TARGET_ARCH" = "universal" ]; then
    npx electron-builder --mac --universal
elif [ "$TARGET_ARCH" = "arm64" ]; then
    npx electron-builder --mac --arm64
else
    npx electron-builder --mac --x64
fi

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}✓ BUILD SUCCESS! macOS installer created in dist/${NC}"
echo -e "${GREEN}======================================================${NC}"
ls -lh dist/*.dmg 2>/dev/null || ls -lh dist/
