/**
 * @vitest-environment jsdom
 */

/**
 * Regression tests for project-store.initializeProject.
 *
 * Bug: when the main process reported a failure, the store returned `null` and
 * threw away the reason (e.g. "Not a git repository..."). Callers render
 * `result?.error`, so the init dialog fell back to a generic message — and
 * App.tsx's init effect then cleared the error state, making the "Initialize"
 * button look like it did absolutely nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Project } from '../../../shared/types';

const mockInitializeProject = vi.fn();

vi.stubGlobal('window', {
  electronAPI: {
    initializeProject: mockInitializeProject,
    getTabState: vi.fn().mockResolvedValue({ success: true, data: null }),
    saveTabState: vi.fn().mockResolvedValue({ success: true })
  }
});

function makeProject(id: string, autoBuildPath = ''): Project {
  return { id, name: id, path: `C:/tmp/${id}`, autoBuildPath } as unknown as Project;
}

describe('project-store initializeProject', () => {
  let store: typeof import('../project-store');

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    store = await import('../project-store');
  });

  it('surfaces the real error from the main process instead of null', async () => {
    mockInitializeProject.mockResolvedValue({
      success: false,
      error: 'Not a git repository. Please run "git init" to initialize git.'
    });

    const result = await store.initializeProject('p1');

    expect(result).toEqual({
      success: false,
      error: 'Not a git repository. Please run "git init" to initialize git.'
    });
    expect(store.useProjectStore.getState().error).toContain('Not a git repository');
  });

  it('falls back to data.error when the IPC envelope carries no top-level error', async () => {
    mockInitializeProject.mockResolvedValue({
      success: true,
      data: {
        success: false,
        error: 'Project already has auto-claude initialized (.auto-claude exists)'
      }
    });

    const result = await store.initializeProject('p1');

    expect(result?.success).toBe(false);
    expect(result?.error).toContain('.auto-claude exists');
  });

  it('does not mark the project as initialized when the main process fails', async () => {
    store.useProjectStore.getState().setProjects([makeProject('p1')]);
    mockInitializeProject.mockResolvedValue({
      success: true,
      data: { success: false, error: 'nope' }
    });

    await store.initializeProject('p1');

    expect(store.useProjectStore.getState().projects[0].autoBuildPath).toBe('');
  });

  it('updates autoBuildPath when initialization succeeds', async () => {
    store.useProjectStore.getState().setProjects([makeProject('p1')]);
    mockInitializeProject.mockResolvedValue({ success: true, data: { success: true } });

    const result = await store.initializeProject('p1');

    expect(result).toEqual({ success: true });
    expect(store.useProjectStore.getState().projects[0].autoBuildPath).toBe('.auto-claude');
  });

  it('returns a result object (never null) when the IPC call throws', async () => {
    mockInitializeProject.mockRejectedValue(new Error('IPC exploded'));

    const result = await store.initializeProject('p1');

    expect(result).toEqual({ success: false, error: 'IPC exploded' });
    expect(store.useProjectStore.getState().error).toBe('IPC exploded');
  });
});
