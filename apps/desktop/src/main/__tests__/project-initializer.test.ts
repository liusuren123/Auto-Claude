/**
 * Regression tests for checkGitStatus error reporting.
 *
 * Bug: the catch-all used to answer "Not a git repository. Please run git init"
 * for *every* failure — including "git could not be executed at all" (ENOENT,
 * EACCES, sandbox blocks...). Users were sent to run `git init` when the real
 * problem was that git itself never ran.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const execFileSyncMock = vi.fn();

vi.mock('child_process', () => ({
  execFileSync: (...args: unknown[]) => execFileSyncMock(...args)
}));

vi.mock('../cli-tool-manager', () => ({
  getToolPath: () => 'git'
}));

import { checkGitStatus } from '../project-initializer';

/** Error shape produced by Node when a non-zero exit happens. */
function gitExitError(code: number, stderr: string): NodeJS.ErrnoException & { stderr: string } {
  const err = new Error(`Command failed: git\n${stderr}`) as NodeJS.ErrnoException & {
    stderr: string;
  };
  err.code = code as unknown as string;
  err.stderr = stderr;
  return err;
}

describe('checkGitStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports a healthy repository with a branch name', () => {
    execFileSyncMock
      .mockReturnValueOnce('') // rev-parse --git-dir
      .mockReturnValueOnce('') // rev-parse HEAD
      .mockReturnValueOnce('main\n'); // rev-parse --abbrev-ref HEAD

    expect(checkGitStatus('C:/tmp/repo')).toEqual({
      isGitRepo: true,
      hasCommits: true,
      currentBranch: 'main'
    });
  });

  it('reports a repo without commits separately from "not a repo"', () => {
    execFileSyncMock
      .mockReturnValueOnce('') // rev-parse --git-dir
      .mockImplementationOnce(() => {
        throw gitExitError(128, 'fatal: ambiguous argument HEAD');
      })
      .mockImplementationOnce(() => {
        throw gitExitError(128, 'fatal: ambiguous argument HEAD');
      });

    const status = checkGitStatus('C:/tmp/repo');

    expect(status.isGitRepo).toBe(true);
    expect(status.hasCommits).toBe(false);
    expect(status.error).toContain('no commits');
  });

  it('keeps the "not a git repository" message for a real non-repo exit', () => {
    execFileSyncMock.mockImplementation(() => {
      throw gitExitError(128, 'fatal: not a git repository (or any of the parent directories)');
    });

    const status = checkGitStatus('C:/tmp/not-a-repo');

    expect(status.isGitRepo).toBe(false);
    expect(status.error).toBe(
      'Not a git repository. Please run "git init" to initialize git.'
    );
  });

  it('does NOT claim "not a repository" when git could not be executed', () => {
    const spawnError = new Error('spawnSync git ENOENT') as NodeJS.ErrnoException;
    spawnError.code = 'ENOENT';
    execFileSyncMock.mockImplementation(() => {
      throw spawnError;
    });

    const status = checkGitStatus('C:/tmp/repo');

    expect(status.isGitRepo).toBe(false);
    expect(status.error).toContain('Unable to run git (ENOENT)');
    expect(status.error).not.toContain('git init');
  });
});
