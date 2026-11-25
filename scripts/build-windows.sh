#!/usr/bin/env bash
# Cross-build the Windows app from WSL (or any Linux) with cargo-xwin, copy the exe to the
# Windows side and launch it. Why this shape: docs/architecture.md → "Building the Windows
# app from WSL".
#
# Prerequisites (Ubuntu 24.04):
#   sudo apt install -y clang lld llvm clang-tools-18      linker + resource compiler
#   curl https://sh.rustup.rs | sh                          Rust (per-user)
#   rustup target add x86_64-pc-windows-msvc
#   cargo install --locked cargo-xwin                      (or a prebuilt release)
#   Node 22+ and pnpm in WSL                               (nothing Node-ish on Windows)
#
# Usage: scripts/build-windows.sh [--release|--debug] [--no-run] [--skip-ui]
#   --release / --debug  cargo profile (default: debug — faster to compile, same UI speed)
#   --no-run             build + copy only
#   --skip-ui            don't rebuild ui/dist (the Rust build embeds whatever is there)
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
TARGET=x86_64-pc-windows-msvc
PROFILE=debug
RUN=1
BUILD_UI=1
for arg in "$@"; do
  case "$arg" in
    --release) PROFILE=release ;;
    --debug) PROFILE=debug ;;
    --no-run) RUN=0 ;;
    --skip-ui) BUILD_UI=0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

# shellcheck disable=SC1091
[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
command -v cargo-xwin >/dev/null 2>&1 || { echo "cargo-xwin is missing — see the header of this script" >&2; exit 1; }

# 1) UI bundle — built in WSL, embedded into the exe by the Rust build.
if [ "$BUILD_UI" = 1 ]; then
  pnpm --dir ui install --frozen-lockfile
  pnpm --dir ui build
fi
[ -d ui/dist ] || { echo "ui/dist is missing — build the UI first (drop --skip-ui)" >&2; exit 1; }

# 2) Linker. cargo-xwin drives the MSVC-compatible compiler `clang-cl` and needs lld + llvm-rc.
#    Prefer a real clang-cl (PATH, then the LLVM lib dir); fall back to the in-repo shim.
if ! command -v clang-cl >/dev/null 2>&1; then
  for d in /usr/lib/llvm-*/bin; do
    [ -x "$d/clang-cl" ] && { export PATH="$d:$PATH"; break; }
  done
fi
command -v clang-cl >/dev/null 2>&1 || export PATH="$ROOT/scripts/bin:$PATH"
for tool in clang-cl lld-link llvm-rc llvm-ar; do
  command -v "$tool" >/dev/null 2>&1 || { echo "missing $tool — on Ubuntu: sudo apt install clang lld llvm clang-tools-18" >&2; exit 1; }
done

# 3) Cross-compile. The first run downloads the Microsoft CRT + Windows SDK (x64 only).
export XWIN_ACCEPT_LICENSE=1
export XWIN_ARCH=x86_64
echo "▶ cargo xwin build ($PROFILE) · $(clang-cl --version | head -1)"
( cd app && cargo xwin build --profile "$PROFILE" --target "$TARGET" --features custom-protocol )

EXE="$ROOT/app/target/$TARGET/$PROFILE/computer-visualizer.exe"
[ -f "$EXE" ] || { echo "the build produced no exe at $EXE" >&2; exit 1; }
ls -la "$EXE" | awk '{print "▶ built " $5 " bytes  " $9}'

# 4) Copy next to the user's other local apps — never run it from the WSL share — and launch.
if ! grep -qi microsoft /proc/version 2>/dev/null; then
  echo "not inside WSL — the exe is at $EXE"
  exit 0
fi
WIN_LOCAL=$(powershell.exe -NoProfile -NonInteractive -Command 'Write-Output $env:LOCALAPPDATA' | tr -d '\r\n')
DEST_WIN="$WIN_LOCAL\\computer-visualizer"
DEST=$(wslpath -u "$WIN_LOCAL")/computer-visualizer
mkdir -p "$DEST"
cp "$EXE" "$DEST/computer-visualizer.exe"
echo "▶ copied to $DEST_WIN\\computer-visualizer.exe"
if [ "$RUN" = 1 ]; then
  powershell.exe -NoProfile -NonInteractive -Command "Start-Process -FilePath '$DEST_WIN\\computer-visualizer.exe'"
  echo "▶ launched"
fi
