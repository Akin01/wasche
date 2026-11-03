#!/usr/bin/env bash
# Packages release binary artifacts into zip/tar.gz archives with SHA256 checksums
# Usage: bash scripts/package-release.sh [source_dir] [destination_dir]

set -euo pipefail

SRC_DIR="${1:-release-binaries}"
DEST_DIR="${2:-archives}"

mkdir -p "$DEST_DIR"

if ! command -v zip &>/dev/null; then
  echo "Installing zip..."
  sudo apt-get update && sudo apt-get install -y zip
fi

echo "Packaging release binaries from $SRC_DIR into $DEST_DIR..."

cd "$SRC_DIR"
for file in *; do
  [ -f "$file" ] || continue
  if [[ "$file" == *.exe ]]; then
    echo "Compressing $file into zip..."
    zip "../$DEST_DIR/${file%.exe}.zip" "$file"
  else
    echo "Compressing $file into tar.gz..."
    tar -czf "../$DEST_DIR/${file}.tar.gz" "$file"
  fi
done
cd - >/dev/null

cd "$DEST_DIR"
echo "Generating SHA256 checksums..."
sha256sum * >SHA256SUMS.txt
ls -lh
echo "Release packaging complete."
