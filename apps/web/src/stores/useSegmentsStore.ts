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

  // Loading state
  isLoading: boolean;

  // Actions
  setSegments: (segments: SegmentWithAlerts[], fileId: string) => void;
  setActiveIndex: (index: number) => void;
  updateSegment: (segmentId: string, updates: Partial<Segment>) => void;
  updateSegmentAlerts: (segmentId: string, alerts: Alert[]) => void;
  clearSegments: () => void;
  setLoading: (isLoading: boolean) => void;

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
}

export const useSegmentsStore = create<SegmentsState>((set, get) => ({
  // Initial state
  segments: [],
  fileId: null,
  activeIndex: 0,
  isLoading: false,

  // Actions
  setSegments: (segments, fileId) =>
    set({
      segments,
      fileId,
      activeIndex: 0,
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

  clearSegments: () =>
    set({
      segments: [],
      fileId: null,
      activeIndex: 0,
    }),

  setLoading: (isLoading) => set({ isLoading }),

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
