#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export CARGO_TARGET_DIR="$PWD/src-tauri/target"
npx tauri build
npx vite build --config vite.installer.config.ts
cargo build --release --manifest-path installer/Cargo.toml
mkdir -p release
cp src-tauri/target/release/next-day-setup.exe release/NextDaySetup.exe

key="${NEXTDAY_UPDATE_KEY:-$HOME/.tauri/next-day.key}"
if [ ! -f "$key" ]; then
  echo "Ключа $key нет, поэтому latest.json для автообновления не создан."
  exit 0
fi
version="$(node -p "require('./package.json').version")"
npx tauri signer sign -f "$key" -p "" --app-version "$version" release/NextDaySetup.exe > /dev/null
signature="$(cat release/NextDaySetup.exe.sig)"
url="https://github.com/IgorBerezkin/NextDay/releases/download/v$version/NextDaySetup.exe"
printf '{\n  "version": "%s",\n  "url": "%s",\n  "signature": "%s"\n}\n' "$version" "$url" "$signature" > release/latest.json
echo "К релизу v$version приложить release/NextDaySetup.exe и release/latest.json"
