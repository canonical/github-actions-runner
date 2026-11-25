# Linux RISC-V 64 runner

The RISC-V runner is an unofficial build. It uses the community
[.NET 10 SDK](https://github.com/filipnavara/dotnet-riscv) and the Node.js
[unofficial RISC-V builds](https://unofficial-builds.nodejs.org/). Neither is
an official Microsoft-supported RISC-V runner runtime. Track their security
updates and update the SDK version, archive checksum, Node versions and Node
checksums together when upgrading.

## Build on RISC-V

Apply `patches/runner-main-sdk8-riscv64.patch` for the current main source, or
`patches/runner-sdk8-riscv64.patch` for the corresponding upstream release
source. The patch names follow the existing architecture-patch convention;
the RISC-V target uses .NET 10, not .NET 8.

Install the community SDK and its included runtime packs in a separate
directory, then put its `dotnet` on `PATH`:

```sh
version=10.0.115
archive="dotnet-sdk-${version}-linux-riscv64.tar.gz"
curl -fLO "https://github.com/filipnavara/dotnet-riscv/releases/download/${version}/${archive}"
echo "f06bcd3f7cff2781711150ae817190ce67d630b075be0b0aedeb021049c8a0d4  ${archive}" | sha256sum --check
mkdir -p "$HOME/dotnet-riscv64"
tar -xzf "$archive" -C "$HOME/dotnet-riscv64"
export DOTNET_ROOT="$HOME/dotnet-riscv64"
export PATH="$DOTNET_ROOT:$PATH"
cd src
./dev.sh layout Release linux-riscv64
../.github/scripts/strip-bundled-npm.sh ../_layout linux-riscv64
./dev.sh test
./dev.sh package Release linux-riscv64
```

The SDK must be installed separately from .NET 8 so the RISC-V build does not
select the .NET 8 SDK. Only Node 24 is bundled, and its archive is
checksum-verified before extraction. The resulting archive is
`_package/actions-runner-linux-riscv64-<version>.tar.gz`.

Actions requesting Node 12, 16 or 20 run with Node 24 on RISC-V, even when
Node 20 is explicitly enabled by an environment variable. The internal Node
runtime also falls back to Node 24 if Node 20 is requested. Older actions may
be incompatible with Node 24 and may need to be updated.

## Enable CI and releases

CI and releases do not schedule RISC-V builds by default. Once a native
Ubuntu 24.04 RISC-V builder with the self-hosted labels `noble`, `generic` and
`riscv64` is available, set the repository variable `ENABLE_RISCV64_BUILDS`
to `true`. Enabled releases run the RISC-V L0 tests and package smoke test,
then publish the archive and its SHA-256 checksum.

Configure RISC-V runners with `--disableupdate` and maintain timely upgrades
from this repository's releases; GitHub's official runner download service
does not provide this fork's RISC-V package. Individual actions, container
images and tools used by jobs also need RISC-V support. JavaScript actions in
Alpine job containers are not supported on non-x64 runners.
