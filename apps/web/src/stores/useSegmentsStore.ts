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
  editingSegmentId: null,
  isLoading: false,

  // Actions
  setSegments: (segments, fileId) =>
    set({
      segments,
      fileId,
      activeIndex: 0,
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
    }),

  setLoading: (isLoading) => set({ isLoading }),

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
