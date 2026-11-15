# @webship.co/workspace-github

GitHub for the [Webship Workspace](https://github.com/webship/workspace) dashboard: the **GITHUB**
menu on every project whose git remote is on GitHub (open the repository, the open issues and
pull requests, open one from the current branch, copy the clone URL), the repository chip on the
card, "Clone a repository" when a new folder is made, the credential the dashboard uses for the
host, and its AI items — an agent, a skill, a command and a prompt — each listed in the workspace
folder of its kind. A provider of [`@webship.co/workspace-forge`](https://github.com/webship/workspace-forge).

The workspace is container-based (DDEV by default); `gh` and `git` run on the machine, in the
project's folder.

The lists come from `gh` (`gh issue list`, `gh pr list`) with the token in the environment, or from the REST API with `curl` when gh is not there; a pull request from the current branch is `gh pr create --head <branch> --fill` in a terminal in the project. The token also serves the dashboard's other GitHub work (the AI-items sync, the tooling repository): `github-auth.js` asks this plugin first, through `api.addForge('github.com', …)`.

## Use it

```bash
cd ~/workspace
bash core/scripts/plugins.sh --require github:webship/workspace-github
bash core/scripts/plugins.sh --activate github --with-needs   # the AI folders its items land in are added first
bash core/scripts/plugins.sh --install github      # carries the git.github block of settings.yml into plugin.github.settings.yml
bash core/scripts/plugins.sh --configure github
```

The same four steps are buttons on the dashboard's **Settings → Plugins** page. `--install` is
idempotent. `--uninstall` removes what it placed; an AI item you edited stays.

## The items it carries

Each one lands in the folder of its kind, when that folder is an active workspace folder, is listed
there like any other item, and is installed into Claude Code from there:

| What | Lands in | What it is for |
| --- | --- | --- |
| The agent `github-issue-pr-worker` | `ai-agents/` | Works an issue to a pull request the Webship way: the issue template, a branch, the pull request with the Checkpoints list last, the checks |
| The skill `github-forge` | `ai-skills/` | What each entry of the GITHUB menu does and the `gh` command behind it, the keys of `plugin.github.settings.yml`, which credential is used where |
| The command `/github-status` | `ai-commands/` | `/github-status <project>`: the repository, the branch, the open issues and pull requests, the checks. Read-only |
| The prompt `github-issue-to-pr` | `ai-prompts/` | The launch command of a session that works one issue to a pull request |

The plugin places no `cmd-*.sh`: in a project's folder `gh issue list`, `gh pr list` and
`gh pr create --head <branch> --fill` are already what the menu runs, and a wrapper would add
nothing to them. A project that carries a webship-js suite is tested by the workspace's own
`cmd-tools-testing.sh <project> --run`, which the agent and the prompt use when it is there.

The item bodies are plain Markdown any AI command-line assistant can follow; Claude Code is the default shape (the frontmatter, the launch command of the prompt).

How the items are laid out and checked: [docs/plugin-items-pattern.md](docs/plugin-items-pattern.md).

## What it needs

On the machine this plugin needs `gh` (https://cli.github.com), and its manifest says so (`needs.commands`). The workspace reports it and never installs it:

```bash
bash core/scripts/plugins.sh --check github      # found, with its version, or missing, with how to install it
webship-workspace doctor                        # the same for the core and every plugin
```

It also needs the four AI folders its items are placed in (`needs.plugins`): `ai-agents`, `ai-skills`, `ai-commands` and `ai-prompts`. `--require` says so, `--activate` and `--install` stop until the workspace has them, and `--with-needs` adds what is missing first. It needs no sites folder: its menu is on the project rows of whatever folders the workspace has. A kind whose folder is not an active workspace folder is skipped, and the install says so.

## What the package holds

| Path | What it is |
| --- | --- |
| `src/index.ts` | `register(api)`: `registerForge(api, githubProvider(api))` |
| `src/lib/provider.ts` | The GitHub provider: the host, the credential, how a remote reads, the pages, the issue and request lists, the clone URL |
| `config/plugin.github.settings.yml` | The settings template |
| `scripts/host-install.sh` | The host side: the CLI and the credential check |
| `ai/agents/github-issue-pr-worker.md` | The agent |
| `ai/skills/github-forge/` | The skill |
| `ai/commands/github-status.md` | The slash command |
| `ai/prompts/github-issue-to-pr.md` | The prompt: a whole launch command for a new session |
| `tests/items.test.ts`, `tests/fixtures/gh-commands.txt` | The shape of every item, and that each menu entry, settings key, `gh` command and flag it names exists |

The `workspacePlugin` block in `package.json` is the manifest the installer reads.
