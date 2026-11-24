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

## Maintainer note: bundled Node runtime checks

Architecture package validation checks that each package contains only its selected Node major. If upstream changes the supported Node major, update the corresponding runtime patch, package assertions, and ARM32 container check together.
