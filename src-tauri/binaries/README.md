# Bundled FFmpeg / FFprobe sidecar binaries

This directory holds the FFmpeg + FFprobe executables that Tauri packages into
the installer via `bundle.externalBin` (see `tauri.conf.json`). The binaries are
**NOT committed** — they are large, platform-specific, and licensed under
LGPL/GPL depending on the build. The `.gitignore` here keeps everything except
itself out of version control.

## Why a sidecar?

Without bundling, the app depends on FFmpeg being on the user's `PATH`. That is
fine for developers but unacceptable for an end-user installer — a fresh
Windows/macOS machine has no FFmpeg. Phase 3 packages a static FFmpeg so the
YouTube visualizer render pipeline works with zero setup.

The Rust runtime resolves FFmpeg with a three-tier fallback
(`src-tauri/src/runtime/mod.rs::resolve_program`):

1. **Settings override** — `ffmpegPath` / `ffprobePath` in Settings (a
   user-supplied build always shadows the bundled one).
2. **Bundled sidecar** — the binary in this directory, resolved from the install
   dir at runtime.
3. **PATH** — the bare `ffmpeg` / `ffprobe` name (dev installs + the test
   harness; identical to pre-Phase-3 behavior).

## Naming convention

Tauri's `externalBin` appends the Rust **target triple** to each name at bundle
time. So the files here must be named exactly:

```
binaries/ffmpeg-<target-triple>[.exe]
binaries/ffprobe-<target-triple>[.exe]
```

Common triples:

| Platform | Triple |
|---|---|
| Windows x64 | `x86_64-pc-windows-msvc` |
| Windows ARM64 | `aarch64-pc-windows-msvc` |
| macOS Intel | `x86_64-apple-darwin` |
| macOS Apple Silicon | `aarch64-apple-darwin` |
| Linux x64 | `x86_64-unknown-linux-gnu` |
| Linux ARM64 | `aarch64-unknown-linux-gnu` |

Add the `.exe` suffix on Windows only.

## Acquiring the binaries

There is no single cross-platform download URL for both `ffmpeg` and `ffprobe`
that is stable + trustworthy, so the fetch scripts intentionally do not hardcode
one. Instead, download a static build for your platform, extract it, and rename
the two executables per the table above:

### Windows x64 — BtbN GPL static build
1. Download `ffmpeg-master-latest-win64-gpl.zip` from
   https://github.com/BtbN/FFmpeg-Builds/releases (latest `master-latest`
   release).
2. Extract; the `bin/` folder has `ffmpeg.exe` and `ffprobe.exe`.
3. Copy them here as `ffmpeg-x86_64-pc-windows-msvc.exe` and
   `ffprobe-x86_64-pc-windows-msvc.exe`.

### macOS — evermeet (Intel) / osxexperts (Apple Silicon)
- Intel: https://evermeet.cx/ffmpeg/ — download both `ffmpeg` and `ffprobe`
  zip releases, extract, rename to `ffmpeg-x86_64-apple-darwin` and
  `ffprobe-x86_64-apple-darwin`.
- Apple Silicon: a known Apple Silicon build; verify the source you trust and
  rename to `ffmpeg-aarch64-apple-darwin` / `ffprobe-aarch64-apple-darwin`.

### Linux x64 — BtbN linux64 gpl
1. Download `ffmpeg-master-latest-linux64-gpl.tar.xz` from BtbN.
2. Extract; copy `ffmpeg` and `ffprobe` here as
   `ffmpeg-x86_64-unknown-linux-gnu` and `ffprobe-x86_64-unknown-linux-gnu`.
3. `chmod +x` both.

### Using the helper scripts

```powershell
# Windows (from src-tauri) — explicit mirror URLs for an air-gapped build:
pwsh scripts/fetch-sidecars.ps1 -FfmpegUrl <url> -FfprobeUrl <url>
```
```bash
# macOS / Linux (from src-tauri):
FFMPEG_URL=<url> FFPROBE_URL=<url> bash scripts/fetch-sidecars.sh
```

Without URLs the scripts print the manual recipe above — they will not silently
download an unverified binary.

## Licensing

FFmpeg is distributed under the LGPL or GPL (depending on build configuration
and the codecs enabled). Bundling a GPL build makes the resulting installer a
GPL-derived distribution. Confirm your chosen build's license and your
distribution obligations before shipping. The BtbN `gpl` builds are GPL.

## Dev workflow without a sidecar

`tauri dev` and the test suite do **not** require the sidecar — when this
directory is empty, `resolve_program` falls through to PATH, exactly as before
Phase 3. Install FFmpeg on your dev machine (e.g. `winget install ffmpeg`,
`brew install ffmpeg`, or your distro's package manager) and development works
unchanged. You only need the sidecar for `tauri build` (packaging the
installer).