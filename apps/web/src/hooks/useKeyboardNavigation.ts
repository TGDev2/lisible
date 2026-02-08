import { useEffect, useCallback, useRef, type RefObject } from "react";
import { useSegmentsStore } from "@/stores";

interface UseKeyboardNavigationOptions {
  /**
   * Whether keyboard navigation is enabled
   * @default true
   */
  enabled?: boolean;
  /**
   * Callback when Enter is pressed on active segment
   */
  onEnterActiveSegment?: () => void;
  /**
   * External ref to attach keyboard listeners to
   * If not provided, events are attached to the document
   */
  containerRef?: RefObject<HTMLDivElement>;
}

interface UseKeyboardNavigationReturn {
  /**
   * Whether a segment is currently being edited
   */
  isEditing: boolean;
  /**
   * Set the editing state (call with true when entering edit mode)
   */
  setIsEditing: (editing: boolean) => void;
}

/**
 * useKeyboardNavigation - Global keyboard navigation for segment list
 *
 * Handles:
 * - Arrow Up/Down: Navigate to previous/next segment
 * - Tab/Shift+Tab: Navigate to next/previous segment
 * - Enter: Trigger onEnterActiveSegment callback (for editing)
 *
 * Edge cases:
 * - Stops propagation when editing to avoid conflicts with input fields
 * - Prevents default browser behavior for Tab to enable custom navigation
 */
export function useKeyboardNavigation({
  enabled = true,
  onEnterActiveSegment,
  containerRef,
}: UseKeyboardNavigationOptions = {}): UseKeyboardNavigationReturn {
  const isEditingRef = useRef(false);

  // Store actions
  const goToNextSegment = useSegmentsStore((state) => state.goToNextSegment);
  const goToPreviousSegment = useSegmentsStore(
    (state) => state.goToPreviousSegment
  );
  const segments = useSegmentsStore((state) => state.segments);

  /**
   * Set editing state
   */
  const setIsEditing = useCallback((editing: boolean) => {
    isEditingRef.current = editing;
  }, []);

  /**
   * Handle keyboard events
   */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Skip if navigation is disabled
      if (!enabled) return;

      // Skip if currently editing - don't interfere with input fields
      if (isEditingRef.current) return;

      // Skip if no segments
      if (segments.length === 0) return;

      // Skip if focus is on an input, textarea, or contenteditable element
      const target = event.target as HTMLElement;
      const isInputFocused =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (isInputFocused) return;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          goToNextSegment();
          break;

        case "ArrowUp":
          event.preventDefault();
          goToPreviousSegment();
          break;

        case "Tab":
          // Tab: next segment, Shift+Tab: previous segment
          event.preventDefault();
          if (event.shiftKey) {
            goToPreviousSegment();
          } else {
            goToNextSegment();
          }
          break;

        case "Enter":
          // Only handle Enter when not in edit mode
          if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            onEnterActiveSegment?.();
          }
          break;

        default:
          break;
      }
    },
    [enabled, segments.length, goToNextSegment, goToPreviousSegment, onEnterActiveSegment]
  );

  /**
   * Attach keyboard event listener to the container or document
   */
  useEffect(() => {
    if (!enabled) return;

    // Use container if provided, otherwise use document
    const target = containerRef?.current ?? document;

    target.addEventListener("keydown", handleKeyDown as EventListener);

    return () => {
      target.removeEventListener("keydown", handleKeyDown as EventListener);
    };
  }, [enabled, handleKeyDown, containerRef]);

  return {
    isEditing: isEditingRef.current,
    setIsEditing,
  };
}
