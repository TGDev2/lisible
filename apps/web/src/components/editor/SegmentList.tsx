"use client";

import React, { useRef, useCallback, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { useSegmentsStore } from "@/stores";
import { SegmentRow } from "./SegmentRow";
import { Loader2 } from "lucide-react";

interface SegmentListProps {
  className?: string;
  /** Estimated height of each row for virtualization */
  estimatedRowHeight?: number;
  /** Whether to auto-scroll to active segment */
  autoScrollToActive?: boolean;
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
}: SegmentListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const scrollingRef = useRef(false);

  // Get state from store
  const segments = useSegmentsStore((state) => state.segments);
  const activeIndex = useSegmentsStore((state) => state.activeIndex);
  const isLoading = useSegmentsStore((state) => state.isLoading);
  const setActiveIndex = useSegmentsStore((state) => state.setActiveIndex);

  // Setup virtualizer
  const virtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 5, // Render 5 extra items above/below visible area
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Handle segment click
  const handleSegmentClick = useCallback(
    (index: number) => {
      setActiveIndex(index);
    },
    [setActiveIndex]
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
    <div
      ref={parentRef}
      className={cn(
        "h-full overflow-auto",
        className
      )}
      role="listbox"
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

          return (
            <div
              key={segment.id}
              id={`segment-${segment.id}`}
              role="option"
              aria-selected={isActive}
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
                onClick={() => handleSegmentClick(virtualItem.index)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SegmentList;
