/**
 * GitHub for Webship Workspace.
 *
 * The GITHUB menu on every project whose git remote is on GitHub (the repository, open issues,
 * open pull requests, open one from the current branch, the clone URL), the repository chip,
 * "Clone a repository" when a new folder is made, and the credential the dashboard uses for the
 * host. All of it is the forge family's surface (@webship.co/workspace-forge); this package is the
 * GitHub provider plus its settings template and host install.
 *
 * It also carries its own AI items (ai/ in the package, `ai` in the manifest), each placed in the
 * workspace folder of its kind: an agent, a skill, a command and a prompt.
 */

import type { PluginApi } from '@webship.co/workspace-plugin-api';
import { registerForge } from '@webship.co/workspace-forge';

import { githubProvider } from './lib/provider';

export { githubProvider };

/** The AI items the installer places: agents in ai-agents/, skills in ai-skills/, commands in ai-commands/, prompts in ai-prompts/. */
export const AGENTS = ['github-issue-pr-worker'];
export const SKILLS = ['github-forge'];
export const AI_COMMANDS = ['github-status'];
export const PROMPTS = ['github-issue-to-pr'];

export function register(api: PluginApi): void {
  registerForge(api, githubProvider(api));
}
