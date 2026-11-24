#!/usr/bin/env bash
set -euo pipefail

version=10.0.115
sha256=f06bcd3f7cff2781711150ae817190ce67d630b075be0b0aedeb021049c8a0d4
archive="${RUNNER_TEMP:?}/dotnet-sdk-${version}-linux-riscv64.tar.gz"
sdk_dir="${RUNNER_TEMP}/dotnet-riscv64-${version}"

curl -fsSL --retry 3 -o "$archive" \
  "https://github.com/filipnavara/dotnet-riscv/releases/download/${version}/dotnet-sdk-${version}-linux-riscv64.tar.gz"
printf '%s  %s\n' "$sha256" "$archive" | sha256sum --check
mkdir -p "$sdk_dir"
tar -xzf "$archive" -C "$sdk_dir"
rm "$archive"

"$sdk_dir/dotnet" --version
echo "$sdk_dir" >> "${GITHUB_PATH:?}"
echo "DOTNET_ROOT=$sdk_dir" >> "${GITHUB_ENV:?}"
