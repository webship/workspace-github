/**
 * GitHub, as a forge provider.
 *
 * gh does the lists and opens pull requests when it is there, with the token from
 * plugin.github.settings.yml in its environment; without gh the REST API answers through curl.
 */

import fs from 'fs';
import path from 'path';
import type { PluginApi, PluginLib } from '@webship/workspace-plugin-api';
import { repoPathAt } from '@webship/workspace-forge';
import type { ForgeItem, ForgeProvider, ForgeRepo } from '@webship/workspace-forge';

const configured = (v: unknown) => { const s = String(v == null ? '' : v).trim(); return s && s !== 'CHANGE_ME' ? s : null; };

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
    const headers = ['-H', 'Accept: application/vnd.github+json'];
    if (e.GH_TOKEN) headers.push('-H', `Authorization: Bearer ${e.GH_TOKEN}`);
    const out = await lib.run('curl', ['-sS', '-m', '30', ...headers, url], process.env.HOME, { timeoutMs: 40 * 1000, env: process.env });
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
    newPullCommand: (repo, branch) => `git push -u origin ${branch} && gh pr create -R ${host()}/${repo.path} --head ${branch} --fill`,
    // git borrows gh's login for a private clone, the way the AI-items sync does; the token is in the environment when the dashboard runs it.
    cloneEnv: () => `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=credential.https://${host()}.helper GIT_CONFIG_VALUE_0='!gh auth git-credential'`,
    clone: { pattern: /^[\w.-]+\/[\w.-]+$|^(https?:\/\/|git@)[\w.-]+[:/][\w./-]+$/, placeholder: 'webship/workspace', help: 'A GitHub repository is owner/name, or its clone URL.' },
    tokenHint: 'token in core/config/plugin.github.settings.yml',
  };
}
