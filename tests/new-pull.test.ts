/**
 * "Open a pull request from <branch>…" asks gh before it pushes anything, and pushes to the remote the
 * GitHub repository was found on (#25).
 *
 * It ran `git push -u origin <branch> && gh pr create …`: without gh, or with gh not signed in at the host,
 * the branch was pushed and only then did the request fail; and it always pushed to origin, so a project
 * whose GitHub repository is another remote got its branch pushed to whatever origin is.
 *
 * The line is run for real with bash, against stand-in `git` and `gh` that write down how they were called.
 */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

import { githubProvider } from '../src/index';

const api = (settings: Record<string, unknown> = {}): any => ({ name: 'github', config: {}, settings: { file: 'plugin.github.settings.yml', read: () => settings, set() {}, setList() {} }, lib: {} });

/** A folder of stand-ins: git and, unless left out, gh (whose `auth status` answers `authStatus`). */
function bin(withGh: boolean, authStatus = 0) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-new-pull-'));
  const log = path.join(dir, 'calls.log');
  const stub = (name: string, body = '') => fs.writeFileSync(path.join(dir, name),
    `#!/bin/bash\nprintf '%s' "${name}" >> "${log}"; for a in "$@"; do printf ' [%s]' "$a" >> "${log}"; done; printf '\\n' >> "${log}"\n${body}exit 0\n`, { mode: 0o755 });
  stub('git');
  if (withGh) stub('gh', `[ "$1 $2" = "auth status" ] && exit ${authStatus}\n`);
  return { dir, log, calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : []) };
}

const repo = { path: 'acme/site', web: 'https://github.com/acme/site', remote: 'github' };
const run = (line: string, b: { dir: string }, env: Record<string, string> = {}) =>
  spawnSync('/bin/bash', ['-c', line], { encoding: 'utf8', env: { PATH: b.dir, HOME: os.tmpdir(), ...env } });

test('without gh, nothing is pushed: the line says gh is missing, where to get it and the page that opens one instead', () => {
  const b = bin(false);
  const out = run(githubProvider(api()).newPullCommand!(repo, 'feature-x'), b);
  assert.strictEqual(out.status, 1);
  assert.match(out.stdout, /gh is not installed, and opening a pull request from here needs it: https:\/\/cli\.github\.com/);
  assert.match(out.stdout, /https:\/\/github\.com\/acme\/site\/compare\/feature-x\?expand=1\. Nothing was pushed\./);
  assert.deepStrictEqual(b.calls(), [], 'git was not run');
});

test('with gh not signed in at the host, nothing is pushed and the line names the login to run', () => {
  const b = bin(true, 1);
  const out = run(githubProvider(api({ host: 'git.example.invalid' })).newPullCommand!({ ...repo, web: 'https://git.example.invalid/acme/site' }, 'feature-x'), b);
  assert.strictEqual(out.status, 1);
  assert.match(out.stdout, /gh is not signed in at git\.example\.invalid: run gh auth login --hostname git\.example\.invalid, then try again\. Nothing was pushed\./);
  assert.deepStrictEqual(b.calls(), ['gh [auth] [status] [--hostname] [git.example.invalid]'], 'only the login was asked');
});

test('signed in, the branch goes to the remote the repository is on, quoted, then the pull request is opened', () => {
  const b = bin(true, 0);
  const out = run(githubProvider(api()).newPullCommand!(repo, 'feat;x'), b);
  assert.strictEqual(out.status, 0, out.stdout + out.stderr);
  assert.deepStrictEqual(b.calls(), [
    'gh [auth] [status] [--hostname] [github.com]',
    'git [push] [-u] [github] [feat;x]',
    'gh [pr] [create] [-R] [github.com/acme/site] [--head] [feat;x] [--fill]',
  ]);
});

test('a token in the environment counts as a login: the push and the request go ahead', () => {
  const b = bin(true, 1);
  const out = run(githubProvider(api()).newPullCommand!(repo, 'feature-x'), b, { GH_TOKEN: 'x' });
  assert.strictEqual(out.status, 0, out.stdout + out.stderr);
  assert.deepStrictEqual(b.calls().map((c) => c.split(' ')[0] + ' ' + c.split(' ')[1]), ['git [push]', 'gh [pr]']);
});
