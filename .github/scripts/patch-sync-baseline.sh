#!/usr/bin/env bash
set -euo pipefail

architecture=$1
enabled=$2
shared_baseline=$3
patch=$4
kind=$5

if [[ "$architecture" != "riscv64" ]]; then
    printf '%s\n' "$shared_baseline"
    exit 0
fi

if [[ "${enabled,,}" != "true" ]]; then
    exit 0
fi

case "$kind" in
    commit) prefix="# From upstream commit: " ;;
    release) prefix="# From upstream release: " ;;
    *) echo "Invalid RISC-V patch marker type: $kind" >&2; exit 1 ;;
esac

if [[ ! -f "$patch" ]]; then
    echo "Invalid RISC-V patch marker: missing $patch" >&2
    exit 1
fi

marker=$(tail -n 1 "$patch")
baseline=${marker#"$prefix"}
if [[ "$marker" != "$prefix"* || -z "$baseline" ]] ||
   [[ "$kind" == "commit" && ! "$baseline" =~ ^([0-9a-f]{40}|[0-9a-f]{64})$ ]] ||
   [[ "$kind" == "release" && ! "$baseline" =~ ^v[0-9][0-9A-Za-z.+_-]*$ ]]; then
    echo "Invalid RISC-V patch marker in $patch" >&2
    exit 1
fi

printf '%s\n' "$baseline"
