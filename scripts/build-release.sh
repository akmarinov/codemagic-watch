#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required to build standalone executables" >&2
  exit 1
fi

VERSION="${VERSION_OVERRIDE:-$(node -p "require('./package.json').version")}"
RELEASE_DIR="${RELEASE_DIR:-$ROOT_DIR/release}"
ARTIFACT_DIR="$RELEASE_DIR/artifacts"
STAGE_DIR="$RELEASE_DIR/stage"
BIN_NAME="codemagic-watch"

TARGETS=(
  "bun-darwin-arm64:darwin:arm64"
  "bun-darwin-x64:darwin:amd64"
  "bun-linux-arm64:linux:arm64"
  "bun-linux-x64:linux:amd64"
)

mkdir -p "$ARTIFACT_DIR" "$STAGE_DIR"
rm -rf "$ARTIFACT_DIR"/* "$STAGE_DIR"/*
: > "$RELEASE_DIR/SHA256SUMS.txt"

checksum() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

for entry in "${TARGETS[@]}"; do
  IFS=":" read -r bun_target platform arch <<<"$entry"
  artifact="${BIN_NAME}_${VERSION}_${platform}_${arch}.tar.gz"
  stage_path="$STAGE_DIR/${platform}-${arch}"
  binary_path="$stage_path/$BIN_NAME"
  archive_path="$ARTIFACT_DIR/$artifact"

  rm -rf "$stage_path"
  mkdir -p "$stage_path"

  echo "Building $bun_target -> $archive_path"
  bun build ./src/cli.ts --compile --target="$bun_target" --outfile "$binary_path"
  tar -C "$stage_path" -czf "$archive_path" "$BIN_NAME"
  printf "%s  %s\n" "$(checksum "$archive_path")" "$(basename "$archive_path")" >> "$RELEASE_DIR/SHA256SUMS.txt"
done

echo
echo "Release artifacts:"
ls -1 "$ARTIFACT_DIR"
echo
echo "Checksums:"
cat "$RELEASE_DIR/SHA256SUMS.txt"
