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
