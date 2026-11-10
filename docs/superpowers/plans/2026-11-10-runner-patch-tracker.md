# Runner Patch Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse one GitHub/Jira tracking pair for patch-update failures rather than one pair per failed run.

**Architecture:** Extract reporting into a dependency-free CommonJS module called from actions/github-script. Use paginated issue listing and stable body markers to identify the shared tracker, preserving human text outside a managed section. Serialize reporter runs and retain per-run reporting for unrelated CI/CD failures.

**Tech Stack:** GitHub Actions, GitHub REST API via actions/github-script, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-11-10-runner-patch-tracker-design.md`

## Global Constraints

- Stable workflow identifiers: `runner-patch-main`, `runner-patch-release`.
- One shared patch tracker; reopen on recurrence; manual closure only.
- Adopt the oldest exact-title open legacy patch issue when no marked tracker exists.
- Preserve human text, other workflow entries, and existing Runner CI/CD behavior.
- Preserve same-repository/non-PR failure guards; add no runtime package dependencies.
- Do not close or modify backlog issues or Jira tickets during implementation.

## Review Focus

- A closed marked tracker must win over unmarked legacy issues.
- Issue listing must paginate and exclude pull requests.
- API failures must fail reporting rather than silently create duplicates.
- A retry or older run must not erase a newer failure or human investigation notes.
- Concurrent reporting must not cancel pending events or allow duplicate tracker creation.

---

### Task 1: Implement and wire stable patch failure reporting

**Files:**
- Create: `.github/scripts/report-workflow-failure.cjs`
- Create: `.github/scripts/report-workflow-failure.test.cjs`
- Modify: `.github/workflows/create-issue-on-failure.yaml`
- Create: `.github/workflows/test-failure-reporting.yaml`

**Interfaces:**
- Consumes: `reportWorkflowFailure({ github, context })`, where `github` is the actions/github-script REST client and `context.payload.workflow_run` is the completed run.
- Produces: GitHub issue creation/update/reopen API calls, with stable tracker and managed-section body markers; no comments.

- [ ] **Step 1: Write failing tests.** Use `node:test` and `node:assert/strict` with an in-memory GitHub API double. Assert one issue across repeated runs and both patch workflows; adoption of the oldest exact-title open legacy issue; reuse/reopen of a closed marked tracker; no write on an identical retry; preservation of human text and the second workflow's entry; no regression on an older run; paginated issue identity excluding PRs; failure propagation; unchanged Runner CI/CD per-run deduplication.
- [ ] **Step 2: Run red tests.** Run `node --test .github/scripts/report-workflow-failure.test.cjs`; expect failure because the module does not yet exist.
- [ ] **Step 3: Implement reporting.** Export `async function reportWorkflowFailure({ github, context })` from the CommonJS module. Use a stable shared tracker marker and managed per-workflow sections, paginated REST issue listing, exact legacy titles for adoption, current `bug`/`ci-failure` labels, and one issue update rather than comments. Retain the existing run-ID marker for ordinary CI/CD failures. Keep human text outside managed sections and compare run identities to ignore older events.
- [ ] **Step 4: Wire and test workflows.** Replace the inline reporter shell with actions/github-script loading the module. Preserve failure/source guards and permissions. Configure serialized reporting with a supported queue setting that does not drop pending runs; confirm current GitHub Actions syntax before selecting it. Add a path-filtered, read-only test workflow running the Node tests and automated assertions for the reporter guards and concurrency wiring.
- [ ] **Step 5: Run verification.** Run Node tests, actionlint for both touched workflows, and `git diff --check`; require all checks to pass. Review the diff for unexpected files and ensure no live issue mutations were used in tests.
- [ ] **Step 6: Review and raise PR.** Follow the repo PR template if present; perform an independent code review, address findings, commit as `fix(ci): group runner patch failures in one tracker`, push `fix/group-runner-patch-failures`, and open a PR. Explain adoption and that backlog cleanup is separate.

## Execution status

- [x] Approved design recorded.
- [x] Plan self-reviewed against the design.
- [x] Implementation approach confirmed (native execution).
- [x] Task 1 implementation and independent review complete.

Steps 1–5 verified: 25 Node tests pass; source guards, permissions, module wiring, and max queue checked on parsed YAML; actionlint passes with only its unsupported `queue` schema diagnostic excluded; `git diff --check` passes. Independent review identified the repository's stale-bot exemption requirement; new regression tests failed before applying the existing `keep` label to patch trackers, then the suite passed. Publication is the final step.

Full runtime suite: `cd src && ./dev.sh test` was attempted and stopped after approximately 12 minutes while provisioning external Node distributions, before any runtime tests ran. No .NET runtime code is changed.

Review limitations: GitHub/Jira mutations and hosted queue execution were not tested live. The documented queue supports up to 100 pending reports. Preservation covers human text read before updating, not concurrent human edits during the API read/write window.
