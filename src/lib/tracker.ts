/**
 * GitHub, as a provider of the tracker family (@webship.co/workspace-tracker): the issues of the repository a
 * project's remote names, through gh.
 *
 * Reads: the open issues, mine, assigned to someone, the current milestone, a search in GitHub's own syntax, and
 * one issue with its comments. Each author is read with how they stand with the repository: the issue's and each
 * comment's author association, and the permission of whoever last edited the body. The base keeps an outsider's
 * issue analyze-only unless a person confirms it by name.
 *
 * Writes, which the base offers only with writes on, each after a person's click: a comment, close and reopen,
 * labels, an assignee, a new issue, and a draft pull request from the run's branch. The dashboard pushes it with
 * gh's credential; the AI session never does.
 *
 * gh uses the token of plugin.github.settings.yml when there is one (GH_TOKEN), else its own login. No token is
 * ever on a command line, in a file the AI can read, or in what is shown.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import type { PluginApi, RunResult } from '@webship.co/workspace-plugin-api';
import { gitRemotes, repoOnForge } from '@webship.co/workspace-forge';
import type { ForgeProvider } from '@webship.co/workspace-forge';
import { GIT_SAFE } from '@webship.co/workspace-tracker';
import type { Person, RequestSpec, TrackerItem, TrackerItemFull, TrackerProvider, TrackerScope, WriteResult } from '@webship.co/workspace-tracker';

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const configured = (v: unknown) => { const s = String(v == null ? '' : v).trim(); return s && s !== 'CHANGE_ME' ? s : ''; };

/** How GitHub's author association reads to the base: members and collaborators are inside, everyone else is not. */
export function association(a: unknown): Person['association'] {
  switch (String(a || '').toUpperCase()) {
    case 'OWNER': return 'owner';
    case 'MEMBER': return 'member';
    case 'COLLABORATOR': return 'collaborator';
    case 'CONTRIBUTOR': return 'contributor';
    case '': return 'unknown';
    default: return 'outside';
  }
}

/** A collaborator permission (`gh api repos/o/r/collaborators/<u>/permission`) as an association. */
export function permissionAssociation(p: unknown): Person['association'] {
  return ['admin', 'maintain', 'write', 'triage'].includes(String(p || '')) ? 'collaborator' : String(p || '') ? 'outside' : 'unknown';
}

/** One issue of `gh issue list|view --json`, as the base reads an item. */
export function itemOf(i: any): TrackerItem {
  const state = String(i.state || '').toLowerCase();
  return {
    id: String(i.number),
    title: String(i.title || ''),
    url: String(i.url || ''),
    state,
    stateClass: state === 'open' ? 'open' : 'done',
    assignees: (i.assignees || []).map((a: any) => String(a.login || '')).filter(Boolean),
    labels: (i.labels || []).map((l: any) => String(l.name || '')).filter(Boolean),
    iteration: i.milestone && i.milestone.title ? `milestone ${i.milestone.title}` : undefined,
    updated: i.updatedAt || undefined,
  };
}

/** The open milestone a "current milestone" view means: the next one due, else the first open one. */
export function currentMilestone(list: any[], now = new Date()): string {
  const open = (list || []).filter((m) => m && m.title);
  const due = open.filter((m) => m.due_on && Date.parse(m.due_on) >= now.getTime() - 24 * 3600 * 1000)
    .sort((a, b) => Date.parse(a.due_on) - Date.parse(b.due_on));
  return String((due[0] || open[0] || {}).title || '');
}

function writeTemp(text: string): { file: string; done: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-gh-'));
  const file = path.join(dir, 'body.md');
  fs.writeFileSync(file, text, { mode: 0o600 });
  return { file, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

export function githubTracker(api: PluginApi, forge: ForgeProvider): TrackerProvider {
  const lib = api.lib;
  const settings = () => api.settings.read() || {};
  const host = () => forge.host();
  const env = () => forge.env() || process.env;
  /** The gh binary: the host's bin directory mounted into the dashboard's container, or the PATH. */
  const ghBin = () => {
    for (const p of ['/host-local-bin/gh']) { try { fs.accessSync(p, fs.constants.X_OK); return p; } catch (_) { /* next */ } }
    return 'gh';
  };
  const hasGh = () => ghBin() !== 'gh' || String(process.env.PATH || '').split(':').some((d) => { try { fs.accessSync(path.join(d, 'gh'), fs.constants.X_OK); return true; } catch (_) { return false; } });
  const gh = (args: string[], timeoutMs = 45 * 1000): Promise<RunResult> => lib.run(ghBin(), args, process.env.HOME || '/', { timeoutMs, env: env() });
  const R = (s: TrackerScope) => `${host()}/${s.id}`;
  const fail = (r: RunResult) => new Error(lib.cliError(String(r.stderr || r.stdout || 'gh did not answer')));
  async function json(args: string[]): Promise<any> {
    const r = await gh(args);
    if (!r.ok) throw fail(r);
    return JSON.parse(String(r.stdout || 'null'));
  }
  const result = (r: RunResult, url = ''): WriteResult => (r.ok ? { ok: true, error: '', url: url || String(r.stdout || '').trim().split('\n').pop() || '' }
    : { ok: false, error: lib.cliError(String(r.stderr || r.stdout || '')) });

  // Signed in or not, asked in the background: the menu renders at once and says so on the next render.
  let auth: { at: number; reason: string; running: boolean } = { at: 0, reason: '', running: false };
  function probe(): void {
    if (auth.running || Date.now() - auth.at < 5 * 60 * 1000) return;
    auth.running = true;
    const tokenSet = !!configured(settings().token);
    gh(['auth', 'status', '--hostname', host()], 20 * 1000).then((r) => {
      auth = { at: Date.now(), running: false, reason: r.ok || tokenSet ? '' : `gh is not signed in at ${host()}: run gh auth login --hostname ${host()}, or set the token in ${api.settings.file}` };
    }).catch(() => { auth.running = false; });
  }

  let who: { at: number; login: string } = { at: 0, login: '' };

  return {
    id: api.name,
    title: 'GitHub',
    label: 'GITHUB',
    noun: { one: 'issue', many: 'issues' },
    capabilities: {
      views: ['open', 'mine', 'assigned', 'iteration', 'query'],
      iterationWord: 'milestone',
      comment: true, worklog: false, transition: true, labels: true, assign: true, create: true,
      request: 'open', requestNoun: 'pull request',
    },
    idPattern: /^[1-9][0-9]{0,8}$/,
    cli: 'gh',
    tokenVariables: ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN'],
    secret: () => configured(settings().token),
    ready: () => {
      if (!hasGh()) return 'gh is not installed where the dashboard runs (https://cli.github.com)';
      probe();
      return auth.reason;
    },
    scopeOf: (ref) => {
      const repo = repoOnForge(forge, ref.dir);
      return repo ? { id: repo.path, name: repo.path, web: repo.web } : null;
    },
    parseScope: (text) => {
      const t = String(text || '').trim().replace(/\.git$/, '');
      return REPO_RE.test(t) ? { id: t, name: t, web: `https://${host()}/${t}` } : null;
    },
    urlOf: (s, id) => `${s.web}/issues/${encodeURIComponent(id)}`,
    account: async () => {
      if (who.login && Date.now() - who.at < 10 * 60 * 1000) return who.login;
      const r = await gh(['api', 'user', '--hostname', host(), '--jq', '.login'], 20 * 1000);
      who = { at: Date.now(), login: r.ok ? String(r.stdout || '').trim() : '' };
      return who.login;
    },

    list: async (scope, q) => {
      const args = ['issue', 'list', '-R', R(scope), '--state', 'open', '--limit', String(Math.max(1, Math.min(q.limit, 100))),
        '--json', 'number,title,url,state,labels,assignees,milestone,updatedAt,author'];
      if (q.view === 'mine') args.push('--assignee', '@me');
      if (q.view === 'assigned') { if (!q.who) return []; args.push('--assignee', q.who); }
      if (q.view === 'iteration') {
        const ms = await json(['api', '--hostname', host(), `repos/${scope.id}/milestones?state=open&sort=due_on&direction=asc&per_page=50`]);
        const title = currentMilestone(ms);
        if (!title) return [];
        args.push('--milestone', title);
      }
      if (q.view === 'query') args.push('--search', String(q.text || ''));
      return ((await json(args)) as any[]).map(itemOf);
    },

    get: async (scope, id) => {
      const j = await json(['issue', 'view', id, '-R', R(scope), '--json', 'number,title,body,url,state,labels,assignees,milestone,author,comments,updatedAt']);
      const [owner, name] = scope.id.split('/');
      // The author's association and the body's last editor, in one GraphQL call.
      let assoc = ''; let editor = '';
      try {
        const g = await json(['api', 'graphql', '--hostname', host(), '-f', 'query=query($o:String!,$n:String!,$i:Int!){repository(owner:$o,name:$n){issue(number:$i){authorAssociation lastEditedAt editor{login}}}}',
          '-f', `o=${owner}`, '-f', `n=${name}`, '-F', `i=${id}`]);
        const is = g && g.data && g.data.repository && g.data.repository.issue;
        assoc = (is && is.authorAssociation) || '';
        editor = (is && is.lastEditedAt && is.editor && is.editor.login) || '';
      } catch (_) { /* unknown: the base treats it as outside */ }
      const author: Person = { name: String((j.author && j.author.login) || 'unknown'), association: association(assoc) };
      let lastEditor: Person | undefined;
      if (editor && editor !== author.name) {
        let perm = '';
        try { perm = String((await json(['api', '--hostname', host(), `repos/${scope.id}/collaborators/${encodeURIComponent(editor)}/permission`])).permission || ''); } catch (_) { perm = ''; }
        lastEditor = { name: editor, association: permissionAssociation(perm) };
      }
      const full: TrackerItemFull = {
        ...itemOf(j),
        body: String(j.body || ''),
        author,
        ...(lastEditor ? { lastEditor } : {}),
        comments: (j.comments || []).map((c: any) => ({ author: { name: String((c.author && c.author.login) || 'unknown'), association: association(c.authorAssociation) }, body: String(c.body || ''), at: String(c.createdAt || '') })),
      };
      return full;
    },

    comment: async (scope, id, markdown) => {
      const t = writeTemp(markdown);
      try { return result(await gh(['issue', 'comment', id, '-R', R(scope), '--body-file', t.file])); } finally { t.done(); }
    },
    transitions: async (scope, id) => {
      const j = await json(['issue', 'view', id, '-R', R(scope), '--json', 'state']);
      return String(j.state).toUpperCase() === 'OPEN'
        ? [{ id: 'close', name: 'Close as completed' }, { id: 'close-not-planned', name: 'Close as not planned' }]
        : [{ id: 'reopen', name: 'Reopen' }];
    },
    transition: async (scope, id, to) => {
      const args = to === 'reopen' ? ['issue', 'reopen', id, '-R', R(scope)]
        : ['issue', 'close', id, '-R', R(scope), '--reason', to === 'close-not-planned' ? 'not planned' : 'completed'];
      return result(await gh(args), `${scope.web}/issues/${id}`);
    },
    labels: async (scope, id, add, remove) => result(await gh(['issue', 'edit', id, '-R', R(scope),
      ...(add.length ? ['--add-label', add.join(',')] : []), ...(remove.length ? ['--remove-label', remove.join(',')] : [])]), `${scope.web}/issues/${id}`),
    assign: async (scope, id, whom) => result(await gh(['issue', 'edit', id, '-R', R(scope), '--add-assignee', whom === 'me' ? '@me' : whom]), `${scope.web}/issues/${id}`),
    create: async (scope, item) => {
      const t = writeTemp(item.body);
      try {
        const r = result(await gh(['issue', 'create', '-R', R(scope), '--title', item.title, '--body-file', t.file]));
        return r.ok ? { ...r, id: (String(r.url).match(/\/issues\/(\d+)$/) || [])[1] || '' } : r;
      } finally { t.done(); }
    },

    /**
     * Push the run's branch to the repository of the scope (over https, with gh's credential and hooks off) and open a
     * draft pull request from it. The remote must be the scope's repository: a project pushes only where it came from.
     */
    openRequest: async (scope, r: RequestSpec) => {
      const remotes = gitRemotes(r.dir);
      const remote = Object.keys(remotes).find((n) => { const repo = forge.repoOf(remotes[n], n); return repo && repo.path === scope.id; });
      if (!remote) return { ok: false, error: `No remote of ${r.dir} is ${scope.id} on ${host()}: nothing was pushed.` };
      const url = `https://${host()}/${scope.id}.git`;
      const push = await lib.run('git', [...GIT_SAFE, '-c', `credential.https://${host()}.helper=`, '-c', `credential.https://${host()}.helper=!${ghBin()} auth git-credential`,
        '-C', r.dir, 'push', url, `refs/heads/${r.branch}:refs/heads/${r.branch}`], r.dir, { timeoutMs: 120 * 1000, env: { ...env(), GIT_TERMINAL_PROMPT: '0' } });
      if (!push.ok) return { ok: false, error: `git push did not go: ${lib.cliError(String(push.stderr || push.stdout || ''))}` };
      const t = writeTemp(r.body);
      try {
        return result(await gh(['pr', 'create', '-R', R(scope), '--head', r.branch, '--base', r.base, '--title', r.title, '--body-file', t.file, ...(r.draft ? ['--draft'] : [])], 60 * 1000));
      } finally { t.done(); }
    },
  };
}
