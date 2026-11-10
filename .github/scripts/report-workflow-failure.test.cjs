const assert = require('node:assert/strict');
const { test } = require('node:test');
const { reportWorkflowFailure } = require('./report-workflow-failure.cjs');

const MAIN = 'Update Runner Patches (Commit-to-Commit)';
const RELEASE = 'Update Runner Patches (Release-to-Release)';
const TRACKER = '<!-- runner-patch-failures -->';

// Catch per-run deduplication accidentally being retained for patch failures.
test('shares one tracker across recurring failures of both patch workflows', async () => {
    const api = fakeGithub();
    await report(api, MAIN, 500);
    await report(api, RELEASE, 501);
    await report(api, MAIN, 502);

    assert.equal(api.issues.length, 1);
    assert.equal(api.issues[0].title, 'Track runner patch-update failures');
    assert.deepEqual(api.issues[0].labels, ['bug', 'ci-failure', 'keep']);
    assert.match(api.issues[0].body, /runner-patch-main/);
    assert.match(api.issues[0].body, /runner-patch-release/);
    assert.match(api.issues[0].body, /actions\/runs\/501/);
    assert.match(api.issues[0].body, /actions\/runs\/502/);
    assert.doesNotMatch(api.issues[0].body, /actions\/runs\/500/);
});

// Keep migration attached to the oldest active issue and its existing Jira ticket.
test('adopts the oldest open exact-title legacy patch issue without closing others', async () => {
    const api = fakeGithub([
        issue(249, `CI/CD Pipeline Failed: ${RELEASE}`),
        issue(247, `CI/CD Pipeline Failed: ${MAIN}`, { state: 'closed' }),
        issue(248, `CI/CD Pipeline Failed: ${MAIN}`, { body: 'Investigation and Jira link' }),
        issue(246, `CI/CD Pipeline Failed: ${MAIN} extra`),
    ]);
    await report(api, RELEASE, 500);

    assert.equal(api.issues.length, 4);
    assert.match(api.issues.find(i => i.number === 248).body, /Investigation and Jira link/);
    assert.match(api.issues.find(i => i.number === 248).body, /runner-patch-failures/);
    assert.equal(api.issues.find(i => i.number === 249).state, 'open');
    assert.equal(api.issues.find(i => i.number === 246).title, `CI/CD Pipeline Failed: ${MAIN} extra`);
});

// Long-lived trackers must use the repository's stale-bot exemption without losing human labels.
test('exempts adopted and marked trackers from stale closure while preserving labels', async t => {
    for (const [name, existing] of [
        ['legacy', issue(248, `CI/CD Pipeline Failed: ${MAIN}`, { labels: [{ name: 'bug' }, { name: 'investigating' }] })],
        ['marked', issue(248, 'Tracker', { body: TRACKER, labels: [{ name: 'bug' }] })],
        ['already exempt', issue(248, 'Tracker', { body: TRACKER, labels: [{ name: 'keep' }] })],
    ]) {
        await t.test(name, async () => {
            const api = fakeGithub([existing]);
            await report(api, MAIN, 500);
            const names = api.issues[0].labels.map(label => typeof label === 'string' ? label : label.name);
            assert.ok(names.includes('keep'));
            for (const label of existing.labels) assert.ok(names.includes(label.name));
        });
    }
});

// Prevent a closed tracker being replaced by a new issue or an unmarked legacy issue.
test('reopens the marked tracker on a new failure even when legacy issues remain', async () => {
    const api = fakeGithub([issue(248, 'Tracker', { body: TRACKER, state: 'closed' }),
        issue(247, `CI/CD Pipeline Failed: ${MAIN}`)]);
    await report(api, MAIN, 500);

    assert.equal(api.issues.length, 2);
    assert.equal(api.issues[0].state, 'open');
    assert.match(api.issues[0].body, /actions\/runs\/500/);
    assert.equal(api.issues[1].title, `CI/CD Pipeline Failed: ${MAIN}`);
});

// Make retried deliveries idempotent and avoid reopening manually closed incidents.
test('does not write or reopen for identical or stale reports', async () => {
    const api = fakeGithub();
    await report(api, MAIN, 502);
    api.issues[0].state = 'closed';
    const writes = api.writes.length;
    await report(api, MAIN, 502);
    await report(api, MAIN, 501);

    assert.equal(api.writes.length, writes);
    assert.equal(api.issues[0].state, 'closed');
    assert.match(api.issues[0].body, /actions\/runs\/502/);
});

// A rerun of an existing Actions run is a new failure even though the run ID is unchanged.
test('records a later run attempt and ignores a delayed earlier attempt', async () => {
    const api = fakeGithub();
    await report(api, MAIN, 500);
    await report(api, MAIN, 500, { run_attempt: 2 });
    const writes = api.writes.length;
    await report(api, MAIN, 500, { run_attempt: 1 });

    assert.match(api.issues[0].body, /attempt:2/);
    assert.equal(api.writes.length, writes);
});

// Updating one stream must not erase the other stream or human-authored investigation.
test('preserves human text outside managed entries and the other workflow entry', async () => {
    const api = fakeGithub();
    await report(api, MAIN, 500);
    await report(api, RELEASE, 501);
    api.issues[0].body = `Human introduction\n${api.issues[0].body}\nHuman follow-up`;
    await report(api, MAIN, 502);

    assert.ok(api.issues[0].body.startsWith('Human introduction\n'));
    assert.ok(api.issues[0].body.endsWith('\nHuman follow-up'));
    assert.match(api.issues[0].body, /actions\/runs\/501/);
    assert.match(api.issues[0].body, /actions\/runs\/502/);
});

// REST listing includes pull requests and can span multiple pages; neither may hide the tracker.
test('finds a tracker beyond the first page and excludes pull requests', async () => {
    const existing = Array.from({ length: 100 }, (_, i) => issue(i + 1, 'Unrelated'));
    existing[0].body = TRACKER;
    existing[0].pull_request = { url: 'https://api.github.com/repos/canonical/github-actions-runner/pulls/1' };
    existing.push(issue(101, 'Tracker', { body: TRACKER }));
    const api = fakeGithub(existing);
    await report(api, MAIN, 500);

    assert.equal(api.issues.length, 101);
    assert.equal(api.issues[0].title, 'Unrelated');
    assert.match(api.issues[100].body, /actions\/runs\/500/);
    assert.equal(api.pages, 2);
});

// Ordinary build and release failures must retain their current per-run reporting behavior.
test('keeps Runner CI and Runner CD reporting separate and deduplicates retries', async () => {
    for (const name of ['Runner CI', 'Runner CD']) {
        const api = fakeGithub();
        await report(api, name, 500);
        await report(api, name, 500);
        await report(api, name, 501);

        assert.equal(api.issues.length, 2);
        assert.equal(api.issues[0].title, `CI/CD Pipeline Failed: ${name}`);
        assert.deepEqual(api.issues[0].labels, ['bug', 'ci-failure']);
        assert.match(api.issues[0].body, /workflow-run-id:500/);
        assert.doesNotMatch(api.issues[0].body, /runner-patch-failures/);
    }
});

// Older reporter versions emitted literal backslash-n sequences rather than real line breaks.
test('recognizes legacy CI run markers without matching a longer run ID', async () => {
    const api = fakeGithub([
        issue(248, 'CI/CD Pipeline Failed: Runner CI', { body: 'Failure\\n\\nworkflow-run-id:500\\nPlease investigate' }),
        issue(249, 'CI/CD Pipeline Failed: Runner CI', { body: 'workflow-run-id:5010' }),
    ]);
    await report(api, 'Runner CI', 500);
    assert.equal(api.issues.length, 2);
    await report(api, 'Runner CI', 501);
    assert.equal(api.issues.length, 3);
    assert.match(api.issues[2].body, /workflow-run-id:501\n/);
});

// Untrusted or irrelevant workflow completions must not mutate repository issues.
test('ignores events outside the failure reporting boundary', async t => {
    const cases = [
        ['successful run', { conclusion: 'success' }],
        ['pull request', { event: 'pull_request' }],
        ['fork run', { head_repository: { full_name: 'someone/runner' } }],
        ['unknown workflow', { name: 'Other workflow' }],
    ];
    for (const [name, overrides] of cases) {
        await t.test(name, async () => {
            const api = fakeGithub();
            await report(api, MAIN, 500, overrides);
            assert.deepEqual(api.writes, []);
            assert.equal(api.pages, 0);
        });
    }
});

// API failures must surface to Actions instead of causing silent loss or duplicate creation.
test('propagates GitHub API errors', async t => {
    for (const operation of ['listForRepo', 'getLabel', 'createLabel', 'create', 'update', 'addLabels']) {
        await t.test(operation, async () => {
            const existing = ['update', 'addLabels'].includes(operation);
            const api = fakeGithub(existing ? [issue(248, 'Tracker', { body: TRACKER })] : []);
            api.github.rest.issues[operation] = async () => { throw new Error('GitHub unavailable'); };
            await assert.rejects(report(api, MAIN, 500), /GitHub unavailable/);
            assert.equal(api.issues.length, existing ? 1 : 0);
        });
    }
});

function issue(number, title, overrides = {}) {
    return { number, title, body: '', state: 'open', labels: ['bug'], ...overrides };
}

function report(api, name, id, overrides = {}) {
    return reportWorkflowFailure({ github: api.github, context: {
        repo: { owner: 'canonical', repo: 'github-actions-runner' },
        payload: { workflow_run: {
            name, id, run_attempt: 1, html_url: `https://github.com/canonical/github-actions-runner/actions/runs/${id}`,
            conclusion: 'failure', event: 'schedule',
            head_repository: { full_name: 'canonical/github-actions-runner' }, ...overrides,
        } },
    } });
}

function fakeGithub(existing = []) {
    const api = { issues: structuredClone(existing), writes: [], pages: 0 };
    const labels = new Set(['bug']);
    const issues = {
        async listForRepo({ owner, repo, state, per_page, page = 1 }) {
            assert.equal(`${owner}/${repo}`, 'canonical/github-actions-runner');
            assert.equal(state, 'all');
            api.pages++;
            return { data: structuredClone(api.issues.slice((page - 1) * per_page, page * per_page)) };
        },
        async getLabel({ name }) {
            if (!labels.has(name)) throw Object.assign(new Error('Not found'), { status: 404 });
            return { data: { name } };
        },
        async createLabel({ name }) { labels.add(name); return { data: { name } }; },
        async addLabels({ issue_number, labels: added }) {
            const updated = api.issues.find(i => i.number === issue_number);
            assert.ok(updated);
            updated.labels.push(...added);
            api.writes.push({ issue_number, labels: added });
            return { data: structuredClone(updated.labels) };
        },
        async create(fields) {
            const created = issue(Math.max(0, ...api.issues.map(i => i.number)) + 1, fields.title, fields);
            api.issues.push(created);
            api.writes.push(fields);
            return { data: structuredClone(created) };
        },
        async update({ issue_number, ...fields }) {
            const updated = api.issues.find(i => i.number === issue_number);
            assert.ok(updated);
            Object.assign(updated, fields);
            api.writes.push(fields);
            return { data: structuredClone(updated) };
        },
    };
    api.github = { rest: { issues }, async paginate(method, params) {
        const result = [];
        for (let page = 1; ; page++) {
            const { data } = await method({ ...params, page });
            result.push(...data);
            if (data.length < params.per_page) return result;
        }
    } };
    return api;
}
