"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface SubtitleOverlayProps {
  /** Text content of the current segment */
  text: string | null;
  /** Speaker name (displayed as prefix if present) */
  speaker?: string | null;
  /** Additional CSS classes */
  className?: string;
}

/**
 * SubtitleOverlay component - Displays synchronized subtitles over video
 *
 * Edge case: If text is null/empty, nothing is rendered (pas de segment à ce timecode)
 */
export function SubtitleOverlay({
  text,
  speaker,
  className,
}: SubtitleOverlayProps) {
  // Don't render if no text (edge case: pas de segment à ce timecode)
  if (!text || text.trim() === "") {
    return null;
  }

  // Format the display text with optional speaker prefix
  // Gestion locuteur en préfixe
  const displayText = speaker ? `[${speaker}] ${text}` : text;

  return (
    <div
      className={cn(
        // Positionnement absolu sur vidéo (en bas)
        "absolute bottom-8 left-1/2 -translate-x-1/2",
        // Max width to prevent overflow
        "max-w-[90%]",
        // Style fond noir 70%, texte blanc
        "bg-black/70 text-white",
        // Padding and typography
        "px-4 py-2 rounded",
        "text-center text-sm leading-relaxed",
        // Smooth transitions for text changes
        "transition-opacity duration-150",
        // Pointer events none so it doesn't interfere with video controls
        "pointer-events-none",
        // Custom classes
        className
      )}
      role="status"
      aria-live="polite"
      aria-label="Sous-titre"
    >
      {/* Preserve line breaks in subtitle text */}
      {displayText.split("\n").map((line, index) => (
        <React.Fragment key={index}>
          {index > 0 && <br />}
          {line}
        </React.Fragment>
      ))}
    </div>
  );
}

export default SubtitleOverlay;
