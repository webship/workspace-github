# A plugin carries its own items: a plugin that is not a platform

Every `@webship.co/workspace-<name>` plugin manages what belongs to it: its `cmd-*.sh` commands and
its AI items (agents, skills, commands, prompts). The package holds them, the manifest names them,
and `plugins.sh --install <name>` lists each one in the workspace folder of its kind, when that
folder is an active workspace folder. `--uninstall` takes them away again.

The reference for a platform plugin (a builder, a step pack, example features) is
[`@webship.co/workspace-wordpress`](https://github.com/webship/workspace-wordpress/blob/1.0.x/docs/plugin-items-pattern.md).
This plugin is the reference for the others: a forge, a container runtime, a hosting provider, a
feature. They build no site and ship no Gherkin, so what their items are checked against is what
the plugin itself draws and runs. Below, `<p>` is the plugin's name.

## The layout

```text
ai/agents/<p>-<role>.md                one file per agent
ai/skills/<p>-<topic>/SKILL.md         one folder per skill; every file in it is placed
ai/commands/<p>-<verb>.md              one file per slash command
ai/prompts/<p>-<task>.md               one file per prompt
commands/cmd-*.sh                      only when the plugin has commands; never an AI item
tests/items.test.ts                    the shape of every item, and that it names nothing that does not exist
tests/fixtures/<cli>-commands.txt      the commands and flags of the plugin's CLI, from its own --help
```

## The manifest

```json
"files": ["dist/src", "ai", "config", "docs", "…"],
"workspacePlugin": {
  "needs": { "plugins": ["ai-agents", "ai-skills", "ai-commands", "ai-prompts"],
             "commands": [{ "command": "gh", "hint": "https://cli.github.com" }] },
  "ai": {
    "agents":   ["ai/agents/<p>-<role>.md"],
    "skills":   ["ai/skills/<p>-<topic>"],
    "commands": ["ai/commands/<p>-<verb>.md"],
    "prompts":  ["ai/prompts/<p>-<task>.md"]
  }
}
```

`needs` keeps everything it had. A plugin that needs a command on the machine has the object form:
the AI folders go in `plugins`, beside `commands`. A plugin whose `needs` is a list gets the folders
appended to the list. A kind that is not shipped is in neither `ai` nor `needs`.

## The shape of each kind

| Kind | Shape |
| --- | --- |
| Agent | frontmatter `name` (the file name), `description` ("Use this agent to …"), `model: fable`, `tools` |
| Skill | `SKILL.md` with frontmatter `name` (the folder name) and a `description` with "Use when …" |
| Command | frontmatter `description` and `argument-hint`, no `name`; the body reads `$ARGUMENTS` |
| Prompt | no frontmatter; one sentence, then a fenced block with `claude --permission-mode bypassPermissions """` … `"""`, `<placeholders>`, and a `#` line that says where it runs |

Names start with `<p>-`. A command and a prompt never share a name: both are installed into
`~/.claude/commands`.

## What an item may say

An item states only what exists, and the test holds it to that:

- **a menu entry**: one the plugin draws. The test loads the plugin the way the dashboard does, on a
  project it recognises, and looks for every entry the skill's table names in what is drawn;
- **a settings key**, written `` `key:` ``: one of the plugin's settings template, and the skill
  describes all of them;
- **a command of the plugin's CLI**: one the CLI has, with flags it has. Where the CLI is on the
  machine the items were written on, `tests/fixtures/<cli>-commands.txt` holds what its `--help`
  says (the first line names the version), and long flags are used so that they can be checked.
  Where it is not, an item shows only the commands the plugin's own scripts and code run, and the
  test reads them from there;
- **a `cmd-*.sh`**: the plugin's own, or one of the workspace's, with flags it has;
- the workspace is container-based (DDEV by default); no token, no account id, no personal path.

The fixture, for a CLI that is here:

```bash
{ echo "# $(gh --version | head -1): each command an item may name, with the flags its --help lists" ;
  for c in "issue list" "pr list" "pr create" ; do      # every command the items name
    echo "gh $c $(gh $c --help 2>&1 | grep -oE '(^|[ ,])--[a-z][a-z-]*' | tr -d ' ,' | sort -u | tr '\n' ' ')" | sed 's/ $//' ;
  done ; } > tests/fixtures/gh-commands.txt
```

## A `cmd-*.sh` or not

A plugin gets a `cmd-*.sh` when a person would run it from a terminal and it is a thin wrapper
over what the plugin already does. This one has none: in a project's folder `gh issue list`,
`gh pr list` and `gh pr create --head <branch> --fill` are what the menu runs, and gh finds the
repository from the remote by itself.

## Prove it on a fresh workspace

Never in a workspace somebody works in. `webship-workspace init <folder>` makes an empty one.

```bash
npm pack                                                                 # in the plugin: the tarball of the branch
cd <the fresh workspace>
bash core/scripts/plugins.sh --require <path>/webship.co-workspace-<p>-<version>.tgz
bash core/scripts/plugins.sh --activate <p>                              # stops: lists the AI folders that are not here
bash core/scripts/plugins.sh --activate <p> --with-needs                 # adds them, then activates
bash core/scripts/plugins.sh --install <p>                               # "placed …" once per file
ls ai-agents ai-skills ai-commands ai-prompts                            # each item in its folder
bash core/scripts/plugins.sh --list                                      # needs: … met by …
bash core/scripts/plugins.sh --uninstall <p>                             # "removed …" once per file
```

Then run, for real, every command an item tells its reader to run that only reads: here the
`gh … list`, `view` and `checks` commands against a repository. A command that creates something
(an issue, a pull request, a comment) is not run as a proof; it is run when the work is real.
