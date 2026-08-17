#!/usr/bin/env bash
# fetch-sidecars.sh — download platform-appropriate FFmpeg + FFprobe binaries
# into src-tauri/binaries/, named with the Rust target triple so Tauri's
# `bundle.externalBin` picks them up at build time.
#
# FFmpeg is NOT bundled in this repo: it is large, platform-specific, and
# licensed under LGPL/GPL depending on build. This script fetches a known-good
# static build so contributors can produce installers that ship FFmpeg without
# every machine needing it on PATH.
#
# Usage (from src-tauri):
#   bash scripts/fetch-sidecars.sh                          # auto-detect host triple
#   bash scripts/fetch-sidecars.sh x86_64-unknown-linux-gnu
#
# Override the source URLs with FFMPEG_URL / FFPROBE_URL env vars for an
# internal mirror.
set -euo pipefail

TARGET_TRIPLE="${1:-}"
if [ -z "$TARGET_TRIPLE" ]; then
  TARGET_TRIPLE="$(rustc -vV | awk '/^host:/ {print $2}')"
fi

BINARIES_DIR="$(cd "$(dirname "$0")/.." && pwd)/binaries"
mkdir -p "$BINARIES_DIR"

case "$TARGET_TRIPLE" in
  *windows*) EXE=".exe";;
  *) EXE="";;
esac

if [ -n "${FFMPEG_URL:-}" ] && [ -n "${FFPROBE_URL:-}" ]; then
  for name in ffmpeg ffprobe; do
    url_var="$(echo "$name" | tr 'a-z' 'A-Z')_URL"
    url="${!url_var}"
    dest="$BINARIES_DIR/$name-$TARGET_TRIPLE$EXE"
    echo "Downloading $name -> $dest"
    echo "  from $url"
    curl -fsSL "$url" -o "$dest"
    [ -z "$EXE" ] && chmod +x "$dest"
  done
  exit 0
fi

echo ""
echo "No FFMPEG_URL/FFPROBE_URL provided. The reliable cross-platform source"
echo "is a per-platform static archive (BtbN / evermeet / osxexperts) which"
echo "must be extracted before renaming. See:"
echo "  src-tauri/binaries/README.md"
echo ""
echo "Place the extracted executables at:"
echo "  src-tauri/binaries/ffmpeg-$TARGET_TRIPLE$EXE"
echo "  src-tauri/binaries/ffprobe-$TARGET_TRIPLE$EXE"
echo ""
echo "Then re-run 'tauri build'."