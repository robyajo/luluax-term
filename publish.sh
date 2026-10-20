#!/usr/bin/env bash
# ==============================================================================
# LuluaX-Term — GitHub Releases Auto-Publish Script
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
echo -e "${CYAN}     LuluaX-Term — GitHub Releases Publisher          ${NC}"
echo -e "${CYAN}======================================================${NC}"

# Check GitHub Token
TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}"
if [ -z "$TOKEN" ]; then
    echo -e "${RED}[ERROR] GH_TOKEN or GITHUB_TOKEN environment variable is not set!${NC}"
    echo "Please set your GitHub Personal Access Token (with repo scope) before publishing:"
    echo "  export GH_TOKEN=\"ghp_your_token_here\""
    exit 1
fi

export GH_TOKEN="$TOKEN"

# Display version from package.json
APP_VER=$(node -p "require('./package.json').version")
echo -e "${GREEN}✓ Application Version: v${APP_VER}${NC}"
echo -e "${GREEN}✓ GitHub Repository: robyajo/luluax-term${NC}"
echo -e "${CYAN}Packaging and uploading to GitHub Releases...${NC}\n"

# Detect OS to select target
OS_NAME=$(uname -s)
if [ "$OS_NAME" = "Darwin" ]; then
    echo -e "${GREEN}Detected macOS — Packaging DMG and publishing...${NC}"
    npx electron-builder --mac dmg --arm64 --publish always
else
    echo -e "${GREEN}Detected Linux/Windows — Packaging Windows NSIS installer and publishing...${NC}"
    npx electron-builder --win nsis --publish always
fi

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}✓ PUBLISH SUCCESS! Release v${APP_VER} uploaded to GitHub.${NC}"
echo -e "${GREEN}Users will receive auto-update notifications on next launch.${NC}"
echo -e "${GREEN}======================================================${NC}"
