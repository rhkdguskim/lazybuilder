#!/usr/bin/env bash
set -e

echo "========================================="
echo "  LazyBuild / BuilderCLI Installer"
echo "========================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed."
    echo "  Install Node.js >= 20 from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "[ERROR] Node.js >= 20 required. Current: $(node -v)"
    echo "  Update from https://nodejs.org/"
    exit 1
fi
echo "[OK] Node.js $(node -v)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "[ERROR] npm is not installed."
    exit 1
fi
echo "[OK] npm $(npm -v)"

# Install dependencies
echo ""
echo "[1/3] Installing dependencies..."
npm install

# Build
echo ""
echo "[2/3] Building TypeScript..."
npm run build

# Global link
echo ""
echo "[3/3] Linking global commands..."
npm link

echo ""
echo "========================================="
echo "  Installation complete!"
echo "========================================="
echo ""
echo "  You can now run:"
echo "    buildercli    - start the TUI"
echo "    lazybuild     - start the TUI (alias)"
echo ""
echo "  Or run in dev mode:"
echo "    npm run dev"
echo ""
