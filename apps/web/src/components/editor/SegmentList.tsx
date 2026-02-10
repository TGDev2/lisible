"use client";

import React, { useRef, useCallback, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { useSegmentsStore } from "@/stores";
import { useKeyboardNavigation } from "@/hooks";
import { SegmentRow } from "./SegmentRow";
import { Loader2, Merge } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SegmentListProps {
  className?: string;
  /** Estimated height of each row for virtualization */
  estimatedRowHeight?: number;
  /** Whether to auto-scroll to active segment */
  autoScrollToActive?: boolean;
  /** Callback when merge is requested */
  onMergeSegments?: (segmentIds: string[]) => void;
  /** Whether merge is in progress */
  isMerging?: boolean;
  /** Callback when split is requested */
  onSplitSegment?: (segmentId: string, cursorPosition: number) => void;
  /** Whether split is in progress */
  isSplitting?: boolean;
}

/**
 * SegmentList component - virtualized list of segments
 *
 * Supports 1000+ segments with smooth scrolling via @tanstack/react-virtual.
 * Features:
 * - Virtual scrolling for performance
 * - Active segment highlighting
 * - Auto-scroll to active segment
 * - Click to select segment
 */
export function SegmentList({
  className,
  estimatedRowHeight = 100,
  autoScrollToActive = true,
  onMergeSegments,
  isMerging = false,
  onSplitSegment,
  isSplitting = false,
}: SegmentListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const scrollingRef = useRef(false);
  const lastClickedIndexRef = useRef<number | null>(null);

  // Get state from store
  const segments = useSegmentsStore((state) => state.segments);
  const activeIndex = useSegmentsStore((state) => state.activeIndex);
  const isLoading = useSegmentsStore((state) => state.isLoading);
  const setActiveIndex = useSegmentsStore((state) => state.setActiveIndex);
  const editingSegmentId = useSegmentsStore((state) => state.editingSegmentId);
  const startEditing = useSegmentsStore((state) => state.startEditing);

  // Multi-selection state
  const selectedSegmentIds = useSegmentsStore((state) => state.selectedSegmentIds);
  const selectRange = useSegmentsStore((state) => state.selectRange);
  const toggleSegmentSelection = useSegmentsStore((state) => state.toggleSegmentSelection);
  const clearSelection = useSegmentsStore((state) => state.clearSelection);
  const canMergeSelection = useSegmentsStore((state) => state.canMergeSelection);
  const getSelectedSegments = useSegmentsStore((state) => state.getSelectedSegments);

  // Handle Enter key to start editing active segment
  const handleEnterActiveSegment = useCallback(() => {
    const activeSegment = segments[activeIndex];
    if (activeSegment) {
      startEditing(activeSegment.id);
    }
  }, [segments, activeIndex, startEditing]);

  // Handle merge button click
  const handleMerge = useCallback(() => {
    const { canMerge } = canMergeSelection();
    if (canMerge && onMergeSegments) {
      const selectedSegs = getSelectedSegments();
      // Sort by sequenceNum to ensure correct order
      const sortedIds = selectedSegs
        .sort((a, b) => a.sequenceNum - b.sequenceNum)
        .map((s) => s.id);
      onMergeSegments(sortedIds);
    }
  }, [canMergeSelection, getSelectedSegments, onMergeSegments]);

  // Check merge availability
  const mergeStatus = canMergeSelection();

  // Keyboard navigation hook
  const { setIsEditing } = useKeyboardNavigation({
    enabled: true,
    onEnterActiveSegment: handleEnterActiveSegment,
    onMergeSegments: handleMerge,
    containerRef: parentRef,
  });

  // Sync editing state with the hook
  useEffect(() => {
    setIsEditing(editingSegmentId !== null);
  }, [editingSegmentId, setIsEditing]);

  // Setup virtualizer
  const virtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 5, // Render 5 extra items above/below visible area
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Handle segment click with Shift+Click support for range selection
  const handleSegmentClick = useCallback(
    (index: number, event?: React.MouseEvent) => {
      if (event?.shiftKey && lastClickedIndexRef.current !== null) {
        // Shift+Click: select range from last clicked to current
        selectRange(lastClickedIndexRef.current, index);
      } else if (event?.ctrlKey || event?.metaKey) {
        // Ctrl/Cmd+Click: toggle selection
        const segment = segments[index];
        if (segment) {
          toggleSegmentSelection(segment.id);
        }
      } else {
        // Normal click: clear selection and set active
        clearSelection();
        setActiveIndex(index);
      }
      lastClickedIndexRef.current = index;
    },
    [setActiveIndex, selectRange, toggleSegmentSelection, clearSelection, segments]
  );

  // Auto-scroll to active segment when it changes
  useEffect(() => {
    if (!autoScrollToActive || segments.length === 0) return;

    // Prevent scroll loop - don't auto-scroll if user is scrolling
    if (scrollingRef.current) return;

    // Use a small delay to ensure the virtualizer has updated
    const timeoutId = setTimeout(() => {
      virtualizer.scrollToIndex(activeIndex, {
        align: "center",
        behavior: "smooth",
      });
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [activeIndex, autoScrollToActive, segments.length, virtualizer]);

  // Track user scrolling to prevent auto-scroll conflicts
  useEffect(() => {
    const element = parentRef.current;
    if (!element) return;

    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      scrollingRef.current = true;
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        scrollingRef.current = false;
      }, 150);
    };

    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-full",
          className
        )}
      >
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm">Chargement des segments...</span>
        </div>
      </div>
    );
  }

  // Empty state
  if (segments.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-full",
          className
        )}
      >
        <div className="text-center text-muted-foreground">
          <p className="text-sm">Aucun segment à afficher</p>
          <p className="text-xs mt-1">
            Importez un fichier SRT/VTT pour commencer
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Merge toolbar - shown when segments are selected */}
      {selectedSegmentIds.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/50">
          <span className="text-sm text-muted-foreground">
            {selectedSegmentIds.size} segment{selectedSegmentIds.size > 1 ? "s" : ""} sélectionné{selectedSegmentIds.size > 1 ? "s" : ""}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleMerge}
            disabled={!mergeStatus.canMerge || isMerging}
            title={mergeStatus.error ?? "Fusionner les segments (Ctrl+M)"}
          >
            {isMerging ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Merge className="h-4 w-4 mr-1" />
            )}
            Fusionner
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSelection}
          >
            Annuler
          </Button>
          {mergeStatus.error && (
            <span className="text-xs text-destructive">{mergeStatus.error}</span>
          )}
        </div>
      )}

      {/* Segment list */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto focus:outline-none"
        role="listbox"
        tabIndex={0}
        aria-label="Liste des segments"
        aria-activedescendant={
          segments[activeIndex]
            ? `segment-${segments[activeIndex].id}`
            : undefined
        }
      >
        {/* Virtualized container */}
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualItems.map((virtualItem) => {
            const segment = segments[virtualItem.index];
            if (!segment) return null;

            const isActive = virtualItem.index === activeIndex;
            const isSelected = selectedSegmentIds.has(segment.id);

            return (
              <div
                key={segment.id}
                id={`segment-${segment.id}`}
                role="option"
                aria-selected={isActive || isSelected}
                data-index={virtualItem.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                ref={virtualizer.measureElement}
              >
                <SegmentRow
                  segment={segment}
                  isActive={isActive}
                  isSelected={isSelected}
                  onClick={(e: React.MouseEvent) => handleSegmentClick(virtualItem.index, e)}
                  onSplitSegment={onSplitSegment}
                  isSplitting={isSplitting}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default SegmentList;
