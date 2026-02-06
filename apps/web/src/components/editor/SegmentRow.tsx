"use client";

import React, { memo } from "react";
import { cn } from "@/lib/utils";
import { AlertCircle, AlertTriangle, Info, CheckCircle } from "lucide-react";
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
 * SegmentRow component - displays a single segment in the list
 */
export const SegmentRow = memo(function SegmentRow({
  segment,
  isActive,
  onClick,
  style,
}: SegmentRowProps) {
  const severity = getHighestSeverity(segment.alerts);
  const alertCount = segment.alerts.length;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      style={style}
      className={cn(
        "flex items-start gap-3 px-3 py-2 border-b border-border cursor-pointer transition-colors",
        "hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset",
        isActive && "bg-primary/10 border-l-2 border-l-primary"
      )}
    >
      {/* Sequence number */}
      <div className="w-10 shrink-0 text-xs text-muted-foreground font-mono">
        #{segment.sequenceNum}
      </div>

      {/* Alert indicator */}
      <div className="shrink-0 pt-0.5">
        <AlertIndicator severity={severity} />
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

        {/* Segment text */}
        <p
          className={cn(
            "text-sm leading-relaxed break-words whitespace-pre-wrap",
            segment.isSoundInfo && "italic text-muted-foreground"
          )}
        >
          {segment.text}
        </p>

        {/* Alert count badge */}
        {alertCount > 0 && (
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
      </div>
    </div>
  );
});

export default SegmentRow;
