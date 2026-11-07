# @webship/workspace-github

GitHub for the [Webship Workspace](https://github.com/webship/workspace) dashboard: the **GITHUB**
menu on every project whose git remote is on GitHub (open the repository, the open issues and
pull requests, open one from the current branch, copy the clone URL), the repository chip on the
card, "Clone a repository" when a new folder is made, and the credential the dashboard uses for the
host. A provider of [`@webship/workspace-forge`](https://github.com/webship/workspace-forge).

The lists come from `gh` (`gh issue list`, `gh pr list`) with the token in the environment, or from the REST API with `curl` when gh is not there; a pull request from the current branch is `gh pr create --head <branch> --fill` in a terminal in the project. The token also serves the dashboard's other GitHub work (the AI-items sync, the tooling repository): `github-auth.js` asks this plugin first, through `api.addForge('github.com', …)`.

## Use it

```bash
cd ~/workspace
bash core/scripts/plugins.sh --require github:webship/workspace-github
bash core/scripts/plugins.sh --activate github
bash core/scripts/plugins.sh --install github      # carries the git.github block of settings.yml into plugin.github.settings.yml
bash core/scripts/plugins.sh --configure github
```

The same four steps are buttons on the dashboard's **Settings → Plugins** page.

## What the package holds

| Path | What it is |
| --- | --- |
| `src/index.ts` | `register(api)`: `registerForge(api, githubProvider(api))` |
| `src/lib/provider.ts` | The GitHub provider: the host, the credential, how a remote reads, the pages, the issue and request lists, the clone URL |
| `config/plugin.github.settings.yml` | The settings template |
| `scripts/host-install.sh` | The host side: the CLI and the credential check |

The `workspacePlugin` block in `package.json` is the manifest the installer reads.
