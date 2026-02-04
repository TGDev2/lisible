"use client";

import { cn } from "@/lib/utils";

export interface ProgressBarProps {
  /** Progress percentage (0-100) */
  value: number;
  /** Show percentage text */
  showValue?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Color variant */
  variant?: "default" | "success" | "error";
  /** Additional CSS classes */
  className?: string;
  /** Label to show above the progress bar */
  label?: string;
  /** Show loaded/total bytes */
  showBytes?: boolean;
  /** Loaded bytes */
  loaded?: number;
  /** Total bytes */
  total?: number;
  /** Animated progress bar */
  animated?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const sizeClasses = {
  sm: "h-1",
  md: "h-2",
  lg: "h-3",
};

const variantClasses = {
  default: "bg-primary",
  success: "bg-green-500",
  error: "bg-destructive",
};

export function ProgressBar({
  value,
  showValue = false,
  size = "md",
  variant = "default",
  className,
  label,
  showBytes = false,
  loaded = 0,
  total = 0,
  animated = true,
}: ProgressBarProps) {
  // Clamp value between 0 and 100
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div className={cn("w-full", className)}>
      {/* Header with label and value/bytes */}
      {(label || showValue || showBytes) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && (
            <span className="text-sm font-medium text-foreground">{label}</span>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {showBytes && total > 0 && (
              <span>
                {formatBytes(loaded)} / {formatBytes(total)}
              </span>
            )}
            {showValue && <span>{Math.round(clampedValue)}%</span>}
          </div>
        </div>
      )}

      {/* Progress bar track */}
      <div
        className={cn(
          "w-full overflow-hidden rounded-full bg-muted",
          sizeClasses[size]
        )}
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {/* Progress bar fill */}
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300 ease-out",
            variantClasses[variant],
            animated && clampedValue < 100 && "animate-pulse"
          )}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    </div>
  );
}
