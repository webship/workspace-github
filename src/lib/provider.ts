/**
 * GitHub, as a forge provider.
 *
 * gh does the lists and opens pull requests when it is there, with the token from
 * plugin.github.settings.yml in its environment; without gh the REST API answers through curl.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import type { PluginApi, PluginLib } from '@webship.co/workspace-plugin-api';
import { repoPathAt } from '@webship.co/workspace-forge';
import type { ForgeItem, ForgeProvider, ForgeRepo } from '@webship.co/workspace-forge';

const configured = (v: unknown) => { const s = String(v == null ? '' : v).trim(); return s && s !== 'CHANGE_ME' ? s : null; };
/** One word for a shell: single-quoted. A remote or a branch name may hold `;` or `$`. */
const shq = (v: unknown) => `'${String(v).replace(/'/g, `'\\''`)}'`;

/**
 * Run `fn` with curl arguments that read these header lines from a file only this user can read, removed
 * after. On curl's command line a token is readable by every account of the machine for as long as curl
 * runs (`ps`, /proc/<pid>/cmdline); `-H @file` (curl 7.55+) keeps it off.
 */
export async function withHeaderFile<T>(headers: string[], fn: (args: string[]) => Promise<T>): Promise<T> {
  if (!headers.length) return fn([]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-curl-'));
  const file = path.join(dir, 'headers');
  fs.writeFileSync(file, `${headers.join('\n')}\n`, { mode: 0o600 });
  try { return await fn(['-H', `@${file}`]); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function hasCli(name: string): boolean {
  for (const d of ['/host-local-bin', ...String(process.env.PATH || '').split(':')]) {
    try { fs.accessSync(path.join(d, name), fs.constants.X_OK); return true; } catch (_) { /* next */ }
  }
  return false;
}

export function githubProvider(api: PluginApi): ForgeProvider {
  const settings = () => api.settings.read() || {};
  const host = () => String(configured(settings().host) || 'github.com').toLowerCase();
  const apiBase = () => (host() === 'github.com' ? 'https://api.github.com' : `https://${host()}/api/v3`);

  const env = (): NodeJS.ProcessEnv | null => {
    const t = configured(settings().token);
    if (!t) return null;
    const e: NodeJS.ProcessEnv = { ...process.env, GH_TOKEN: t };
    if (host() !== 'github.com') e.GH_HOST = host();
    return e;
  };

  async function rest(lib: PluginLib, e: NodeJS.ProcessEnv, url: string): Promise<any> {
    // The token in a header file, never on curl's command line (withHeaderFile).
    const secret = e.GH_TOKEN ? [`Authorization: Bearer ${e.GH_TOKEN}`] : [];
    const out = await withHeaderFile(secret, (auth) => lib.run('curl', ['-sS', '-m', '30', '-H', 'Accept: application/vnd.github+json', ...auth, url],
      process.env.HOME, { timeoutMs: 40 * 1000, env: process.env }));
    if (!out.ok) throw new Error(lib.cliError(String(out.stderr || out.stdout)));
    const data = JSON.parse(String(out.stdout));
    if (data && data.message && !Array.isArray(data)) throw new Error(String(data.message));
    return data;
  }

  async function list(kind: 'issue' | 'pr', repo: ForgeRepo, lib: PluginLib, e: NodeJS.ProcessEnv): Promise<ForgeItem[]> {
    if (hasCli('gh')) {
      const out = await lib.run('gh', [kind, 'list', '-R', `${host()}/${repo.path}`, '--state', 'open', '--limit', '20', '--json', 'number,title,url,author,updatedAt'],
        process.env.HOME, { timeoutMs: 40 * 1000, env: e });
      if (out.ok) {
        return (JSON.parse(String(out.stdout) || '[]') as any[]).map((i) => ({ number: i.number, title: i.title, url: i.url, author: i.author && i.author.login, updated: i.updatedAt }));
      }
      // gh is there but could not answer (no credential in this environment): the REST API may still, for a public repository.
    }
    const url = `${apiBase()}/repos/${repo.path}/${kind === 'pr' ? 'pulls' : 'issues'}?state=open&per_page=20`;
    const data = await rest(lib, e, url) as any[];
    return data.filter((i) => kind === 'pr' || !i.pull_request).map((i) => ({ number: i.number, title: i.title, url: i.html_url, author: i.user && i.user.login, updated: i.updated_at }));
  }

  return {
    id: 'github',
    label: 'GITHUB',
    title: 'GitHub',
    host,
    cli: 'gh',
    pullsLabel: 'Pull requests',
    env,
    auth: () => {
      const s = settings();
      return { username: configured(s.username) || undefined, email: configured(s.email) || undefined, how: configured(s.token) ? 'token' : (String(s.use_gh_cli) !== 'false' ? 'gh login' : 'none') };
    },
    repoOf: (url, remote) => { const p = repoPathAt(host(), url); return p ? { path: p, web: `https://${host()}/${p}`, remote } : null; },
    cloneUrl: (spec) => (/^(https?:\/\/|git@)/.test(spec) ? spec : `https://${host()}/${spec.replace(/\.git$/, '')}.git`),
    urls: (repo) => ({ issues: `${repo.web}/issues`, pulls: `${repo.web}/pulls`, newIssue: `${repo.web}/issues/new`, newPull: (branch) => `${repo.web}/compare/${encodeURIComponent(branch)}?expand=1` }),
    listIssues: (repo, lib, e) => list('issue', repo, lib, e),
    listPulls: (repo, lib, e) => list('pr', repo, lib, e),
    // gh is asked first: without it, or without a login it can use at this host, nothing is pushed and the line says
    // which step is missing. Then the branch goes to the remote the repository was found on, not always origin.
    newPullCommand: (repo, branch) => [
      `command -v gh >/dev/null 2>&1 || { echo ${shq(`gh is not installed, and opening a pull request from here needs it: https://cli.github.com (then gh auth login --hostname ${host()}). Or open one on ${repo.web}/compare/${encodeURIComponent(branch)}?expand=1. Nothing was pushed.`)}; exit 1; }`,
      `{ [ -n "\${GH_TOKEN:-}" ] || gh auth status --hostname ${shq(host())} >/dev/null 2>&1; } || { echo ${shq(`gh is not signed in at ${host()}: run gh auth login --hostname ${host()}, then try again. Nothing was pushed.`)}; exit 1; }`,
      `git push -u ${shq(repo.remote)} ${shq(branch)} && gh pr create -R ${shq(`${host()}/${repo.path}`)} --head ${shq(branch)} --fill`,
    ].join('; '),
    // git borrows gh's login for a private clone, the way the AI-items sync does; the token is in the environment when the dashboard runs it.
    cloneEnv: () => `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=credential.https://${host()}.helper GIT_CONFIG_VALUE_0='!gh auth git-credential'`,
    clone: { pattern: /^[\w.-]+\/[\w.-]+$|^(https?:\/\/|git@)[\w.-]+[:/][\w./-]+$/, placeholder: 'webship/workspace', help: 'A GitHub repository is owner/name, or its clone URL.' },
    tokenHint: 'token in core/config/plugin.github.settings.yml',
  };
}
