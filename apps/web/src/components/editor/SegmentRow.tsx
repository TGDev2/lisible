"use client";

import React, { memo, useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { AlertCircle, AlertTriangle, Info, CheckCircle, Loader2 } from "lucide-react";
import { useSegmentMutation } from "@/hooks";
import type { SegmentWithAlerts, AlertSeverity } from "@/stores";

interface SegmentRowProps {
  segment: SegmentWithAlerts;
  isActive: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/**
 * Format milliseconds to timecode string (HH:MM:SS,mmm)
 */
function formatTimecode(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = ms % 1000;

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")},${milliseconds
    .toString()
    .padStart(3, "0")}`;
}

/**
 * Get the highest severity from a list of alerts
 */
function getHighestSeverity(
  alerts: SegmentWithAlerts["alerts"]
): AlertSeverity | null {
  if (alerts.length === 0) return null;

  const severityOrder: AlertSeverity[] = ["critical", "warning", "info"];
  for (const severity of severityOrder) {
    if (alerts.some((alert) => alert.severity === severity)) {
      return severity;
    }
  }
  return null;
}

/**
 * Alert indicator icon component
 */
function AlertIndicator({ severity }: { severity: AlertSeverity | null }) {
  if (severity === null) {
    return (
      <CheckCircle
        className="h-4 w-4 text-green-500 shrink-0"
        aria-label="No alerts"
      />
    );
  }

  switch (severity) {
    case "critical":
      return (
        <AlertCircle
          className="h-4 w-4 text-red-500 shrink-0"
          aria-label="Critical alert"
        />
      );
    case "warning":
      return (
        <AlertTriangle
          className="h-4 w-4 text-orange-500 shrink-0"
          aria-label="Warning"
        />
      );
    case "info":
      return (
        <Info
          className="h-4 w-4 text-blue-500 shrink-0"
          aria-label="Info"
        />
      );
    default:
      return null;
  }
}

/**
 * Auto-resizing textarea component
 */
interface AutoResizeTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onBlur: () => void;
  disabled?: boolean;
  className?: string;
}

const AutoResizeTextarea = memo(function AutoResizeTextarea({
  value,
  onChange,
  onKeyDown,
  onBlur,
  disabled,
  className,
}: AutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize effect
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = "auto";
      // Set height to scrollHeight to expand
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [value]);

  // Focus on mount
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.focus();
      // Place cursor at end
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
  }, []);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      disabled={disabled}
      rows={1}
      className={cn(
        "w-full resize-none overflow-hidden bg-background border border-primary rounded px-2 py-1",
        "text-sm leading-relaxed break-words",
        "focus:outline-none focus:ring-2 focus:ring-ring",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      aria-label="Edit segment text"
    />
  );
});

/**
 * SegmentRow component - displays a single segment in the list with inline editing
 */
export const SegmentRow = memo(function SegmentRow({
  segment,
  isActive,
  onClick,
  style,
}: SegmentRowProps) {
  const severity = getHighestSeverity(segment.alerts);
  const alertCount = segment.alerts.length;

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(segment.text);
  const rowRef = useRef<HTMLDivElement>(null);

  // Mutation hook
  const { mutateSegment, rollback, isPending } = useSegmentMutation();

  // Sync editedText when segment.text changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditedText(segment.text);
    }
  }, [segment.text, isEditing]);

  /**
   * Enter edit mode
   */
  const enterEditMode = useCallback(() => {
    setEditedText(segment.text);
    setIsEditing(true);
  }, [segment.text]);

  /**
   * Exit edit mode without saving
   */
  const cancelEdit = useCallback(() => {
    setEditedText(segment.text);
    setIsEditing(false);
    rollback(segment.id);
  }, [segment.text, segment.id, rollback]);

  /**
   * Save changes and exit edit mode
   */
  const saveEdit = useCallback(async () => {
    const trimmedText = editedText.trim();

    // Don't save if text is empty or unchanged
    if (!trimmedText || trimmedText === segment.text) {
      cancelEdit();
      return;
    }

    // Optimistic update with debounce for rapid edits
    await mutateSegment(segment.id, { text: trimmedText }, { debounceMs: 300 });
    setIsEditing(false);
  }, [editedText, segment.text, segment.id, mutateSegment, cancelEdit]);

  /**
   * Handle keyboard events in edit mode
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        // Enter without Shift = validate
        e.preventDefault();
        saveEdit();
      } else if (e.key === "Escape") {
        // Escape = cancel
        e.preventDefault();
        cancelEdit();
      }
      // Shift+Enter allows new line (default behavior)
    },
    [saveEdit, cancelEdit]
  );

  /**
   * Handle blur - save when clicking outside
   */
  const handleBlur = useCallback(() => {
    // Small delay to allow click events to process first
    setTimeout(() => {
      if (isEditing) {
        saveEdit();
      }
    }, 100);
  }, [isEditing, saveEdit]);

  /**
   * Handle row click
   */
  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      // If clicking on the text area, enter edit mode
      const target = e.target as HTMLElement;
      if (target.closest("[data-text-content]")) {
        enterEditMode();
      } else if (!isEditing) {
        onClick?.();
      }
    },
    [enterEditMode, isEditing, onClick]
  );

  /**
   * Handle row key down
   */
  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isEditing) return;

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick?.();
      } else if (e.key === "Tab" && !e.shiftKey) {
        // Tab enters edit mode
        e.preventDefault();
        enterEditMode();
      }
    },
    [isEditing, onClick, enterEditMode]
  );

  return (
    <div
      ref={rowRef}
      role="button"
      tabIndex={isEditing ? -1 : 0}
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
      style={style}
      className={cn(
        "flex items-start gap-3 px-3 py-2 border-b border-border cursor-pointer transition-colors",
        "hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset",
        isActive && "bg-primary/10 border-l-2 border-l-primary",
        isEditing && "bg-muted/30"
      )}
    >
      {/* Sequence number */}
      <div className="w-10 shrink-0 text-xs text-muted-foreground font-mono">
        #{segment.sequenceNum}
      </div>

      {/* Alert indicator */}
      <div className="shrink-0 pt-0.5">
        {isPending ? (
          <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" aria-label="Saving..." />
        ) : (
          <AlertIndicator severity={severity} />
        )}
      </div>

      {/* Content section */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Timecodes */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
          <span>{formatTimecode(segment.startMs)}</span>
          <span className="text-muted-foreground/50">→</span>
          <span>{formatTimecode(segment.endMs)}</span>
        </div>

        {/* Speaker label if present */}
        {segment.speaker && (
          <div className="text-xs font-medium text-primary">
            [{segment.speaker}]
          </div>
        )}

        {/* Segment text - editable */}
        {isEditing ? (
          <AutoResizeTextarea
            value={editedText}
            onChange={setEditedText}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            disabled={isPending}
          />
        ) : (
          <p
            data-text-content
            className={cn(
              "text-sm leading-relaxed break-words whitespace-pre-wrap cursor-text",
              "hover:bg-muted/50 rounded px-1 -mx-1 transition-colors",
              segment.isSoundInfo && "italic text-muted-foreground"
            )}
          >
            {segment.text}
          </p>
        )}

        {/* Alert count badge */}
        {alertCount > 0 && !isEditing && (
          <div
            className={cn(
              "inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-sm",
              severity === "critical" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
              severity === "warning" && "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
              severity === "info" && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
            )}
          >
            {alertCount} {alertCount === 1 ? "alerte" : "alertes"}
          </div>
        )}

        {/* Edit mode hint */}
        {isEditing && (
          <div className="text-xs text-muted-foreground">
            <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Enter</kbd> valider
            {" · "}
            <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Esc</kbd> annuler
            {" · "}
            <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Shift+Enter</kbd> nouvelle ligne
          </div>
        )}
      </div>
    </div>
  );
});

export default SegmentRow;
