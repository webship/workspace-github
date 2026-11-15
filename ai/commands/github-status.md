---
description: Show where a Webship Workspace project stands on GitHub — its repository, the branch it is on, the open issues and pull requests, and the checks of the pull request of the current branch. Read-only; nothing is created or changed.
argument-hint: '<project> [issues | pulls | checks]'
---

# /github-status

Show where this project stands on GitHub: `$ARGUMENTS`

The first word is the project (its folder name in a workspace folder). What follows, if anything,
narrows the answer: `issues`, `pulls` or `checks`. With nothing after the project, show all three.
With no project at all, stop and ask for one.

The workspace is container-based (DDEV by default); `gh` and `git` run on the machine, in the
project's folder. This command only reads: never run `gh issue create`, `gh pr create`,
`gh issue comment`, `gh pr merge` or `git push` here, and never print a token.

## 1. Find the project and its repository

```bash
ls -d ~/workspace/*/<project>/.git
cd ~/workspace/<folder>/<project>
git remote get-url origin
git branch --show-current
gh repo view --json nameWithOwner,defaultBranchRef,visibility,url
```

If there is no `.git`, or the remote is not on GitHub, stop and say so: the GITHUB menu of the
GitHub plugin (`@webship.co/workspace-github`) is not on this project either. If `gh` is missing
or not signed in (`gh auth status`), stop and say which.

## 2. Issues

```bash
gh issue list --state open --limit 20 --json number,title,url,author,updatedAt
```

## 3. Pull requests

```bash
gh pr list --state open --limit 20 --json number,title,url,author,updatedAt,headRefName
```

## 4. Checks of the pull request of the current branch

```bash
gh pr list --head <branch> --state open --json number,title,url
gh pr checks <number>
```

When the branch has no open pull request, say so and skip the checks.

## 5. Report

In this order: the repository (`<owner>/<name>`, public or private, its default branch), the
branch the project is on, then one line per open issue and per open pull request (`#<number>
<title>`, the author, the date it was updated), then the checks: how many passed, failed and are
still running, and the name of each one that failed.

A list that is empty is a result: say "no open issues". For filing an issue or opening a pull
request, hand over to the agent `github-issue-pr-worker`.
