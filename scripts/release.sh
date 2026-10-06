#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export CARGO_TARGET_DIR="$PWD/src-tauri/target"
npx tauri build
npx vite build --config vite.installer.config.ts
cargo build --release --manifest-path installer/Cargo.toml
mkdir -p release
cp src-tauri/target/release/next-day-setup.exe "release/Next Day Setup.exe"
