#if OS_LINUX
using System;
using System.Diagnostics;
using System.IO;
using Xunit;

namespace GitHub.Runner.Common.Tests.Workflow
{
    public sealed class PatchSyncL0
    {
        [Theory]
        [InlineData("")]
        [InlineData("false")]
        [Trait("Level", "L0")]
        [Trait("Category", "Common")]
        public void DisabledRiscVDoesNotRequireAPatch(string enabled)
        {
            var result = GetBaseline("riscv64", enabled, "global", "missing.patch", "commit");

            Assert.Equal(0, result.ExitCode);
            Assert.Equal(string.Empty, result.Output);
        }

        [Theory]
        [InlineData("ppc64le", "false")]
        [InlineData("s390x", "true")]
        [InlineData("arm", "")]
        [Trait("Level", "L0")]
        [Trait("Category", "Common")]
        public void ExistingArchitecturesKeepTheSharedBaseline(string architecture, string enabled)
        {
            var result = GetBaseline(architecture, enabled, "global", "missing.patch", "commit");

            Assert.Equal(0, result.ExitCode);
            Assert.Equal("global", result.Output);
        }

        [Theory]
        [InlineData("commit", "# From upstream commit: 0123456789abcdef0123456789abcdef01234567", "0123456789abcdef0123456789abcdef01234567")]
        [InlineData("release", "# From upstream release: v2.338.2", "v2.338.2")]
        [Trait("Level", "L0")]
        [Trait("Category", "Common")]
        public void EnabledRiscVUsesItsOwnPatchBaseline(string kind, string marker, string expected)
        {
            string patch = Path.GetTempFileName();
            try
            {
                File.WriteAllText(patch, $"diff --git a/file b/file\n{marker}\n");

                var result = GetBaseline("riscv64", "true", "newer-global", patch, kind);

                Assert.Equal(0, result.ExitCode);
                Assert.Equal(expected, result.Output);
            }
            finally
            {
                File.Delete(patch);
            }
        }

        [Theory]
        [InlineData("commit", "# From upstream release: v2.338.2")]
        [InlineData("commit", "# From upstream commit: not-a-commit")]
        [InlineData("release", "# From upstream release: ")]
        [InlineData("release", "# From upstream release: -not-a-tag")]
        [Trait("Level", "L0")]
        [Trait("Category", "Common")]
        public void EnabledRiscVRejectsInvalidPatchMarkers(string kind, string marker)
        {
            string patch = Path.GetTempFileName();
            try
            {
                File.WriteAllText(patch, $"{marker}\n");

                var result = GetBaseline("riscv64", "true", "global", patch, kind);

                Assert.NotEqual(0, result.ExitCode);
                Assert.Contains("Invalid RISC-V patch marker", result.Error);
            }
            finally
            {
                File.Delete(patch);
            }
        }

        private static (int ExitCode, string Output, string Error) GetBaseline(params string[] arguments)
        {
            string script = Path.GetFullPath(Path.Combine(TestUtil.GetSrcPath(), "..", ".github", "scripts", "patch-sync-baseline.sh"));
            var startInfo = new ProcessStartInfo("bash")
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
            };
            startInfo.ArgumentList.Add(script);
            foreach (string argument in arguments)
            {
                startInfo.ArgumentList.Add(argument);
            }

            using var process = Process.Start(startInfo);
            string output = process.StandardOutput.ReadToEnd().TrimEnd('\r', '\n');
            string error = process.StandardError.ReadToEnd();
            process.WaitForExit();
            return (process.ExitCode, output, error);
        }
    }
}
#endif
