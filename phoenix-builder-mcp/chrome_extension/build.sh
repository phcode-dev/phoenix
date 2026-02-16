#!/bin/bash
# Builds a .zip of the Chrome extension for distribution or local install.
# Usage: ./build.sh
#
# To load as an unpacked extension during development:
#   1. Open chrome://extensions
#   2. Enable "Developer mode"
#   3. Click "Load unpacked" and select this directory
#
# To build a .crx (signed package) you need the Chrome binary and a private key:
#   chrome --pack-extension=./phoenix-builder-mcp/chrome_extension --pack-extension-key=key.pem

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

zip -j "$BUILD_DIR/phoenix-screenshot-extension.zip" \
    "$SCRIPT_DIR/manifest.json" \
    "$SCRIPT_DIR/background.js" \
    "$SCRIPT_DIR/content-script.js" \
    "$SCRIPT_DIR/page-script.js"

echo "Built: $BUILD_DIR/phoenix-screenshot-extension.zip"
