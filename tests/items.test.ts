/**
 * The AI items this plugin carries (ai/ in the package, the manifest's `ai` block): an agent, a skill,
 * a command and a prompt, each placed by the installer in the workspace folder of its kind.
 *
 * What is checked here is what a person relies on once they are installed: each item has the shape its
 * folder lists and Claude Code loads, and names nothing that does not exist — every menu entry is one the
 * plugin draws, every settings key is in its settings template, every `gh` command and flag is one gh has
 * (tests/fixtures/gh-commands.txt, read from gh's own --help), and every cmd-*.sh is the workspace's.
 */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { register, AGENTS, SKILLS, AI_COMMANDS, PROMPTS } from '../src/index';

// Compiled, these tests run from dist/tests, so the package root is one folder further up.
const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');
const read = (f: string) => fs.readFileSync(path.join(PKG, f), 'utf8');
const pkg = JSON.parse(read('package.json'));
const manifest = pkg.workspacePlugin;
const P: string = manifest.name;

// The kinds the workspace knows, and the folder each one lands in (core/workspace-app/plugin-install.js).
const KINDS: Record<string, string> = { agents: 'ai-agents', skills: 'ai-skills', commands: 'ai-commands', prompts: 'ai-prompts' };

/** Every file of the package under a path: the file itself, or all the files of a folder (a skill is a folder). */
function filesUnder(rel: string): string[] {
  const abs = path.join(PKG, rel);
  if (!fs.statSync(abs).isDirectory()) return [rel];
  return fs.readdirSync(abs).flatMap((e) => filesUnder(`${rel}/${e}`));
}
const ITEM_FILES: string[] = Object.keys(KINDS).flatMap((kind) => (manifest.ai[kind] || []).flatMap(filesUnder));
const MAIN_FILES: string[] = [...manifest.ai.agents, ...manifest.ai.commands, ...manifest.ai.prompts, ...manifest.ai.skills.map((s: string) => `${s}/SKILL.md`)];
const frontmatter = (src: string) => (src.startsWith('---\n') ? src.split('\n---\n')[0] : '');
const bodyOf = (src: string) => (src.startsWith('---\n') ? src.split('\n---\n').slice(1).join('\n---\n') : src);
// The plugins the manifest needs: a list alone, or the `plugins` of the object that also carries the commands.
const neededPlugins: unknown[] = Array.isArray(manifest.needs) ? manifest.needs : (manifest.needs.plugins || []);

test('the manifest carries one list per kind, each item under ai/<kind>/, and needs the folder each kind lands in', () => {
  assert.deepStrictEqual(Object.keys(manifest.ai).sort(), Object.keys(KINDS).sort(), 'agents, skills, commands, prompts');
  for (const [kind, folder] of Object.entries(KINDS)) {
    const list: string[] = manifest.ai[kind];
    assert.ok(list.length > 0, `the plugin ships at least one of ${kind}`);
    for (const f of list) {
      assert.strictEqual(path.dirname(f), `ai/${kind}`, `${f} is in ai/${kind}/`);
      assert.ok(fs.existsSync(path.join(PKG, f)), `${f} is in the package`);
      assert.match(path.basename(f), new RegExp(`^${P}-[a-z0-9-]+(\\.md)?$`), `${f} carries the plugin's name, so it never takes the name of another plugin's item`);
    }
    assert.ok(neededPlugins.includes(folder), `it ships ${kind}, so it needs ${folder}`);
  }
  assert.ok(pkg.files.includes('ai'), 'ai/ is published with the package');
  const names = (kind: string, ext = '.md') => manifest.ai[kind].map((f: string) => path.basename(f, ext));
  assert.deepStrictEqual(names('agents'), AGENTS);
  assert.deepStrictEqual(names('skills', ''), SKILLS);
  assert.deepStrictEqual(names('commands'), AI_COMMANDS);
  assert.deepStrictEqual(names('prompts'), PROMPTS);
  // Commands and prompts share one destination in Claude Code (~/.claude/commands): a name used by both is lost.
  assert.strictEqual(new Set([...AI_COMMANDS, ...PROMPTS]).size, AI_COMMANDS.length + PROMPTS.length, 'no command and prompt share a name');
});

test('an agent is named after its file, says when to use it, and names its model and tools', () => {
  for (const f of manifest.ai.agents) {
    const head = frontmatter(read(f));
    assert.match(head, new RegExp(`^name: ${path.basename(f, '.md')}$`, 'm'));
    assert.match(head, /^description: Use this agent .{80,}$/m, `${f} says what it does and when to use it`);
    assert.match(head, /^model: fable$/m);
    assert.match(head, /^tools:\n( {2}- \S+\n?)+/m, `${f} lists its tools`);
  }
});

test('a skill is a folder with a SKILL.md named after it, and says when to use it', () => {
  for (const f of manifest.ai.skills) {
    assert.ok(fs.statSync(path.join(PKG, f)).isDirectory(), `${f} is a folder`);
    const head = frontmatter(read(`${f}/SKILL.md`));
    assert.match(head, new RegExp(`^name: ${path.basename(f)}$`, 'm'));
    assert.match(head, /^description: .{80,}$/m, `${f} says what it does and when to use it`);
    assert.match(head, /Use when/, `${f} names the requests it answers to`);
  }
});

test('a command is a slash command: a description, an argument hint, and $ARGUMENTS where what was typed goes', () => {
  for (const f of manifest.ai.commands) {
    const src = read(f);
    const head = frontmatter(src);
    assert.match(head, /^description: .{40,}$/m, `${f} is described in the command list`);
    assert.match(head, /^argument-hint: .+$/m, `${f} says what to type after it`);
    assert.doesNotMatch(head, /^name:/m, `${f} is named by its file`);
    assert.ok(src.includes('$ARGUMENTS'), `${f} reads what was typed after the command`);
  }
});

test('a prompt is a line that says what it is for, then the whole launch command the New screen form reads', () => {
  for (const f of manifest.ai.prompts) {
    const src = read(f);
    assert.doesNotMatch(src, /^---\n/, `${f} has no frontmatter: it is not installed as a command`);
    assert.match(src.split('\n')[0], /^[A-Z].{20,}\.$/, `${f} opens with one sentence`);
    // The two expressions the dashboard reads a prompt with (core/workspace-app/screens.js).
    const flags = src.match(/^\s*claude\s+([^\n]*?)\s*"""\s*$/m);
    const text = src.match(/claude[^\n]*"""\n([\s\S]*?)\n"""/);
    assert.ok(flags && flags[1].trim() === '--permission-mode bypassPermissions', `${f} carries the claude flags`);
    assert.ok(text && text[1].trim().length > 100, `${f} carries the prompt`);
    assert.match(text![1], /<[a-z|]+>/, `${f} has placeholders to fill in`);
    assert.match(text![1], /^# .*container-based \(DDEV by default\)/m, `${f} says where it runs`);
  }
});

// ---- What an item may name ---------------------------------------------------------------------

/** The plugin as the dashboard loads it, on a project whose remote is on the host: what its menu and its New-folder section say. */
function drawn(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${P}-items-`));
  const dir = path.join(root, 'dev', 'site1');
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/feature-x\n');
  fs.writeFileSync(path.join(dir, '.git', 'config'), '[remote "origin"]\n\turl = git@github.com:webship/workspace.git\n');
  const menus: any[] = [];
  const setups: any[] = [];
  const api: any = {
    name: P, config: {}, settings: { file: manifest.settingsFile, read: () => ({ host: 'github.com' }), set() {}, setList() {} },
    lib: { esc: (s: unknown) => String(s), ROOT: root, workspaceDir: (ws: string) => path.join(root, ws), listProjects: (d: string) => fs.readdirSync(d), screenAction() {}, iconHtml: () => '', NAME_RE: /^[a-zA-Z0-9_-]+$/ },
    addRowMenu: (_slot: string, _spec: any, fn: any) => menus.push(fn), addProjectChip() {}, addAction() {}, addFolderSetup: (s: any) => setups.push(s), addCss() {}, addForge() {},
  };
  register(api);
  const html = [...menus.map((fn) => fn({ key: 'dev', project: 'site1', dir: path.join(root, 'dev'), meta: {}, allowed: new Set(), vals: () => '' })), ...setups.map((s) => s.html('dev', {}))].join('\n');
  fs.rmSync(root, { recursive: true, force: true });
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

test('every menu entry an item names is one the plugin draws', () => {
  const ui = drawn();
  assert.match(ui, new RegExp(`${manifest.label.toUpperCase()} `), 'the menu is drawn for a project whose remote is on the host');
  let checked = 0;
  for (const f of MAIN_FILES) {
    // A row of a table whose first cell is a bold label is a menu entry; so is "offers **…**".
    const labels = [...read(f).matchAll(/^\| \*\*([^*]+)\*\*/gm), ...read(f).matchAll(/offers \*\*([^*]+)\*\*/g)].map((m) => m[1]);
    for (const label of labels) {
      assert.ok(ui.includes(label), `${f}: the plugin draws no "${label}"`);
      checked += 1;
    }
    if (read(f).includes('menu')) assert.ok(read(f).includes(`${manifest.label.toUpperCase()} menu`), `${f} calls the menu by its label`);
  }
  assert.ok(checked >= 6, `the skill lists the entries of the menu (${checked} checked)`);
});

test('every settings key an item names is in the settings template, and the template has none the skill leaves out', () => {
  const template = read(manifest.settingsTemplate);
  const keys = [...template.matchAll(/^([a-z_]+):/gm)].map((m) => m[1]);
  assert.ok(keys.length > 0);
  const named = new Set<string>();
  for (const f of MAIN_FILES) {
    for (const m of read(f).matchAll(/`([a-z_]+):`/g)) {
      assert.ok(keys.includes(m[1]), `${f}: ${manifest.settingsFile} has no key ${m[1]}`);
      named.add(m[1]);
    }
    if (named.size) assert.ok(read(f).includes(`core/config/${manifest.settingsFile}`) || !/`[a-z_]+:`/.test(read(f)), `${f} says which file the keys are in`);
  }
  assert.deepStrictEqual([...named].sort(), [...keys].sort(), 'the skill describes every key of the template');
});

// The commands gh has, with their flags: `gh <command> --help` on a real gh (the first line of the fixture says which).
const CLI = 'gh';
const CLI_COMMANDS: Record<string, string[]> = Object.fromEntries(read(`tests/fixtures/${CLI}-commands.txt`).split('\n').filter((l) => l && !l.startsWith('#'))
  .map((l) => { const words = l.split(' '); const at = words.findIndex((w) => w.startsWith('--')); return [words.slice(0, at < 0 ? words.length : at).join(' '), at < 0 ? [] : words.slice(at)]; }));
// What the plugin itself runs (src/lib/provider.ts): an item that says "what the menu runs" shows these.
const PLUGIN_RUNS = ['gh issue list', 'gh pr list', 'gh pr create'];

/** The pieces of a line that are commands: split where a shell would start another one. */
const commandsIn = (line: string) => line.split(/&&|\|\||[;|`]|\bthen\b|#/).map((s) => s.trim());

test('every gh command an item names exists, with the flags it is given', () => {
  for (const c of PLUGIN_RUNS) {
    assert.ok(CLI_COMMANDS[c], `${c} is in the fixture`);
    assert.ok(read('src/lib/provider.ts').includes(`'${c.split(' ')[1]}'`) || read('src/lib/provider.ts').includes(c), `${c} is what the plugin runs`);
  }
  const usedCommands = new Set<string>();
  let flags = 0;
  for (const f of [...ITEM_FILES, 'README.md']) {
    for (const line of read(f).split('\n')) {
      for (const piece of commandsIn(line)) {
        const m = piece.match(new RegExp(`^${CLI} ([a-z]+)(?: ([a-z]+))?(.*)$`));
        if (!m) continue;
        const name = CLI_COMMANDS[`${CLI} ${m[1]} ${m[2]}`] ? `${CLI} ${m[1]} ${m[2]}` : `${CLI} ${m[1]}`;
        assert.ok(CLI_COMMANDS[name], `${f}: there is no "${piece.split(' ').slice(0, 3).join(' ')}" in ${CLI}`);
        usedCommands.add(name);
        for (const flag of m[3].match(/(?<![\w-])--[a-z][a-z-]*/g) || []) {
          assert.ok(CLI_COMMANDS[name].includes(flag), `${f}: ${name} has no ${flag}`);
          flags += 1;
        }
        assert.doesNotMatch(m[3], /(^| )-[A-Za-z]( |$)/, `${f}: ${piece}: the long flag, so that it can be checked`);
      }
    }
  }
  for (const c of PLUGIN_RUNS) assert.ok(usedCommands.has(c), `the items show ${c}, which the plugin runs`);
  assert.ok(flags > 20, `the items show the commands with their flags (${flags} checked)`);
});

// The workspace's own commands an item may name (github.com/webship/workspace), with the flags it may give them.
const CORE_COMMANDS: Record<string, string[]> = {
  'cmd-tools-testing.sh': ['--run', '--path', '--tags', '--dry-run'],
};
const PLUGINS_SH = ['--list', '--require', '--activate', '--install', '--configure', '--deactivate', '--uninstall', '--check', '--with-needs'];

test('every workspace command an item names exists, with the flags it is given', () => {
  assert.strictEqual(manifest.commands, undefined, 'this plugin places no cmd-*.sh: gh in the project is the terminal command');
  let used = 0;
  for (const f of [...ITEM_FILES, 'README.md']) {
    for (const line of read(f).split('\n')) {
      for (const m of line.matchAll(/(cmd-[a-z0-9<>-]+\.sh)((?:(?!cmd-)[^`|#;])*)/g)) {
        assert.ok(CORE_COMMANDS[m[1]], `${f}: ${m[1]} is not a command of the workspace`);
        for (const flag of m[2].match(/(?<![\w-])--[a-z][a-z-]*/g) || []) assert.ok(CORE_COMMANDS[m[1]].includes(flag), `${f}: ${m[1]} has no ${flag}`);
        used += 1;
      }
      for (const m of line.matchAll(/plugins\.sh((?:[^`|#;])*)/g)) {
        for (const flag of m[1].match(/(?<![\w-])--[a-z][a-z-]*/g) || []) assert.ok(PLUGINS_SH.includes(flag), `${f}: plugins.sh has no ${flag}`);
        used += 1;
      }
    }
  }
  assert.ok(used > 5, 'the items show the workspace commands');
});

test('the items say container-based, name the plugin they come with, and carry no personal value', () => {
  for (const f of ITEM_FILES) {
    const src = read(f);
    assert.doesNotMatch(src, /DDEV-only/i, `${f}: the workspace is container-based, DDEV by default`);
    assert.doesNotMatch(src, /\/home\/(?!YOUR_USER)[a-z]/, `${f} carries no personal path`);
    for (const m of src.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[a-z]{2,}/g) || []) assert.match(m, /@example\.(com|org)$/, `${f}: ${m} is not an example address`);
    assert.doesNotMatch(src, /CHANGE_ME|gh[pousr]_[A-Za-z0-9]{8,}|github_pat_/, `${f} carries no token and no placeholder of one`);
    assert.doesNotMatch(src, /--show-token(?!`, not)/, `${f} never shows a token`);
  }
  for (const f of MAIN_FILES) {
    assert.match(read(f).replace(/\s+/g, ' '), /container-based (workspace )?\(DDEV by default\)|container-based, DDEV by default/, `${f} says what the workspace runs on`);
    assert.match(read(f), new RegExp(`${CLI} [a-z]+ [a-z]+`), `${f} names the commands the plugin works with`);
  }
  for (const f of [...manifest.ai.agents, ...manifest.ai.prompts]) {
    assert.match(read(f), /Reviewed by a human/, `${f} carries the Checkpoints rule`);
    assert.match(read(f), /[Nn]ever tick/, `${f}: the two human-review boxes are never ticked by an agent`);
  }
  const readme = read('README.md');
  for (const name of [...AGENTS, ...SKILLS, ...AI_COMMANDS, ...PROMPTS]) assert.ok(readme.includes(name), `the README lists ${name}`);
});

// The book's folder is a path, not an assistant: webship/webship-js-ai-agent, webship/webship-js-skills and
// webship/ai-agents install the book in <root>/.claude/automated-functional-testing-recipes/ for every AI CLI (Codex,
// Gemini and Copilot too). An item may give that folder; nothing else of one assistant.
const BOOK_FOLDER = /(?:~\/)?\.claude\/automated-functional-testing-recipes\//g;

test('the body of every item is plain Markdown: it names no tool or feature of one AI command-line assistant', () => {
  for (const f of ITEM_FILES.filter((x) => x.endsWith('.md'))) {
    // What is left once the default launch line of a prompt is taken out: the words an assistant is asked to follow.
    const body = bodyOf(read(f)).replace(/^\s*claude --permission-mode bypassPermissions """\s*$/m, '').replace(BOOK_FOLDER, '');
    for (const m of body.matchAll(/\b(Bash|Read|Write|Edit|Grep|Glob|Task|Agent|Skill|TodoWrite|WebFetch) tool\b|\bsubagents?\b|bypassPermissions|\bClaude\b|\bclaude -p\b|\.claude\/|\bMCP\b|mcp__/g)) {
      assert.fail(`${f}: "${m[0]}" belongs to one AI assistant; the body is for any of them`);
    }
  }
});

test('Claude Code stays the default shape: a prompt says its text works in another assistant, a command says its arguments in words', () => {
  for (const f of manifest.ai.prompts) {
    assert.match(read(f), /^\s*claude --permission-mode bypassPermissions """\s*$/m, `${f} keeps the default launch command`);
    assert.match(read(f), /^The text between the triple quotes is plain: it can be given to another AI command-line assistant as it is\.$/m, `${f} says its text is not tied to one assistant`);
  }
  for (const f of manifest.ai.commands) {
    assert.ok(read(f).includes('$ARGUMENTS'), `${f} reads what was typed after the command`);
    assert.match(bodyOf(read(f)), /The (first word|argument) is /, `${f} says in words what the arguments are, for an assistant that does not fill $ARGUMENTS in`);
  }
});

// Other AI command-line assistants read the frontmatter with a strict YAML parser: a value such a parser
// cannot read is lost there (the item arrives with an empty description). The default assistant is lenient,
// so the items are held to the strict reading here.
test('the frontmatter of every item is YAML a strict parser reads', () => {
  const ai = JSON.parse(read('package.json')).workspacePlugin.ai || {};
  const files: string[] = [...(ai.agents || []), ...(ai.commands || []), ...(ai.skills || []).map((s: string) => `${s}/SKILL.md`)];
  let seen = 0;
  for (const f of files) {
    const head = frontmatter(read(f));
    assert.ok(head, `${f} has frontmatter`);
    for (const line of head.split('\n').slice(1)) {
      const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*):(?: (.*))?$/);
      if (!m) {
        assert.match(line, /^ +(- )?\S/, `${f}: "${line}" is neither a key nor a part of the key above it`);
        continue;
      }
      const value = (m[2] || '').trim();
      seen += 1;
      if (value === '') continue; // a list follows
      if (value.startsWith("'")) { assert.match(value, /^'(?:[^']|'')*'$/, `${f}: the value of ${m[1]} is not a closed single-quoted value`); continue; }
      if (value.startsWith('"')) { assert.doesNotThrow(() => JSON.parse(value), `${f}: the value of ${m[1]} is not a closed double-quoted value`); continue; }
      if (/^\[.*\]$/.test(value)) continue; // a list on one line
      assert.doesNotMatch(value, /: |:$| #/, `${f}: the value of ${m[1]} holds ": " or " #". A strict YAML parser stops there, and the assistant that uses one gets no ${m[1]}: reword it, or quote the value`);
      assert.doesNotMatch(value, /^(?:[[\]{}>|*&!%@\`#,]|[-?:] )/, `${f}: the value of ${m[1]} starts with a sign YAML keeps for itself: quote the value`);
    }
  }
  assert.ok(seen > 0, 'the items carry frontmatter');
});

// When the work touches automated functional testing, the items send the reader to the book Automated Functional
// Testing Recipes first: every agent and skill carries the same section "The book", the tester and the scenarios
// skill of a platform also name the chapters to start with, and a command or a prompt that runs the suite points to it.
const BOOK_WHERE = [
  '.claude/automated-functional-testing-recipes/',
  '~/.claude/automated-functional-testing-recipes/',
  'https://github.com/webship/webship-js-ai-agent/tree/2.0.x/automated-functional-testing-recipes',
];
test('the items point to the book Automated Functional Testing Recipes, and say where to find it, in order', () => {
  const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
  const inOrder = (f: string, text: string) => {
    let at = -1;
    for (const where of BOOK_WHERE) {
      const next = text.indexOf(where, at + 1);
      assert.ok(next > at, `${f} gives ${where}, after the place before it`);
      at = next;
    }
  };
  const platform = (manifest.ai.skills || []).some((s: string) => path.basename(s) === `${manifest.name}-scenarios`);
  const sections = new Set<string>();
  const chapters = new Set<string>();
  for (const f of [...(manifest.ai.agents || []), ...(manifest.ai.skills || []).map((s: string) => `${s}/SKILL.md`)]) {
    const src = read(f);
    const start = src.indexOf('\n## The book\n');
    assert.ok(start > 0, `${f} has the section "The book"`);
    const rest = src.slice(start + 1);
    const end = rest.indexOf('\n## ', 1);
    const [base, startWith] = (end < 0 ? rest : rest.slice(0, end)).split('\n- **For ');
    assert.ok(flat(base).includes('read the book *Automated Functional Testing Recipes* first.'), `${f} says to read the book first`);
    inOrder(f, base);
    assert.ok(flat(base).includes('Its `README.md` first, then the chapter that matches the task'), `${f} says how to read it`);
    assert.ok(flat(base).includes('source of truth for step phrasing. When they differ from the book, follow them and say so.'), `${f} says what wins over the book`);
    sections.add(flat(base));
    const item = path.basename(f) === 'SKILL.md' ? path.basename(path.dirname(f)) : path.basename(f, '.md');
    if (platform && [`${manifest.name}-tester`, `${manifest.name}-scenarios`].includes(item)) {
      const named = (startWith || '').match(/`ch\d{2}-[a-z0-9-]+\.md`/g) || [];
      assert.ok(named.length >= 2 && named.length <= 4, `${f} names two to four chapters to start with`);
      chapters.add(named.join(' '));
    } else {
      assert.strictEqual(startWith, undefined, `${f}: only the tester and the scenarios skill of a platform name chapters`);
    }
  }
  assert.strictEqual(sections.size, 1, 'the section is the same in every agent and skill');
  assert.ok(chapters.size <= 1, 'the tester and the scenarios skill name the same chapters');
  for (const f of [...(manifest.ai.commands || []), ...(manifest.ai.prompts || [])]) {
    const src = read(f);
    if (!src.includes('cmd-tools-testing.sh')) continue;
    assert.ok(/the book \*?Automated Functional Testing Recipes/.test(flat(src)), `${f} runs the suite, so it points to the book`);
    inOrder(f, src);
  }
});
