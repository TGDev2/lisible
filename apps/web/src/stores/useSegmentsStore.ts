import { create } from "zustand";
import type { Segment, Alert } from "@sme-studio/db";

export type AlertSeverity = "critical" | "warning" | "info";

export interface SegmentWithAlerts extends Segment {
  alerts: Alert[];
}

interface SegmentsState {
  // Data
  segments: SegmentWithAlerts[];
  fileId: string | null;

  // Active segment
  activeIndex: number;

  // Multi-selection (for merge)
  selectedSegmentIds: Set<string>;

  // Editing state
  editingSegmentId: string | null;

  // Loading state
  isLoading: boolean;

  // Actions
  setSegments: (segments: SegmentWithAlerts[], fileId: string) => void;
  setActiveIndex: (index: number) => void;
  updateSegment: (segmentId: string, updates: Partial<Segment>) => void;
  updateSegmentAlerts: (segmentId: string, alerts: Alert[]) => void;
  refreshAllAlerts: (alerts: Alert[]) => void;
  clearSegments: () => void;
  setLoading: (isLoading: boolean) => void;
  removeSegment: (segmentId: string) => void;

  // Multi-selection
  selectSegment: (segmentId: string) => void;
  toggleSegmentSelection: (segmentId: string) => void;
  selectRange: (fromIndex: number, toIndex: number) => void;
  clearSelection: () => void;
  isSegmentSelected: (segmentId: string) => boolean;
  getSelectedSegments: () => SegmentWithAlerts[];
  canMergeSelection: () => { canMerge: boolean; error?: string };

  // Editing
  startEditing: (segmentId: string) => void;
  stopEditing: () => void;

  // Navigation
  goToNextSegment: () => void;
  goToPreviousSegment: () => void;
  goToNextAlert: () => void;
  goToPreviousAlert: () => void;

  // Computed helpers
  getSegmentById: (segmentId: string) => SegmentWithAlerts | undefined;
  getActiveSegment: () => SegmentWithAlerts | undefined;
  getSegmentAlerts: (segmentId: string) => Alert[];
  getHighestSeverity: (segmentId: string) => AlertSeverity | null;
  isEditing: () => boolean;
}

export const useSegmentsStore = create<SegmentsState>((set, get) => ({
  // Initial state
  segments: [],
  fileId: null,
  activeIndex: 0,
  selectedSegmentIds: new Set<string>(),
  editingSegmentId: null,
  isLoading: false,

  // Actions
  setSegments: (segments, fileId) =>
    set({
      segments,
      fileId,
      activeIndex: 0,
      selectedSegmentIds: new Set<string>(),
      editingSegmentId: null,
    }),

  setActiveIndex: (index) => {
    const { segments } = get();
    if (index >= 0 && index < segments.length) {
      set({ activeIndex: index });
    }
  },

  updateSegment: (segmentId, updates) =>
    set((state) => ({
      segments: state.segments.map((seg) =>
        seg.id === segmentId ? { ...seg, ...updates } : seg
      ),
    })),

  updateSegmentAlerts: (segmentId, alerts) =>
    set((state) => ({
      segments: state.segments.map((seg) =>
        seg.id === segmentId ? { ...seg, alerts } : seg
      ),
    })),

  refreshAllAlerts: (alerts) =>
    set((state) => {
      // Group alerts by segmentId
      const alertsBySegment = new Map<string, Alert[]>();
      for (const alert of alerts) {
        if (!alert.segmentId) continue;
        const existing = alertsBySegment.get(alert.segmentId) ?? [];
        existing.push(alert);
        alertsBySegment.set(alert.segmentId, existing);
      }

      // Update all segments with their new alerts
      return {
        segments: state.segments.map((seg) => ({
          ...seg,
          alerts: alertsBySegment.get(seg.id) ?? [],
        })),
      };
    }),

  clearSegments: () =>
    set({
      segments: [],
      fileId: null,
      activeIndex: 0,
      selectedSegmentIds: new Set<string>(),
    }),

  setLoading: (isLoading) => set({ isLoading }),

  removeSegment: (segmentId) =>
    set((state) => {
      const newSegments = state.segments.filter((seg) => seg.id !== segmentId);
      const newSelectedIds = new Set(state.selectedSegmentIds);
      newSelectedIds.delete(segmentId);

      // Adjust activeIndex if needed
      let newActiveIndex = state.activeIndex;
      if (newActiveIndex >= newSegments.length && newSegments.length > 0) {
        newActiveIndex = newSegments.length - 1;
      }

      return {
        segments: newSegments,
        selectedSegmentIds: newSelectedIds,
        activeIndex: newActiveIndex,
      };
    }),

  // Multi-selection
  selectSegment: (segmentId) =>
    set(() => ({
      selectedSegmentIds: new Set([segmentId]),
    })),

  toggleSegmentSelection: (segmentId) =>
    set((state) => {
      const newSet = new Set(state.selectedSegmentIds);
      if (newSet.has(segmentId)) {
        newSet.delete(segmentId);
      } else {
        newSet.add(segmentId);
      }
      return { selectedSegmentIds: newSet };
    }),

  selectRange: (fromIndex, toIndex) =>
    set((state) => {
      const start = Math.min(fromIndex, toIndex);
      const end = Math.max(fromIndex, toIndex);
      const newSet = new Set<string>();
      for (let i = start; i <= end; i++) {
        const segment = state.segments[i];
        if (segment) {
          newSet.add(segment.id);
        }
      }
      return { selectedSegmentIds: newSet };
    }),

  clearSelection: () => set({ selectedSegmentIds: new Set<string>() }),

  isSegmentSelected: (segmentId) => get().selectedSegmentIds.has(segmentId),

  getSelectedSegments: () => {
    const { segments, selectedSegmentIds } = get();
    return segments.filter((seg) => selectedSegmentIds.has(seg.id));
  },

  canMergeSelection: () => {
    const { segments, selectedSegmentIds } = get();

    // Need exactly 2 segments selected
    if (selectedSegmentIds.size !== 2) {
      return { canMerge: false, error: "Sélectionnez exactement 2 segments" };
    }

    // Get indices of selected segments
    const selectedIndices: number[] = [];
    segments.forEach((seg, idx) => {
      if (selectedSegmentIds.has(seg.id)) {
        selectedIndices.push(idx);
      }
    });

    // Check if consecutive
    if (selectedIndices.length !== 2) {
      return { canMerge: false, error: "Segments non trouvés" };
    }

    const sortedIndices = selectedIndices.sort((a, b) => a - b);
    const first = sortedIndices[0];
    const second = sortedIndices[1];
    if (first === undefined || second === undefined || second - first !== 1) {
      return { canMerge: false, error: "Les segments doivent être consécutifs" };
    }

    return { canMerge: true };
  },

  // Editing
  startEditing: (segmentId) => set({ editingSegmentId: segmentId }),
  stopEditing: () => set({ editingSegmentId: null }),

  // Navigation
  goToNextSegment: () => {
    const { activeIndex, segments } = get();
    if (activeIndex < segments.length - 1) {
      set({ activeIndex: activeIndex + 1 });
    }
  },

  goToPreviousSegment: () => {
    const { activeIndex } = get();
    if (activeIndex > 0) {
      set({ activeIndex: activeIndex - 1 });
    }
  },

  goToNextAlert: () => {
    const { activeIndex, segments } = get();
    for (let i = activeIndex + 1; i < segments.length; i++) {
      const segment = segments[i];
      if (segment && segment.alerts.length > 0) {
        set({ activeIndex: i });
        return;
      }
    }
    // Wrap around to beginning
    for (let i = 0; i < activeIndex; i++) {
      const segment = segments[i];
      if (segment && segment.alerts.length > 0) {
        set({ activeIndex: i });
        return;
      }
    }
  },

  goToPreviousAlert: () => {
    const { activeIndex, segments } = get();
    for (let i = activeIndex - 1; i >= 0; i--) {
      const segment = segments[i];
      if (segment && segment.alerts.length > 0) {
        set({ activeIndex: i });
        return;
      }
    }
    // Wrap around to end
    for (let i = segments.length - 1; i > activeIndex; i--) {
      const segment = segments[i];
      if (segment && segment.alerts.length > 0) {
        set({ activeIndex: i });
        return;
      }
    }
  },

  // Computed helpers
  getSegmentById: (segmentId) => {
    return get().segments.find((seg) => seg.id === segmentId);
  },

  getActiveSegment: () => {
    const { segments, activeIndex } = get();
    return segments[activeIndex];
  },

  getSegmentAlerts: (segmentId) => {
    const segment = get().segments.find((seg) => seg.id === segmentId);
    return segment?.alerts ?? [];
  },

  getHighestSeverity: (segmentId) => {
    const alerts = get().getSegmentAlerts(segmentId);
    if (alerts.length === 0) return null;

    const severityOrder: AlertSeverity[] = ["critical", "warning", "info"];
    for (const severity of severityOrder) {
      if (alerts.some((alert) => alert.severity === severity)) {
        return severity;
      }
    }
    return null;
  },

  isEditing: () => get().editingSegmentId !== null,
}));

// Hook to subscribe to specific segment
export function useSegment(segmentId: string) {
  return useSegmentsStore((state) =>
    state.segments.find((seg) => seg.id === segmentId)
  );
}

// Hook to get active segment
export function useActiveSegment() {
  return useSegmentsStore((state) => state.segments[state.activeIndex]);
}

// Hook to check if segment is active
export function useIsSegmentActive(segmentId: string) {
  return useSegmentsStore(
    (state) => state.segments[state.activeIndex]?.id === segmentId
  );
}
