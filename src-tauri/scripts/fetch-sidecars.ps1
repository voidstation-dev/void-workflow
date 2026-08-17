# fetch-sidecars.ps1 — download platform-appropriate FFmpeg + FFprobe binaries
# into src-tauri/binaries/, named with the Rust target triple so Tauri's
# `bundle.externalBin` picks them up at build time.
#
# FFmpeg is NOT bundled in this repo: it is large, platform-specific, and
# licensed under LGPL/GPL depending on build. This script fetches a known-good
# static build so contributors can produce installers that ship FFmpeg without
# every machine needing it on PATH.
#
# Usage (from src-tauri):
#   pwsh scripts/fetch-sidecars.ps1            # auto-detect host target triple
#   pwsh scripts/fetch-sidecars.ps1 -TargetTriple x86_64-pc-windows-msvc
#
# Override the source URL with -FfmpegUrl / -FfprobeUrl for an internal mirror.
param(
  [string]$TargetTriple = "",
  [string]$FfmpegUrl = "",
  [string]$FfprobeUrl = ""
)

$ErrorActionPreference = "Stop"

# Default to the host's Rust target triple. Matches `rustc -vV`'s host line so a
# bare `cargo tauri build` on the dev machine finds the right binary.
if ([string]::IsNullOrEmpty($TargetTriple)) {
  $TargetTriple = (rustc -vV | Select-String "host:").ToString().Split(' ')[1].Trim()
}

$BinariesDir = Join-Path $PSScriptRoot ".." "binaries"
if (-not (Test-Path $BinariesDir)) { New-Item -ItemType Directory -Path $BinariesDir | Out-Null }

$IsWindows = $TargetTriple -like "*windows*"
$ExeSuffix = if ($IsWindows) { ".exe" } else { "" }

# Default download sources — static builds from a public mirror. Replace with an
# internal mirror via -FfmpegUrl / -FfprobeUrl for air-gapped environments.
$Base = switch -Wildcard ($TargetTriple) {
  "x86_64-pc-windows-msvc" { "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest" }
  "aarch64-pc-windows-msvc" { "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest" }
  "x86_64-apple-darwin" { "https://evermeet.cx/ffmpeg/getrelease/zip" }
  "aarch64-apple-darwin" { "https://www.osxexperts.net" } # placeholder; replace with a known mirror
  "x86_64-unknown-linux-gnu" { "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest" }
  default { "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest" }
}

function Save-Binary([string]$Name, [string]$Url) {
  $Dest = Join-Path $BinariesDir "$Name-$TargetTriple$ExeSuffix"
  Write-Host "Downloading $Name -> $Dest"
  Write-Host "  from $Url"
  Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing
  if (-not $IsWindows) {
    # macOS/Linux binaries need the executable bit set.
    chmod +x $Dest
  }
  Write-Host "  done."
}

# When explicit URLs are passed, use them verbatim (air-gapped / internal mirror).
if ($FfmpegUrl -and $FfprobeUrl) {
  Save-Binary "ffmpeg" $FfmpegUrl
  Save-Binary "ffprobe" $FfprobeUrl
  return
}

# Otherwise point the user at the manual steps — a single reliable cross-platform
# download URL for BOTH binaries doesn't exist, so we don't fake one. Fetch the
# static build archive for the platform and extract ffmpeg + ffprobe, then rename
# with the target triple as above. See binaries/README.md for the manual recipe.
Write-Host ""
Write-Host "No -FfmpegUrl/-FfprobeUrl provided. The reliable cross-platform"
Write-Host "source is a per-platform static archive (BtbN / evermeet / osxexperts),"
Write-Host "which must be extracted before renaming. See:"
Write-Host "  src-tauri/binaries/README.md"
Write-Host ""
Write-Host "Place the extracted executables at:"
Write-Host "  src-tauri/binaries/ffmpeg-$TargetTriple$ExeSuffix"
Write-Host "  src-tauri/binaries/ffprobe-$TargetTriple$ExeSuffix"
Write-Host ""
Write-Host "Then re-run `tauri build`."