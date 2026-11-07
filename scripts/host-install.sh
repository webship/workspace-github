#!/usr/bin/env bash
## The host side of the GitHub plugin: the CLI on this machine and the dashboard's credential.
## Run by core/scripts/plugins.sh --install github, and by core/scripts/install.sh for every installed
## plugin that ships one. Idempotent: whatever is already there is reported, not redone.
set -u
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd)}";

BIN='';
for candidate in "$(command -v gh 2>/dev/null)" "${HOME}/.local/bin/gh" ; do
  [ -n "${candidate}" ] && [ -x "${candidate}" ] && { BIN="${candidate}"; break; }
done
if [ -n "${BIN}" ] ; then
  printf '  ✓ %-16s %s\n' "gh" "${BIN}" ;
else
  printf '  ✗ %-16s %s\n' "gh" "missing — opening pull requests from the dashboard needs it (cli.github.com)" ;
fi

STATE="$(grep -E '^token:' "${WORKSPACE_ROOT}/core/config/plugin.github.settings.yml" 2>/dev/null | head -1 | sed -E 's/^[a-z_]+:[[:space:]]*//')";
case "${STATE}" in
  ''|CHANGE_ME|"''"|'""') printf '  ✗ %-16s %s\n' "token" "not set in plugin.github.settings.yml — the dashboard reads only public repositories on GitHub" ;;
  *)                       printf '  ✓ %-16s %s\n' "token" "set (plugin.github.settings.yml)" ;;
esac

