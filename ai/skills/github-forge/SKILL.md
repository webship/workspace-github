---
name: github-forge
description: Work with GitHub from a Webship Workspace through the GitHub plugin (`@webship.co/workspace-github`) — what the GITHUB menu of a project row does and the `gh` command behind each entry, the keys of `plugin.github.settings.yml` and which credential is used where, how to check the plugin on a machine, and how to clone a repository into a new folder. Use when asked to "list the open issues of this project", "open a pull request from this branch", "why is there no GITHUB menu on this project", "set the GitHub token of the dashboard", "the issues list is empty for a private repository", or when a project of the workspace has its git remote on GitHub.
argument-hint: '<project> [issues | pulls | credential]'
---

# github-forge

GitHub for a project of a Webship Workspace (`~/workspace`, container-based, DDEV by default). It
comes with the GitHub plugin (`@webship.co/workspace-github`), a provider of the forge family
(`@webship.co/workspace-forge`), like the agent `github-issue-pr-worker`, the command
`/github-status` and the prompt `github-issue-to-pr`.

## What the plugin puts on the dashboard

A project gets the GITHUB menu when it has its own `.git` and one of its remotes (`origin` first) is
on the plugin's host. Each entry, and what it is from a terminal in the project:

| Menu entry | What it does | From a terminal |
| --- | --- | --- |
| **Open the repository** | Opens the repository page | `gh repo view --web` |
| **Open issues** | Lists up to 20 open issues in a modal | `gh issue list --state open --limit 20` |
| **Open pull requests** | Lists up to 20 open pull requests in a modal | `gh pr list --state open --limit 20` |
| **Open a pull request from** the current branch | Pushes the branch and opens the request, in a terminal session of the project | `git push -u origin <branch>` then `gh pr create --head <branch> --fill` |
| **New issue** | Opens the new-issue page of the repository | `gh issue create --web` |
| **Copy the clone URL** | Copies `https://<host>/<owner>/<name>.git` | `git remote get-url origin` shows the one the project was cloned with |

The card of the project also carries a chip with `<owner>/<name>` that links to the repository, and
the New folder form offers **Clone a repository into this folder** (`<owner>/<name>` or a clone URL).

No menu on a project means one of: the project has no `.git` of its own, none of its remotes is on
the host in `host:`, or the plugin is not activated and installed.

```bash
cd ~/workspace/<folder>/<project>
git remote -v                                       # is a remote on the host?
cd ~/workspace && bash core/scripts/plugins.sh --list     # github: ready?
```

## Turn it on, and check it

```bash
cd ~/workspace
bash core/scripts/plugins.sh --require @webship.co/workspace-github
bash core/scripts/plugins.sh --activate github --with-needs     # adds the AI folders its items land in
bash core/scripts/plugins.sh --install github
bash core/scripts/plugins.sh --configure github                 # core/config/plugin.github.settings.yml, from the template
bash core/scripts/plugins.sh --check github                     # gh: found, with its version, or missing
```

The same four steps are buttons on the page Settings → Plugins of the dashboard.

## The settings: `core/config/plugin.github.settings.yml`

| Key | What it is |
| --- | --- |
| `host:` | `github.com`, or a GitHub Enterprise host. The menu is drawn for remotes on this host. |
| `use_gh_cli:` | `true`: gh's own login is used when it works, and the token below only where it does not. |
| `username:` | The account name GitHub knows the person by. |
| `email:` | The address commits pushed to GitHub carry. |
| `token:` | A fine-grained personal access token. Read-only is enough for the lists; a pull request from the dashboard needs write on the repository. |

Which credential is used where:

- **In a terminal on the machine**: gh's own login (`gh auth status`). Nothing else is needed.
- **In the dashboard**: it runs in a container that cannot read the keyring gh keeps its login in,
  so the lists there use `token:` (handed to gh as `GH_TOKEN`; with a `host:` other than
  `github.com`, `GH_HOST` too). With no token the lists still answer for a public repository and
  say "no credential"; a private repository answers nothing.

The file is created mode 600 and the token is masked on the Settings page. Never print the token,
never copy it into another file, and never commit the file.

## Read a repository from a terminal

All of these only read. Run them in the project, or add `--repo <owner>/<name>` from anywhere.

```bash
cd ~/workspace/<folder>/<project>
gh repo view --json nameWithOwner,defaultBranchRef,visibility
gh issue list --state open --limit 20 --json number,title,url,author,updatedAt     # what the menu's list reads
gh pr list --state open --limit 20 --json number,title,url,author,updatedAt
gh issue view <number> --json number,title,state,body,comments
gh pr view <number> --json title,state,mergeable,statusCheckRollup
gh pr checks <number>
gh run list --branch <branch> --limit 5
```

## Open a pull request from the branch

What the menu entry runs, with the title and body taken from the commits:

```bash
cd ~/workspace/<folder>/<project>
git push -u origin <branch>
gh pr create --head <branch> --fill
```

For a pull request the Webship way — an issue first, a body that ends with the Checkpoints list —
hand over to the agent `github-issue-pr-worker`, or start a session with the prompt
`github-issue-to-pr`.

## Traps

- **`gh` works in a terminal and the dashboard's list is empty**: the dashboard has no `token:`.
  Set it with `bash core/scripts/plugins.sh --configure github` or on the Settings page.
- **A detached HEAD**: the menu has no branch to push, and the entry is a link to the compare page
  of the repository instead. Check out a branch first.
- **A remote on another forge** (GitLab, Bitbucket) gets that forge's plugin and its menu, not this one.
- **`host:` changed**: projects whose remote is on the old host lose the menu. One plugin, one host.
