#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "========================================"
echo "  Platform Solo Sutra - Dev Server"
echo "========================================"
echo

echo "Installing dependencies..."
npm install

echo
echo "Starting Vite dev server..."
npx vite --host 0.0.0.0 --port 5173
