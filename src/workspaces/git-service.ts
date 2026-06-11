import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export interface GitLogEntry {
  readonly hash: string;
  readonly subject: string;
  readonly relTime: string;
  readonly authorTime: string;
}

export interface GitStatusFile {
  readonly path: string;
  /** Two-char porcelain code, e.g. ` M`, `A `, `??`. */
  readonly status: string;
}

export interface GitStatus {
  readonly branch: string | null;
  readonly clean: boolean;
  readonly files: readonly GitStatusFile[];
}

const LOG_FORMAT = '%h%x09%ar%x09%aI%x09%s';
const GIT_TIMEOUT_MS = 5_000;

/**
 * Wrap `git log --pretty=...` so the panel can render hash + subject + time.
 * Tab-separated to avoid quoting headaches inside commit subjects.
 */
export async function gitLog(cwd: string, limit: number): Promise<GitLogEntry[]> {
  const n = Math.max(1, Math.min(limit, 500));
  const { stdout } = await exec(
    'git',
    ['log', `--pretty=format:${LOG_FORMAT}`, `-n`, String(n)],
    { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
  );
  const lines = stdout.split('\n').filter((l) => l.length > 0);
  return lines.map((line) => {
    const parts = line.split('\t');
    return {
      hash: parts[0] ?? '',
      relTime: parts[1] ?? '',
      authorTime: parts[2] ?? '',
      subject: parts.slice(3).join('\t'),
    };
  });
}

/**
 * Best-effort branch + working-tree status. `branch --show-current` returns
 * empty when in detached-HEAD; status files use porcelain v1 (XY path).
 */
export async function gitStatus(cwd: string): Promise<GitStatus> {
  const [branchRes, statusRes] = await Promise.all([
    exec('git', ['branch', '--show-current'], { cwd, timeout: GIT_TIMEOUT_MS }).catch(
      () => ({ stdout: '' }),
    ),
    exec('git', ['status', '--porcelain=v1'], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
    }),
  ]);
  const branchRaw = branchRes.stdout.trim();
  const branch = branchRaw.length > 0 ? branchRaw : null;
  const files: GitStatusFile[] = statusRes.stdout
    .split('\n')
    .filter((l) => l.length > 0)
    .map((line) => ({
      status: line.slice(0, 2),
      // Porcelain emits 3-byte prefix `XY ` then the path. Rename rows have a
      // `->` separator; for v1's simple panel we keep the original line as-is
      // after the prefix.
      path: line.slice(3),
    }));
  return { branch, clean: files.length === 0, files };
}
