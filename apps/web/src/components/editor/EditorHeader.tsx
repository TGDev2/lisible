"use client";

import { useCallback } from "react";
import { ScoreBadge } from "@/components/shared/ScoreBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EditorHeaderProps {
  /** File name */
  fileName: string;
  /** Current SME score */
  score: number | null;
  /** Previous score for animation */
  previousScore?: number | null;
  /** Whether score is being recalculated */
  isRecalculating?: boolean;
  /** Callback when back button is clicked */
  onBack?: () => void;
  /** Callback when export button is clicked */
  onExport?: () => void;
  /** Additional className */
  className?: string;
}

/**
 * Editor header with file name, score badge, and action buttons
 * Displays real-time score updates with animation feedback
 */
export function EditorHeader({
  fileName,
  score,
  previousScore,
  isRecalculating = false,
  onBack,
  onExport,
  className,
}: EditorHeaderProps) {
  const handleBack = useCallback(() => {
    onBack?.();
  }, [onBack]);

  const handleExport = useCallback(() => {
    onExport?.();
  }, [onExport]);

  return (
    <header
      className={cn(
        "flex items-center justify-between gap-4 px-4 py-3 border-b bg-background",
        className
      )}
    >
      {/* Left section: Back button and file name */}
      <div className="flex items-center gap-3 min-w-0">
        {onBack && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="shrink-0"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 mr-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Retour
          </Button>
        )}

        <div className="flex items-center gap-2 min-w-0">
          {/* File icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 text-muted-foreground shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>

          {/* File name */}
          <span className="font-medium truncate" title={fileName}>
            {fileName}
          </span>
        </div>
      </div>

      {/* Center section: Score badge */}
      <div className="flex items-center justify-center">
        <ScoreBadge
          score={score}
          previousScore={previousScore}
          isLoading={isRecalculating}
          size="md"
          showDelta={true}
        />
      </div>

      {/* Right section: Export button */}
      <div className="flex items-center gap-2 shrink-0">
        {onExport && (
          <Button onClick={handleExport} size="sm">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 mr-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Exporter
          </Button>
        )}
      </div>
    </header>
  );
}
