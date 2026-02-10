import { create } from "zustand";
import type { SegmentWithAlerts } from "./useSegmentsStore";

/**
 * Maximum number of history entries to keep
 */
const MAX_HISTORY_SIZE = 50;

/**
 * Types of actions that can be undone
 */
export type HistoryActionType =
  | "text"
  | "timecode"
  | "speaker"
  | "soundInfo"
  | "merge"
  | "split";

/**
 * A snapshot of the segments state at a point in time
 */
export interface HistorySnapshot {
  /** Complete segments state snapshot */
  segments: SegmentWithAlerts[];
  /** Active segment index at the time */
  activeIndex: number;
}

interface HistoryState {
  /** Stack of past states (for undo) - these are states we can restore TO */
  past: HistorySnapshot[];
  /** Stack of future states (for redo) - states we undid from */
  future: HistorySnapshot[];
  /** File ID this history belongs to */
  fileId: string | null;

  /**
   * Record a snapshot before a mutation
   * Call this BEFORE making changes to segments
   */
  recordSnapshot: (
    segments: SegmentWithAlerts[],
    activeIndex: number
  ) => void;

  /**
   * Undo the last action
   * @param currentSegments - Current segments state (will be pushed to future for redo)
   * @param currentActiveIndex - Current active index
   * @returns The snapshot to restore, or null if nothing to undo
   */
  undo: (
    currentSegments: SegmentWithAlerts[],
    currentActiveIndex: number
  ) => HistorySnapshot | null;

  /**
   * Redo the last undone action
   * @param currentSegments - Current segments state (will be pushed to past)
   * @param currentActiveIndex - Current active index
   * @returns The snapshot to restore, or null if nothing to redo
   */
  redo: (
    currentSegments: SegmentWithAlerts[],
    currentActiveIndex: number
  ) => HistorySnapshot | null;

  /** Check if undo is available */
  canUndo: () => boolean;

  /** Check if redo is available */
  canRedo: () => boolean;

  /** Clear history (e.g., when changing files) */
  clearHistory: (fileId?: string) => void;

  /** Get undo stack size */
  getUndoCount: () => number;

  /** Get redo stack size */
  getRedoCount: () => number;
}

/**
 * Deep clone segments to avoid reference issues
 */
function cloneSegments(segments: SegmentWithAlerts[]): SegmentWithAlerts[] {
  return segments.map((segment) => ({
    ...segment,
    alerts: segment.alerts.map((alert) => ({ ...alert })),
  }));
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  fileId: null,

  recordSnapshot: (segments, activeIndex) => {
    const { past } = get();

    // Create the snapshot with cloned segments
    const snapshot: HistorySnapshot = {
      segments: cloneSegments(segments),
      activeIndex,
    };

    // Add to past stack, limit size, and clear future (new action branch)
    const newPast = [...past, snapshot];
    if (newPast.length > MAX_HISTORY_SIZE) {
      newPast.shift(); // Remove oldest entry
    }

    set({
      past: newPast,
      future: [], // Clear redo stack on new action
    });
  },

  undo: (currentSegments, currentActiveIndex) => {
    const { past, future } = get();

    if (past.length === 0) {
      return null;
    }

    // Get the last snapshot from past (state to restore TO)
    const snapshotToRestore = past[past.length - 1];
    if (!snapshotToRestore) return null;

    // Save current state to future (for redo)
    const currentSnapshot: HistorySnapshot = {
      segments: cloneSegments(currentSegments),
      activeIndex: currentActiveIndex,
    };

    // Remove last entry from past, add current to future
    const newPast = past.slice(0, -1);

    set({
      past: newPast,
      future: [currentSnapshot, ...future],
    });

    return snapshotToRestore;
  },

  redo: (currentSegments, currentActiveIndex) => {
    const { past, future } = get();

    if (future.length === 0) {
      return null;
    }

    // Get the first snapshot from future (state to restore TO)
    const snapshotToRestore = future[0];
    if (!snapshotToRestore) return null;

    // Save current state to past (for potential undo again)
    const currentSnapshot: HistorySnapshot = {
      segments: cloneSegments(currentSegments),
      activeIndex: currentActiveIndex,
    };

    // Remove first entry from future, add current to past
    const newFuture = future.slice(1);

    set({
      past: [...past, currentSnapshot],
      future: newFuture,
    });

    return snapshotToRestore;
  },

  canUndo: () => get().past.length > 0,

  canRedo: () => get().future.length > 0,

  clearHistory: (fileId) => {
    set({
      past: [],
      future: [],
      fileId: fileId ?? null,
    });
  },

  getUndoCount: () => get().past.length,

  getRedoCount: () => get().future.length,
}));

/**
 * Hook to get undo/redo availability (reactive)
 */
export function useHistoryStatus() {
  const canUndo = useHistoryStore((s) => s.past.length > 0);
  const canRedo = useHistoryStore((s) => s.future.length > 0);
  const undoCount = useHistoryStore((s) => s.past.length);
  const redoCount = useHistoryStore((s) => s.future.length);

  return { canUndo, canRedo, undoCount, redoCount };
}
