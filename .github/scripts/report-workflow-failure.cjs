const PATCH_WORKFLOWS = new Map([
    ['Update Runner Patches (Commit-to-Commit)', 'runner-patch-main'],
    ['Update Runner Patches (Release-to-Release)', 'runner-patch-release'],
]);
const TRACKER_MARKER = '<!-- runner-patch-failures -->';
const TRACKER_TITLE = 'Track runner patch-update failures';
const TRACKER_LABELS = ['bug', 'ci-failure', 'keep'];

/** Create or update the issue tracking a trusted failed workflow run. */
async function reportWorkflowFailure({ github, context }) {
    const run = context.payload.workflow_run;
    const repository = `${context.repo.owner}/${context.repo.repo}`;
    if (run.conclusion !== 'failure' || run.event === 'pull_request' ||
        run.head_repository?.full_name !== repository ||
        (!PATCH_WORKFLOWS.has(run.name) && !['Runner CI', 'Runner CD'].includes(run.name))) {
        return;
    }

    if (!PATCH_WORKFLOWS.has(run.name)) {
        const marker = `workflow-run-id:${run.id}`;
        const { data } = await github.rest.search.issuesAndPullRequests({
            q: `repo:${repository} is:issue is:open "${marker}" in:body`, per_page: 100,
        });
        if (data.items.some(issue =>
            [...(issue.body || '').matchAll(/workflow-run-id:(\d+)/g)]
                .some(match => Number(match[1]) === run.id))) {
            return;
        }
        await createIssue(github, context.repo, `CI/CD Pipeline Failed: ${run.name}`,
            `The GitHub Actions workflow **${run.name}** has failed.\n\n` +
            `**Run URL:** ${run.html_url}\n**Run ID:** ${run.id}\n\n${marker}\n\n` +
            'Please investigate and resolve the issue.');
        return;
    }

    // REST listing avoids the search index lag between creating a tracker and the next report.
    const issues = (await github.paginate(github.rest.issues.listForRepo, {
        ...context.repo, state: 'all', per_page: 100,
    })).filter(issue => !issue.pull_request).sort((a, b) => a.number - b.number);
    const tracker = issues.find(issue => (issue.body || '').includes(TRACKER_MARKER)) ||
        issues.find(issue => issue.state === 'open' &&
            [...PATCH_WORKFLOWS.keys()].some(name => issue.title === `CI/CD Pipeline Failed: ${name}`));
    const key = PATCH_WORKFLOWS.get(run.name);
    const start = `<!-- ${key}:start -->`;
    const end = `<!-- ${key}:end -->`;
    const section = new RegExp(`${start}[\\s\\S]*?${end}`);
    let body = tracker?.body || '';
    const previous = body.match(section)?.[0];
    const previousRun = previous?.match(/workflow-run-id:(\d+) attempt:(\d+)/);
    const attempt = run.run_attempt || 1;
    if (previousRun && (Number(previousRun[1]) > run.id ||
        (Number(previousRun[1]) === run.id && Number(previousRun[2]) >= attempt))) {
        return;
    }

    const entry = `${start}\n### ${run.name}\n\n` +
        `Latest reported failure: [run ${run.id}, attempt ${attempt}](${run.html_url})\n\n` +
        `<!-- workflow-run-id:${run.id} attempt:${attempt} -->\n${end}`;
    if (!body.includes(TRACKER_MARKER)) {
        body += `${body ? '\n\n' : ''}${TRACKER_MARKER}\n\n` +
            'This issue tracks failures from both runner patch-update workflows. ' +
            'Close manually after confirming recovery; a successful scheduled run may be a no-op.';
    }
    body = previous ? body.replace(section, () => entry) : `${body}\n\n${entry}`;

    if (tracker) {
        // The repository's stale bot must not resolve this long-lived tracker automatically.
        const existingLabels = new Set(tracker.labels.map(label => typeof label === 'string' ? label : label.name));
        const missingLabels = TRACKER_LABELS.filter(name => !existingLabels.has(name));
        for (const name of missingLabels.filter(name => name !== 'bug')) {
            await ensureLabel(github, context.repo, name);
        }
        if (missingLabels.length) {
            await github.rest.issues.addLabels({ ...context.repo, issue_number: tracker.number, labels: missingLabels });
        }
        await github.rest.issues.update({
            ...context.repo, issue_number: tracker.number,
            title: TRACKER_TITLE, body, state: 'open',
        });
    } else {
        await createIssue(github, context.repo, TRACKER_TITLE, body, TRACKER_LABELS);
    }
}

/** Create a labelled failure issue, provisioning the automation label if needed. */
async function createIssue(github, repo, title, body, labels = ['bug', 'ci-failure']) {
    for (const name of labels.filter(name => name !== 'bug')) {
        await ensureLabel(github, repo, name);
    }
    await github.rest.issues.create({ ...repo, title, body, labels });
}

/** Ensure an automation label exists without overwriting its repository configuration. */
async function ensureLabel(github, repo, name) {
    try {
        await github.rest.issues.getLabel({ ...repo, name });
    } catch (error) {
        if (error.status !== 404) throw error;
        await github.rest.issues.createLabel({
            ...repo, name,
            description: name === 'keep' ? 'Exempt from automatic stale closure' : 'Automated CI/CD pipeline failure',
            color: name === 'keep' ? '0E8A16' : 'B60205',
        });
    }
}

module.exports = { reportWorkflowFailure };
