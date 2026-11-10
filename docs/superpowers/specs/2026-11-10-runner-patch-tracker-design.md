# Runner patch failure tracker

## Intent

Prevent repeated patch-update failures from creating a new GitHub issue and Jira ticket every day. The user approved one shared tracker for the two patch workflows, with existing duplicate cleanup reviewed separately after the reporting change merges.

## Approaches

- **Selected: one shared GitHub tracker.** Stable workflow identifiers distinguish the two patch streams inside one issue; the existing Jira sync continues to track that issue.
- One tracker per workflow improves separation but still produces two tickets.
- Jira-only grouping leaves the upstream GitHub issue spam and requires broader sync changes.

## Behavior

- Use `runner-patch-main` and `runner-patch-release` for the two patch workflows and a stable shared tracker marker.
- Find the marked issue across open and closed issues. When migrating, adopt the oldest open issue with an exact legacy patch-failure title, preserving its existing body and Jira link. The current candidate is canonical/github-actions-runner#248 (ISD-7256).
- Create a tracker only when none exists; reopen it on recurrence.
- Maintain separate latest-failure entries without daily comments. Preserve human-authored text outside the managed section and the other workflow's entry.
- Serialize tracker writes, including creation, without cancelling reporting events. Avoid relying on eventually consistent issue search for identity.
- Keep closure manual: a successful scheduled run can be a no-op, not evidence that patch processing recovered.
- Preserve existing run-based reporting for Runner CI and Runner CD.

## Constraints and non-goals

Use the existing GitHub Actions environment and API; do not modify runner runtime code or the Jira bot. Keep same-repository/non-PR failure guards and least-privilege permissions. No backlog closures, comments, or Jira changes in this PR. No new runtime package dependencies.

## Verification

Mock GitHub API calls to prove creation, adoption, repeated updates, both workflow entries, reopening, idempotent retries, pagination, preservation of human text, unrelated CI/CD behavior, and error propagation. Validate the workflow wiring and serialized reporting configuration.
