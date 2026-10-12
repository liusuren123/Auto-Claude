/**
 * Tests for computeAutoColumnWidth — pure helper that distributes the
 * kanban container width across the status columns.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  computeAutoColumnWidth,
  DEFAULT_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  MAX_COLUMN_WIDTH,
  useKanbanSettingsStore,
} from '../kanban-settings-store';

describe('computeAutoColumnWidth', () => {
  it('returns DEFAULT_COLUMN_WIDTH when container width is not yet measured', () => {
    expect(computeAutoColumnWidth(0)).toBe(DEFAULT_COLUMN_WIDTH);
    expect(computeAutoColumnWidth(-1)).toBe(DEFAULT_COLUMN_WIDTH);
  });

  it('splits the usable width evenly across the requested column count', () => {
    // 1200px container, 48px padding, 3 gaps of 16px → usable = 1104; /4 = 276
    const width = computeAutoColumnWidth(1200, { columnCount: 4 });
    expect(width).toBe(276);
  });

  it('clamps to MIN_COLUMN_WIDTH when the container is too narrow', () => {
    // 4 columns of 180 minimum = 720 + 48 + 48 = 816 minimum container width.
    // Anything below that should clamp.
    expect(computeAutoColumnWidth(500, { columnCount: 4 })).toBe(MIN_COLUMN_WIDTH);
    expect(computeAutoColumnWidth(800, { columnCount: 4 })).toBe(MIN_COLUMN_WIDTH);
  });

  it('clamps to MAX_COLUMN_WIDTH when the container is very wide', () => {
    // Threshold: (MAX * 4) + 48 padding + 48 gaps = 2496.
    expect(computeAutoColumnWidth(2496, { columnCount: 4 })).toBe(MAX_COLUMN_WIDTH);
    expect(computeAutoColumnWidth(4000, { columnCount: 4 })).toBe(MAX_COLUMN_WIDTH);
  });

  it('honours a custom paddingPx override', () => {
    // Padding 0, default gap 16: 1200 - 0 - 3*16 = 1152 / 4 = 288
    expect(computeAutoColumnWidth(1200, { columnCount: 4, paddingPx: 0 })).toBe(288);
  });

  it('honours a custom gapPx override', () => {
    // Padding 0, gap 24: 1200 - 0 - 3*24 = 1128 / 4 = 282
    expect(computeAutoColumnWidth(1200, { columnCount: 4, paddingPx: 0, gapPx: 24 })).toBe(282);
  });

  it('default columnCount is 1 (treats the whole width as a single column)', () => {
    // With padding 48 + 0 gaps: 1200 - 48 = 1152, clamped to MAX.
    expect(computeAutoColumnWidth(1200, {})).toBe(MAX_COLUMN_WIDTH);
  });

  it('returns DEFAULT_COLUMN_WIDTH when columnCount is 0 or negative', () => {
    expect(computeAutoColumnWidth(1200, { columnCount: 0 })).toBe(DEFAULT_COLUMN_WIDTH);
    expect(computeAutoColumnWidth(1200, { columnCount: -2 })).toBe(DEFAULT_COLUMN_WIDTH);
  });
});

describe('kanban-settings-store — toggleColumnLocked', () => {
  beforeEach(() => {
    // Reset to a clean default state between tests so actions from one
    // case don't leak into the next.
    useKanbanSettingsStore.getState().resetPreferences('test-project');
  });

  it('initialises preferences on first read so toggleColumnLocked works without an explicit load', () => {
    // After resetPreferences the store holds the default preferences —
    // toggleColumnLocked should now be a no-op-free mutation.
    const state = useKanbanSettingsStore.getState();
    expect(state.columnPreferences).not.toBeNull();
    state.toggleColumnLocked('backlog');
    expect(useKanbanSettingsStore.getState().columnPreferences?.backlog.isLocked).toBe(true);
  });

  it('toggles isLocked back to false on a second click', () => {
    const state = useKanbanSettingsStore.getState();
    state.toggleColumnLocked('queue');
    state.toggleColumnLocked('queue');
    expect(useKanbanSettingsStore.getState().columnPreferences?.queue.isLocked).toBe(false);
  });

  it('initialisePreferences populates the columnPreferences map for all status columns', () => {
    useKanbanSettingsStore.setState({ columnPreferences: null });
    useKanbanSettingsStore.getState().initializePreferences();
    const prefs = useKanbanSettingsStore.getState().columnPreferences;
    expect(prefs).not.toBeNull();
    // Each status column has a default preference object with both fields.
    for (const status of ['backlog', 'queue', 'in_progress', 'ai_review', 'human_review', 'done']) {
      expect(prefs?.[status as keyof typeof prefs]).toMatchObject({
        isCollapsed: false,
        isLocked: false,
      });
    }
  });
});