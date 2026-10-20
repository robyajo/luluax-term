#!/usr/bin/env bash
# ==============================================================================
# LuluaX-Term — GitHub Releases Auto-Publish Script with Smart Version Bumping
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
echo -e "${CYAN}  LuluaX-Term — GitHub Releases Publisher with Bumper  ${NC}"
echo -e "${CYAN}======================================================${NC}"

# 1. Check GitHub Token
TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}"
if [ -z "$TOKEN" ]; then
    echo -e "${RED}[ERROR] GH_TOKEN or GITHUB_TOKEN environment variable is not set!${NC}"
    echo "Please set your GitHub Personal Access Token (repo scope required):"
    echo "  export GH_TOKEN=\"ghp_your_token_here\""
    exit 1
fi
export GH_TOKEN="$TOKEN"

# 2. Read Current Version
CURRENT_VER=$(node -p "require('./package.json').version")
echo -e "Versi saat ini: ${YELLOW}v${CURRENT_VER}${NC}"

# 3. Determine New Version (with Rollover Rule: 1.0.99/1.0.100 -> 1.1.0)
INPUT_VER="$1"

NEW_VER=$(node -e "
const current = '$CURRENT_VER';
const target = '$INPUT_VER';

function bump(cur, t) {
  if (t && /^\d+\.\d+\.\d+$/.test(t)) return t;
  const [major, minor, patch] = cur.split('.').map(Number);
  if (t === 'major') return \`\${major + 1}.0.0\`;
  if (t === 'minor') return \`\${major}.\${minor + 1}.0\`;
  
  // Default: patch bump with rollover if patch >= 99 (or 100) -> bump minor
  if (patch >= 99) {
    return \`\${major}.\${minor + 1}.0\`;
  }
  return \`\${major}.\${minor}.\${patch + 1}\`;
}

console.log(bump(current, target));
")

# If interactive terminal and no CLI argument provided, allow user choice
if [ -z "$INPUT_VER" ] && [ -t 0 ]; then
    echo -e "\nPilih aksi peningkatan versi:"
    echo -e "  1) Auto Patch Bump [Rekomendasi]: v${NEW_VER}"
    echo -e "  2) Minor Bump (Fitur Baru): v$(node -p "const [M,m]=require('./package.json').version.split('.').map(Number); \`\${M}.\${m+1}.0\`")"
    echo -e "  3) Major Bump (Perubahan Besar): v$(node -p "const [M]=require('./package.json').version.split('.').map(Number); \`\${M+1}.0.0\`")"
    echo -e "  4) Masukkan Versi Sendiri Secara Manual"
    read -p "Pilihan Anda [1-4, default 1]: " CHOICE

    case "$CHOICE" in
        2)
            NEW_VER=$(node -p "const [M,m]=require('./package.json').version.split('.').map(Number); \`\${M}.\${m+1}.0\`")
            ;;
        3)
            NEW_VER=$(node -p "const [M]=require('./package.json').version.split('.').map(Number); \`\${M+1}.0.0\`")
            ;;
        4)
            read -p "Ketik versi baru (misal 1.2.0): " CUSTOM_V
            if [[ "$CUSTOM_V" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
                NEW_VER="$CUSTOM_V"
            else
                echo -e "${RED}Format versi tidak valid! Menggunakan auto-bump v${NEW_VER}${NC}"
            fi
            ;;
        *)
            # Use default NEW_VER
            ;;
    esac
fi

echo -e "\n${GREEN}✓ Versi baru yang akan dirilis: v${NEW_VER}${NC}"

# 4. Update package.json
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '$NEW_VER';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# 5. Compile TypeScript
echo -e "${CYAN}Mengompilasi TypeScript (npm run build)...${NC}"
npm run build

# 6. Build and Publish via electron-builder
echo -e "${CYAN}Memaketkan installer dan mempublikasikan ke GitHub Releases...${NC}\n"
OS_NAME=$(uname -s)
if [ "$OS_NAME" = "Darwin" ]; then
    npx electron-builder --mac dmg --arm64 --publish always
else
    npx electron-builder --win nsis portable --publish always
fi

# 7. Git Commit & Tag
echo -e "\n${CYAN}Membuat commit dan tag git v${NEW_VER}...${NC}"
git add package.json
git commit -m "chore(release): bump version to v${NEW_VER}" || true
git tag -a "v${NEW_VER}" -m "Release v${NEW_VER}" -f
git push origin main --tags || true

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}✓ PUBLISH SUCCESS! LuluaX-Term v${NEW_VER} telah live di GitHub!${NC}"
echo -e "${GREEN}Pengguna lama akan otomatis menerima update tanpa perlu uninstall.${NC}"
echo -e "${GREEN}======================================================${NC}"
