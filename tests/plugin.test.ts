import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { register, githubProvider } from '../src/index';

const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');

function fakeApi(root: string, settings: Record<string, unknown> = {}) {
  const calls: any = { rowMenus: {}, chips: [], actions: {}, setups: [], css: [], forges: {} };
  const api: any = {
    name: 'github', config: {}, settings: { file: 'plugin.github.settings.yml', read: () => settings, set() {}, setList() {} },
    lib: {
      esc: (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)),
      ROOT: root, workspaceDir: (ws: string) => path.join(root, ws), listProjects: (dir: string) => fs.readdirSync(dir),
      screenAction: (send: any, o: any) => { calls.screen = o; send('started'); }, iconHtml: (n: string) => `<i data-icon="${n}"></i>`, NAME_RE: /^[a-zA-Z0-9_-]+$/,
      run: async (cmd: string, args: string[]) => { calls.ran = [cmd, ...args]; return { ok: true, code: 0, stdout: '[{\"number\":7,\"title\":\"Fix the thing\",\"url\":\"https://github.com/webship/workspace/issues/7\",\"author\":{\"login\":\"me\"},\"updatedAt\":\"2026-11-01T00:00:00Z\"}]', stderr: '' }; },
    },
    addRowMenu: (slot: string, spec: any, fn: any) => { calls.rowMenus[slot] = { spec, fn }; },
    addProjectChip: (fn: any) => calls.chips.push(fn), addAction: (name: string, fn: any) => { calls.actions[name] = fn; },
    addFolderSetup: (s: any) => calls.setups.push(s), addCss: (f: string) => calls.css.push(f),
    addForge: (host: string, spec: any) => { calls.forges[host] = spec; },
  };
  return { api, calls };
}

function tree(remote: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'github-'));
  const p = path.join(root, 'dev', 'site1');
  fs.mkdirSync(path.join(p, '.git'), { recursive: true });
  fs.writeFileSync(path.join(p, '.git', 'HEAD'), 'ref: refs/heads/feature-x\n');
  fs.writeFileSync(path.join(p, '.git', 'config'), `[remote "origin"]\n\turl = ${remote}\n`);
  return root;
}

test('the package requires nothing outside itself, and the manifest names files that ship', () => {
  for (const f of ['src/index.ts', 'src/lib/provider.ts']) {
    assert.doesNotMatch(fs.readFileSync(path.join(PKG, f), 'utf8'), /from ['"]\.\.\/\.\./, `${f} reaches outside the package`);
  }
  const m = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8')).workspacePlugin;
  assert.strictEqual(m.name, 'github');
  assert.strictEqual(m.legacySettingsKey, 'git.github');
  for (const f of [m.settingsTemplate, m.labels, m.scripts.hostInstall, ...((m.ddev && m.ddev.compose) || []), ...(m.features || [])]) assert.ok(fs.existsSync(path.join(PKG, f)), `${f} is in the package`);
});

test('the provider: host, a remote on it reads as owner/name, the pages, the clone URL and the credential gate', () => {
  const p = githubProvider(fakeApi(os.tmpdir(), { host: 'github.com', token: 'ghp_x', use_gh_cli: 'false' }).api);
  assert.strictEqual(p.id, 'github');
  assert.strictEqual(p.host(), 'github.com');
  const repo = p.repoOf('git@github.com:webship/workspace.git', 'origin');
  assert.ok(repo, 'the sample remote is on this forge');
  assert.strictEqual(repo.path, 'webship/workspace');
  assert.strictEqual(repo.web, 'https://github.com/webship/workspace');
  assert.strictEqual(p.repoOf('git@elsewhere.test:a/b.git', 'origin'), null);
  assert.strictEqual(p.cloneUrl('webship/workspace'), 'https://github.com/webship/workspace.git');
  assert.match(p.urls(repo).issues, /^https:\/\//);
  assert.match(p.urls(repo).newPull('feature-x'), /feature-x/);
  const env = p.env();
  assert.ok(env, 'a configured token gives an environment');
  assert.strictEqual(env.GH_TOKEN, 'ghp_x');
  assert.strictEqual(githubProvider(fakeApi(os.tmpdir(), { token: 'CHANGE_ME' }).api).env(), null, 'CHANGE_ME is no credential');
});

test('register() puts the GITHUB menu on a project whose remote is here, and the credential on the host', async () => {
  const root = tree('git@github.com:webship/workspace.git');
  const { api, calls } = fakeApi(root, { host: 'github.com', token: 'ghp_x', use_gh_cli: 'false' });
  register(api);
  assert.deepStrictEqual(Object.keys(calls.forges), ['github.com']);
  assert.deepStrictEqual(calls.rowMenus.github.spec, { label: 'GITHUB', row: 0 });
  const ctx: any = { key: 'dev', project: 'site1', dir: path.join(root, 'dev'), meta: {}, allowed: new Set(), vals: () => "hx-vals='{}'" };
  const html = calls.rowMenus.github.fn(ctx);
  assert.match(html, /GITHUB/);
  assert.ok(html.includes('webship/workspace'));
  let out = '';
  await calls.actions.issues({ form: { projectName: 'site1' }, send: (h: string) => { out = h; }, workspace: 'dev' });
  assert.match(out, /#7 Fix the thing/);
});

test('a remote on another forge gets no GITHUB menu', () => {
  const root = tree('git@elsewhere.test:a/b.git');
  const { api, calls } = fakeApi(root);
  register(api);
  assert.strictEqual(calls.rowMenus.github.fn({ key: 'dev', project: 'site1', dir: path.join(root, 'dev'), meta: {}, allowed: new Set(), vals: () => '' }), null);
});
