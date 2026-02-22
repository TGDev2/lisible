"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface ScoreBadgeProps {
  /** Current SME score (0-100) */
  score: number | null;
  /** Previous score for animation (optional) */
  previousScore?: number | null;
  /** Whether recalculation is in progress */
  isLoading?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Show delta indicator when score changes */
  showDelta?: boolean;
  /** Additional className */
  className?: string;
  /** Threshold for "Excellent" category (default: 90) */
  excellentThreshold?: number;
}

/**
 * Get score category and styling
 */
function getScoreCategory(
  score: number,
  excellentThreshold = 90
): {
  label: string;
  bgColor: string;
  textColor: string;
  ringColor: string;
} {
  if (score >= excellentThreshold) {
    return {
      label: "Excellent",
      bgColor: "bg-green-100",
      textColor: "text-green-800",
      ringColor: "ring-green-500",
    };
  }
  if (score >= 70) {
    return {
      label: "Bon",
      bgColor: "bg-yellow-100",
      textColor: "text-yellow-800",
      ringColor: "ring-yellow-500",
    };
  }
  if (score >= 50) {
    return {
      label: "Moyen",
      bgColor: "bg-orange-100",
      textColor: "text-orange-800",
      ringColor: "ring-orange-500",
    };
  }
  return {
    label: "Non conforme",
    bgColor: "bg-red-100",
    textColor: "text-red-800",
    ringColor: "ring-red-500",
  };
}

/**
 * ScoreBadge component with real-time animation
 * Displays SME score with visual feedback on changes
 */
export function ScoreBadge({
  score,
  previousScore,
  isLoading = false,
  size = "md",
  showDelta = true,
  className,
  excellentThreshold = 90,
}: ScoreBadgeProps) {
  // Animation states
  const [isAnimating, setIsAnimating] = useState(false);
  const [displayedScore, setDisplayedScore] = useState(score);
  const [delta, setDelta] = useState<number | null>(null);

  // Ref to track the last displayed score for animation
  const lastDisplayedScoreRef = useRef(score);

  // Animate score changes
  useEffect(() => {
    if (score === null) {
      setDisplayedScore(null);
      lastDisplayedScoreRef.current = null;
      return;
    }

    const prev = previousScore ?? lastDisplayedScoreRef.current;

    if (prev !== null && prev !== score) {
      // Calculate delta
      const scoreDelta = score - prev;
      setDelta(scoreDelta);
      setIsAnimating(true);

      // Animate the score number
      const duration = 400; // ms
      const steps = 20;
      const stepDuration = duration / steps;
      const stepValue = (score - prev) / steps;
      let currentStep = 0;

      const animationInterval = setInterval(() => {
        currentStep++;
        if (currentStep >= steps) {
          setDisplayedScore(score);
          lastDisplayedScoreRef.current = score;
          clearInterval(animationInterval);

          // Keep delta visible for a moment then fade
          setTimeout(() => {
            setIsAnimating(false);
            setDelta(null);
          }, 1500);
        } else {
          setDisplayedScore(Math.round(prev + stepValue * currentStep));
        }
      }, stepDuration);

      return () => clearInterval(animationInterval);
    } else {
      setDisplayedScore(score);
      lastDisplayedScoreRef.current = score;
    }
  }, [score, previousScore]);

  // Size classes
  const sizeClasses = {
    sm: "px-2 py-1 text-xs",
    md: "px-3 py-1.5 text-sm",
    lg: "px-4 py-2 text-base",
  };

  const iconSize = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  // Loading state
  if (isLoading) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-full font-medium",
          "bg-gray-100 text-gray-500",
          sizeClasses[size],
          className
        )}
      >
        <svg
          className={cn("animate-spin", iconSize[size])}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span>Calcul...</span>
      </div>
    );
  }

  // No score yet
  if (displayedScore === null) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-full font-medium",
          "bg-gray-100 text-gray-500",
          sizeClasses[size],
          className
        )}
      >
        <span>--/100</span>
      </div>
    );
  }

  const category = getScoreCategory(displayedScore, excellentThreshold);
  const scoreIncreased = delta !== null && delta > 0;
  const scoreDecreased = delta !== null && delta < 0;
  const isExcellent = displayedScore >= excellentThreshold;
  const isGood = displayedScore >= 70 && !isExcellent;
  const isAverage = displayedScore >= 50 && !isGood && !isExcellent;

  return (
    <div className="relative inline-flex items-center">
      {/* Main badge */}
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-full font-medium transition-all duration-300",
          category.bgColor,
          category.textColor,
          sizeClasses[size],
          // Animation effects
          isAnimating && "ring-2 ring-offset-2",
          isAnimating && scoreIncreased && "ring-green-500 scale-105",
          isAnimating && scoreDecreased && "ring-red-500 scale-95",
          className
        )}
      >
        {/* Score icon indicator */}
        <span
          className={cn(
            "flex items-center justify-center rounded-full",
            size === "sm" && "w-4 h-4 text-[10px]",
            size === "md" && "w-5 h-5 text-xs",
            size === "lg" && "w-6 h-6 text-sm",
            isExcellent && "bg-green-500 text-white",
            isGood && "bg-yellow-500 text-white",
            isAverage && "bg-orange-500 text-white",
            !isExcellent && !isGood && !isAverage && "bg-red-500 text-white"
          )}
        >
          {isExcellent ? "✓" : isGood ? "!" : isAverage ? "!" : "✕"}
        </span>

        {/* Score value */}
        <span className="font-bold tabular-nums">
          {displayedScore}
          <span className="font-normal opacity-70">/100</span>
        </span>

        {/* Category label (only for md and lg) */}
        {size !== "sm" && (
          <span className="opacity-75">— {category.label}</span>
        )}
      </div>

      {/* Delta indicator */}
      {showDelta && delta !== null && isAnimating && (
        <div
          className={cn(
            "absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full text-xs font-bold",
            "animate-bounce shadow-sm",
            scoreIncreased && "bg-green-500 text-white",
            scoreDecreased && "bg-red-500 text-white"
          )}
        >
          {scoreIncreased ? "+" : ""}{delta}
        </div>
      )}
    </div>
  );
}

/**
 * Compact score indicator for tight spaces (e.g., in headers)
 */
export function ScoreIndicator({
  score,
  isLoading = false,
  className,
}: {
  score: number | null;
  isLoading?: boolean;
  className?: string;
}) {
  if (isLoading) {
    return (
      <div className={cn("w-8 h-8 rounded-full bg-gray-200 animate-pulse", className)} />
    );
  }

  if (score === null) {
    return (
      <div
        className={cn(
          "w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500",
          className
        )}
      >
        --
      </div>
    );
  }

  const category = getScoreCategory(score);

  return (
    <div
      className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
        category.bgColor,
        category.textColor,
        className
      )}
      title={`Score SME: ${score}/100 — ${category.label}`}
    >
      {score}
    </div>
  );
}
