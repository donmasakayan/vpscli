#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

mkdir -p dist

echo "Building vpscli binaries..."

bun build src/index.ts --compile --target=bun-linux-x64 --outfile dist/vpscli-linux-x64
echo "  ✓ linux-x64"

bun build src/index.ts --compile --target=bun-darwin-arm64 --outfile dist/vpscli-darwin-arm64
echo "  ✓ darwin-arm64"

bun build src/index.ts --compile --target=bun-darwin-x64 --outfile dist/vpscli-darwin-x64
echo "  ✓ darwin-x64"

echo ""
echo "Binaries in dist/:"
ls -lh dist/vpscli-*
