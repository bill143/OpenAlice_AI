import { describe, expect, it } from 'vitest';

import { runHeadlessTask } from './headless-task.js';
import type { Logger } from './logger.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
const noopLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  child() {
    return noopLogger;
  },
} as unknown as Logger;

// node must resolve on PATH for these to spawn.
const baseEnv = { PATH: process.env['PATH'] ?? '' };

describe('runHeadlessTask', () => {
  it('captures clean exit + stdout tail on a one-shot command', async () => {
    const r = await runHeadlessTask({
      command: ['node', '-e', 'process.stdout.write("hello-headless")'],
      cwd: process.cwd(),
      env: baseEnv,
      timeoutMs: 5_000,
      logger: noopLogger,
    });
    expect(r.exitCode).toBe(0);
    expect(r.killed).toBe(false);
    expect(r.stdoutTail).toContain('hello-headless');
  });

  it('keeps stdout and stderr separated (clean pipe, not a PTY)', async () => {
    const r = await runHeadlessTask({
      command: ['node', '-e', 'process.stdout.write("OUT"); process.stderr.write("ERR")'],
      cwd: process.cwd(),
      env: baseEnv,
      timeoutMs: 5_000,
      logger: noopLogger,
    });
    expect(r.stdoutTail).toBe('OUT');
    expect(r.stderrTail).toBe('ERR');
  });

  it('watchdog SIGTERMs a process that overruns timeoutMs', async () => {
    const r = await runHeadlessTask({
      command: ['node', '-e', 'setInterval(() => {}, 1000)'],
      cwd: process.cwd(),
      env: baseEnv,
      timeoutMs: 200,
      logger: noopLogger,
    });
    expect(r.killed).toBe(true);
    expect(r.signal === 'SIGTERM' || r.exitCode !== 0).toBe(true);
  });

  it('reports a missing binary as exitCode -1 instead of throwing', async () => {
    const r = await runHeadlessTask({
      command: ['definitely-not-a-real-binary-xyz123'],
      cwd: process.cwd(),
      env: baseEnv,
      timeoutMs: 5_000,
      logger: noopLogger,
    });
    expect(r.exitCode).toBe(-1);
    expect(r.killed).toBe(false);
  });
});
