/**
 * Build the env that the spawned PTY command will inherit.
 *
 * The server inherits the parent shell's env, which may contain stale
 * "I'm-inside-VSCode/iTerm/etc." breadcrumbs that confuse TUI apps. The
 * canonical example: when this server is launched from a VSCode integrated
 * terminal, the parent env carries `TERM_PROGRAM=vscode` and
 * `CLAUDE_CODE_SSE_PORT`. Claude Code's CLI sees those, assumes it's running
 * inside the VSCode extension, and routes multiline input through an SSE
 * channel that doesn't exist on our side — so Shift+Enter silently no-ops
 * even though our `\x1b\r` bytes arrive at the PTY correctly.
 *
 * Fix: strip every terminal-identification env var the parent shell might
 * have, then announce ourselves with `TERM_PROGRAM=auto-quant-launcher`.
 */

const STRIP_EXACT = new Set<string>([
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
]);

const STRIP_PREFIXES = [
  'VSCODE_',
  'CLAUDE_CODE_',
  'ITERM_',
  'WT_',
  'KITTY_',
  'ALACRITTY_',
  'TERMINUS_',
  'WEZTERM_',
  'GHOSTTY_',
];

const SELF_VERSION = '0.1.0';

export function buildSpawnEnv(
  parent: NodeJS.ProcessEnv,
  extras: { [key: string]: string } = {},
  cwd?: string,
): { [key: string]: string } {
  const out: { [key: string]: string } = {};
  for (const [k, v] of Object.entries(parent)) {
    if (typeof v !== 'string') continue;
    if (shouldStrip(k)) continue;
    out[k] = v;
  }
  // Announce ourselves honestly so well-behaved TUI apps can detect us.
  out['TERM'] = 'xterm-256color';
  out['COLORTERM'] = 'truecolor';
  out['TERM_PROGRAM'] = 'openalice-workspaces';
  out['TERM_PROGRAM_VERSION'] = SELF_VERSION;
  // Override PWD to match the spawn cwd. PTY spawn does chdir() to `cwd`,
  // but env PWD is just the parent's PWD passed verbatim. Claude Code CLI
  // selects its `~/.claude/projects/<projectKey>/` from $PWD (not from
  // process.cwd()), so without this override claude writes the workspace's
  // session jsonl into the backend's projectKey — mixing it with whatever
  // happens to be running there. On resume, `--continue` looks in the
  // workspace's own projectKey, finds it empty, and exits 1 → PTY respawn
  // loop into the circuit breaker. Verified end-to-end against the
  // `path.trace` log: pre-fix `envPWD` was the OpenAlice repo root while
  // `spawnCwd` was the workspace dir.
  if (cwd) out['PWD'] = cwd;
  // Caller-supplied per-session env (e.g. AQ_WS_ID, AQ_LAUNCHER_REPO_ROOT)
  // wins over the inherited env so .mcp.json `${VAR}` expansion at Claude
  // startup resolves to the right values.
  for (const [k, v] of Object.entries(extras)) {
    out[k] = v;
  }
  return out;
}

function shouldStrip(name: string): boolean {
  if (STRIP_EXACT.has(name)) return true;
  return STRIP_PREFIXES.some((p) => name.startsWith(p));
}
