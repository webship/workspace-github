import test, { after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { register } from '../src/index';
import { githubProvider } from '../src/lib/provider';
import { association, currentMilestone, githubTracker, itemOf, permissionAssociation } from '../src/lib/tracker';

const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');
const FIX = path.join(PKG, 'tests', 'fixtures', 'tracker');
const fixture = (f: string) => fs.readFileSync(path.join(FIX, f), 'utf8');
const made: string[] = [];
after(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

function tree(remote = 'git@github.com:acme/site.git') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'github-tracker-'));
  made.push(root);
  const p = path.join(root, 'dev', 'site1');
  fs.mkdirSync(path.join(p, '.git'), { recursive: true });
  fs.writeFileSync(path.join(p, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  fs.writeFileSync(path.join(p, '.git', 'config'), `[remote "origin"]\n\turl = ${remote}\n`);
  return root;
}

/** The api, with a `run` that answers gh from the recorded fixtures and remembers every call. */
function fakeApi(root: string, settings: Record<string, unknown> = {}, answers: (cmd: string, args: string[]) => any = () => null) {
  const calls: any = { rowMenus: {}, chips: [], actions: {}, setups: [], css: [], forges: {}, fragments: [], ran: [] as any[] };
  const api: any = {
    name: 'github', config: {}, settings: { file: 'plugin.github.settings.yml', read: () => settings, set() {}, setList() {} },
    lib: {
      esc: (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)),
      ROOT: root, workspaceDir: (ws: string) => path.join(root, ws), listProjects: (dir: string) => fs.readdirSync(dir), isValidWorkspace: () => true,
      screenAction: () => {}, iconHtml: (n: string) => `<i data-icon="${n}"></i>`, NAME_RE: /^[a-zA-Z0-9_-]+$/, screensCached: () => [], listScreens: async () => [],
      cliError: (t: string) => String(t).trim().split('\n').slice(-3).join(' '),
      run: async (cmd: string, args: string[], cwd: string, opts: any = {}) => {
        calls.ran.push({ cmd, args, env: opts.env || {} });
        const a = answers(cmd, args);
        if (a) return a;
        const j = args.join(' ');
        if (/issue list/.test(j)) return { ok: true, code: 0, stdout: fixture('issue-list.json'), stderr: '' };
        if (/issue view \d+ .*comments/.test(j)) return { ok: true, code: 0, stdout: fixture('issue-view.json'), stderr: '' };
        if (/api graphql/.test(j)) return { ok: true, code: 0, stdout: fixture('graphql-issue.json'), stderr: '' };
        if (/milestones/.test(j)) return { ok: true, code: 0, stdout: fixture('milestones.json'), stderr: '' };
        if (/issue comment/.test(j)) return { ok: true, code: 0, stdout: 'https://github.com/acme/site/issues/1#issuecomment-1\n', stderr: '' };
        if (/pr create/.test(j)) return { ok: true, code: 0, stdout: 'https://github.com/acme/site/pull/4\n', stderr: '' };
        if (cmd === 'git') return { ok: true, code: 0, stdout: '', stderr: '' };
        return { ok: true, code: 0, stdout: '', stderr: '' };
      },
    },
    addRowMenu: (slot: string, spec: any, fn: any) => { calls.rowMenus[slot] = { spec, fn }; },
    addProjectChip: (fn: any) => calls.chips.push(fn), addAction: (name: string, fn: any) => { calls.actions[name] = fn; },
    addFolderSetup: (s: any) => calls.setups.push(s), addCss: (f: string) => calls.css.push(f),
    addForge: (host: string, spec: any) => { calls.forges[host] = spec; }, addFragment: (fn: any) => calls.fragments.push(fn),
    addProjectBadge: () => {}, addAssistantContext: () => {}, addSettingsOptions: () => {},
  };
  return { api, calls };
}

const SCOPE = { id: 'acme/site', name: 'acme/site', web: 'https://github.com/acme/site' };

test('associations: members and collaborators are inside; a contributor, a first-timer or nobody is not', () => {
  assert.strictEqual(association('OWNER'), 'owner');
  assert.strictEqual(association('MEMBER'), 'member');
  assert.strictEqual(association('COLLABORATOR'), 'collaborator');
  assert.strictEqual(association('CONTRIBUTOR'), 'contributor');
  for (const a of ['FIRST_TIME_CONTRIBUTOR', 'FIRST_TIMER', 'NONE', 'MANNEQUIN']) assert.strictEqual(association(a), 'outside', a);
  assert.strictEqual(association(''), 'unknown');
  assert.strictEqual(permissionAssociation('write'), 'collaborator');
  assert.strictEqual(permissionAssociation('read'), 'outside');
  assert.strictEqual(permissionAssociation(''), 'unknown');
});

test('the current milestone is the next one due, and an issue reads as the base wants it', () => {
  assert.strictEqual(currentMilestone([{ title: 'Later', due_on: '2027-01-01T00:00:00Z' }, { title: 'Soon', due_on: '2026-12-01T00:00:00Z' }, { title: 'Past', due_on: '2026-01-01T00:00:00Z' }], new Date('2026-11-24T00:00:00Z')), 'Soon');
  assert.strictEqual(currentMilestone([{ title: 'No date' }]), 'No date');
  assert.strictEqual(currentMilestone([]), '');
  const [first] = JSON.parse(fixture('issue-list.json'));
  const it = itemOf(first);
  assert.deepStrictEqual([it.id, it.state, it.stateClass, it.labels], [String(first.number), 'open', 'open', ['proof']]);
});

test('the views: mine is @me, the milestone is asked first, a search is one argument, never a shell line', async () => {
  const root = tree();
  const { api, calls } = fakeApi(root);
  const t = githubTracker(api, githubProvider(api));
  await t.list(SCOPE, { view: 'open', limit: 30 });
  assert.deepStrictEqual(calls.ran[0].args.slice(0, 7), ['issue', 'list', '-R', 'github.com/acme/site', '--state', 'open', '--limit']);
  await t.list(SCOPE, { view: 'mine', limit: 30 });
  assert.deepStrictEqual(calls.ran[1].args.slice(-2), ['--assignee', '@me']);
  const items = await t.list(SCOPE, { view: 'iteration', limit: 30 });
  assert.match(calls.ran[2].args.join(' '), /repos\/acme\/site\/milestones\?state=open&sort=due_on/);
  assert.deepStrictEqual(calls.ran[3].args.slice(-2), ['--milestone', 'Proof round 1']);
  assert.ok(items.length > 0);
  await t.list(SCOPE, { view: 'query', text: 'label:bug "two words" $(id)', limit: 30 });
  assert.deepStrictEqual(calls.ran[4].args.slice(-2), ['--search', 'label:bug "two words" $(id)']);
  assert.deepStrictEqual(await t.list(SCOPE, { view: 'assigned', limit: 30 }), [], 'assigned to nobody named: nothing asked');
});

test('one issue: the body, the comments with their associations, the author from GraphQL, and an outside editor', async () => {
  const root = tree();
  const { api } = fakeApi(root);
  const t = githubTracker(api, githubProvider(api));
  const it = await t.get(SCOPE, '1');
  assert.strictEqual(it.author.association, 'member');
  assert.strictEqual(it.comments[0].author.association, 'member');
  assert.strictEqual(it.lastEditor, undefined, 'never edited');
  const { api: a2 } = fakeApi(root, {}, (cmd, args) => {
    const j = args.join(' ');
    if (/api graphql/.test(j)) return { ok: true, code: 0, stdout: JSON.stringify({ data: { repository: { issue: { authorAssociation: 'MEMBER', lastEditedAt: '2026-11-24T10:00:00Z', editor: { login: 'stranger' } } } } }), stderr: '' };
    if (/collaborators\/stranger\/permission/.test(j)) return { ok: true, code: 0, stdout: '{"permission":"read"}', stderr: '' };
    return null;
  });
  const edited = await githubTracker(a2, githubProvider(a2)).get(SCOPE, '1');
  assert.deepStrictEqual(edited.lastEditor, { name: 'stranger', association: 'outside' });
});

test('writes go through files and gh, never with the token on a command line', async () => {
  const root = tree();
  const { api, calls } = fakeApi(root, { token: 'ghp_' + 'x1Y2'.repeat(9) });
  const t = githubTracker(api, githubProvider(api));
  const r = await t.comment!(SCOPE, '1', 'A comment with `$(id)` in it');
  assert.deepStrictEqual([r.ok, r.url], [true, 'https://github.com/acme/site/issues/1#issuecomment-1']);
  const c = calls.ran.find((x: any) => x.args[0] === 'issue' && x.args[1] === 'comment');
  assert.deepStrictEqual(c.args.slice(0, 5), ['issue', 'comment', '1', '-R', 'github.com/acme/site']);
  assert.strictEqual(c.args[5], '--body-file');
  assert.ok(!c.args.join(' ').includes('$(id)'), 'the body is in a file');
  for (const x of calls.ran) assert.ok(!x.args.join(' ').includes('ghp_'), 'no token on a command line');
  assert.strictEqual(c.env.GH_TOKEN, 'ghp_' + 'x1Y2'.repeat(9), 'the token is in the environment of gh only');
  assert.strictEqual(t.secret!(), 'ghp_' + 'x1Y2'.repeat(9));
});

test('a draft pull request is pushed only to the scope\'s own repository, with hooks off and gh\'s credential', async () => {
  const root = tree();
  const { api, calls } = fakeApi(root);
  const t = githubTracker(api, githubProvider(api));
  const dir = path.join(root, 'dev', 'site1');
  const other = await t.openRequest!({ id: 'acme/other', name: 'acme/other', web: 'https://github.com/acme/other' }, { dir, remote: '', branch: '1-x', base: 'main', title: 'T', body: 'B', draft: true });
  assert.strictEqual(other.ok, false);
  assert.match(other.error, /No remote of .* is acme\/other/);
  const r = await t.openRequest!(SCOPE, { dir, remote: '', branch: '1-x', base: 'main', title: 'Fix it', body: 'Closes #1', draft: true });
  assert.deepStrictEqual([r.ok, r.url], [true, 'https://github.com/acme/site/pull/4']);
  const push = calls.ran.find((x: any) => x.cmd === 'git');
  assert.ok(push.args.includes('core.hooksPath=/dev/null'));
  assert.ok(push.args.some((a: string) => /^credential\.https:\/\/github\.com\.helper=!.*gh auth git-credential$/.test(a)));
  assert.deepStrictEqual(push.args.slice(-3), ['push', 'https://github.com/acme/site.git', 'refs/heads/1-x:refs/heads/1-x']);
  const pr = calls.ran.find((x: any) => x.args[0] === 'pr');
  assert.deepStrictEqual(pr.args.slice(0, 10), ['pr', 'create', '-R', 'github.com/acme/site', '--head', '1-x', '--base', 'main', '--title', 'Fix it']);
  assert.strictEqual(pr.args[pr.args.length - 1], '--draft');
});

test('register(): one GITHUB button, whose menu opens the issues as work items, and the tracker\'s actions', () => {
  const root = tree();
  // gh is there (a stand-in on the PATH), so the tracker is ready and its entry takes the place of the plain list.
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  const PATH = process.env.PATH;
  process.env.PATH = `${bin}:${PATH}`;
  after(() => { process.env.PATH = PATH; });
  const { api, calls } = fakeApi(root);
  register(api);
  assert.deepStrictEqual(Object.keys(calls.rowMenus), ['github'], 'no second button');
  for (const a of ['tracker-work', 'tracker-request', 'tracker-comment', 'tracker-analyze', 'issues', 'pulls']) assert.ok(calls.actions[a], a);
  assert.strictEqual(calls.fragments.length, 1);
  const ctx: any = { key: 'dev', project: 'site1', dir: path.join(root, 'dev'), meta: {}, allowed: new Set(), vals: () => '' };
  const html = calls.rowMenus.github.fn(ctx);
  assert.match(html, /\/fragments\/p\/github\/tracker\/list\/dev\/site1/);
  assert.match(html, /Issues — get, analyze, work…/);
  assert.ok(!/Open issues<\/a>/.test(html), 'the work-item list takes the place of the plain one');
});

test('without gh the GITHUB menu keeps its plain issues list: the tracker waits until it can be used', () => {
  const root = tree();
  const PATH = process.env.PATH;
  process.env.PATH = path.join(root, 'no-bin');
  try {
    const { api, calls } = fakeApi(root);
    register(api);
    const ctx: any = { key: 'dev', project: 'site1', dir: path.join(root, 'dev'), meta: {}, allowed: new Set(), vals: () => '' };
    const html = calls.rowMenus.github.fn(ctx);
    if (!fs.existsSync('/host-local-bin/gh')) {
      assert.match(html, /Open issues<\/a>/);
      assert.ok(!/Issues — get, analyze, work/.test(html));
    }
  } finally { process.env.PATH = PATH; }
});
