## ppc64le and s390x: install the .NET 8 runtime first

Unlike the other packages, `actions-runner-linux-ppc64le-<RUNNER_VERSION>.tar.gz` and `actions-runner-linux-s390x-<RUNNER_VERSION>.tar.gz` are not self-contained. They need the .NET 8 runtime installed on the machine. Without it, the runner never connects to GitHub. It exits with `You must install .NET to run this application` and keeps restarting.

On Ubuntu 24.04:

```bash
sudo apt-get install -y dotnet-runtime-8.0
```

On Ubuntu 26.04, `dotnet-runtime-8.0` is in `ppa:dotnet/backports`:

```bash
sudo add-apt-repository -y ppa:dotnet/backports
sudo apt-get install -y dotnet-runtime-8.0
```

## Linux ARM32 runner override

The ARM32 runner build retains the local `RUNNER_IGNORE_ARM32_KILL_SWITCH` environment variable. It is read only from the runner process environment, not from workflow variables or the Actions service. The default ignores service-driven ARM32 deprecation and kill signals; set it to `false` to explicitly re-enable them.

## Runner package contents

Package validation now checks that published bundles contain the expected Node runtime and version. Linux ARM32 bundles use Node 22; other Linux bundles use Node 24.

## Linux RISC-V 64 runner (experimental)

The RISC-V runner is an unofficial build using the community
[.NET 10 SDK](https://github.com/filipnavara/dotnet-riscv) and
[Node.js RISC-V builds](https://unofficial-builds.nodejs.org/). Neither is an
official Microsoft-supported RISC-V runner runtime. Track their security
updates and update the SDK version, archive checksum, Node versions and Node
checksums together when upgrading.

Only Node 24 is bundled. Actions requesting Node 12, 16 or 20 use Node 24 on
RISC-V, even when Node 20 is explicitly enabled. Older actions may need to be
updated for Node 24. Individual actions, container images and tools also need
RISC-V support; JavaScript actions in Alpine job containers are not supported
on non-x64 runners.

### Build on RISC-V

Apply `patches/runner-main-sdk8-riscv64.patch` for the current main source, or
`patches/runner-sdk8-riscv64.patch` for the corresponding upstream release
source. The patch names follow the existing architecture-patch convention;
the RISC-V target uses .NET 10, not .NET 8. Apply the workflow-test patch
separately before running L0 tests.

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
# Use runner-sdk8-riscv64.patch instead for the corresponding release.
git apply patches/runner-main-sdk8-riscv64.patch
git apply patches/patch-sync-l0.patch
cd src
./dev.sh layout Release linux-riscv64
../.github/scripts/strip-bundled-npm.sh ../_layout linux-riscv64
./dev.sh test
./dev.sh package Release linux-riscv64
```

Keep the SDK separate from .NET 8 so the RISC-V build does not select the
.NET 8 SDK. Node archives are checksum-verified before extraction. The
resulting archive is `_package/actions-runner-linux-riscv64-<version>.tar.gz`.
Refresh `patches/patch-sync-l0.patch` if its upstream test file changes. While
RISC-V is disabled, x64 CI warns and skips those workflow tests if the patch is
stale; when RISC-V is enabled, CI requires the patch to apply.

### Enable CI and releases

CI and releases do not schedule RISC-V builds by default. Once a native
Ubuntu 24.04 RISC-V builder with the self-hosted labels `noble`, `generic` and
`riscv64` is available, refresh and check both RISC-V patches against the
current main source and latest upstream release before setting the repository
variable `ENABLE_RISCV64_BUILDS` to `true`. Patch synchronization skips RISC-V
while disabled and uses each RISC-V patch's own source marker when enabled.
Enabling the variable does not itself refresh stale patches; update the pinned
Node checksum when porting to a new Node version. Enabled releases run the
RISC-V L0 tests and package smoke test, then publish the archive and its
SHA-256 checksum.

Configure RISC-V runners with `--disableupdate` and maintain timely upgrades
from this repository's releases; GitHub's official runner download service
does not provide this fork's RISC-V package.
