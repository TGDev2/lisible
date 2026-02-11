"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { User, ChevronDown, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSegmentsStore } from "@/stores";

interface SpeakerDropdownProps {
  /** Current speaker value (or null if none) */
  currentSpeaker: string | null;
  /** Called when a speaker is selected or created */
  onSelect: (speaker: string | null) => void;
  /** Whether the dropdown is disabled */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Normalize speaker name to uppercase format
 */
function normalizeSpeaker(name: string): string {
  return name.trim().toUpperCase();
}

/**
 * SpeakerDropdown component - Dropdown to assign a speaker to a segment
 *
 * Features:
 * - Shows existing speakers from the current file
 * - "Nouveau locuteur..." option for custom speaker
 * - "Aucun" option to remove speaker
 * - Normalizes speaker names to uppercase
 */
export function SpeakerDropdown({
  currentSpeaker,
  onSelect,
  disabled = false,
  className,
}: SpeakerDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customName, setCustomName] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  // Get existing speakers from segments in the store
  const segments = useSegmentsStore((s) => s.segments);

  // Extract unique speakers from segments
  const existingSpeakers = useMemo(() => {
    const speakerSet = new Set<string>();
    for (const segment of segments) {
      if (segment.speaker) {
        speakerSet.add(segment.speaker);
      }
    }
    return Array.from(speakerSet).sort();
  }, [segments]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowCustomInput(false);
        setCustomName("");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Focus custom input when showing
  useEffect(() => {
    if (showCustomInput && customInputRef.current) {
      customInputRef.current.focus();
    }
  }, [showCustomInput]);

  // Handle keyboard events
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
      setShowCustomInput(false);
      setCustomName("");
    }
  }, []);

  // Handle speaker selection
  const handleSpeakerSelect = useCallback((speaker: string | null) => {
    onSelect(speaker);
    setIsOpen(false);
    setShowCustomInput(false);
    setCustomName("");
  }, [onSelect]);

  // Handle custom speaker submission
  const handleCustomSubmit = useCallback(() => {
    if (customName.trim()) {
      const normalized = normalizeSpeaker(customName);
      onSelect(normalized);
      setIsOpen(false);
      setShowCustomInput(false);
      setCustomName("");
    }
  }, [customName, onSelect]);

  // Handle custom input keydown
  const handleCustomKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCustomSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowCustomInput(false);
      setCustomName("");
    }
  }, [handleCustomSubmit]);

  // Toggle dropdown
  const toggleDropdown = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
    if (isOpen) {
      setShowCustomInput(false);
      setCustomName("");
    }
  }, [disabled, isOpen]);

  return (
    <div ref={containerRef} className={cn("relative inline-block", className)}>
      {/* Trigger button */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={toggleDropdown}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={cn(
          "h-7 px-2 gap-1 text-xs text-muted-foreground hover:text-foreground",
          isOpen && "bg-muted text-foreground",
          currentSpeaker && "text-primary"
        )}
        aria-label="Assigner un locuteur"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <User className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">
          {currentSpeaker ? `[${currentSpeaker}]` : "Locuteur"}
        </span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", isOpen && "rotate-180")} />
      </Button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className={cn(
            "absolute top-full left-0 mt-1 z-50 min-w-[200px]",
            "bg-popover border border-border rounded-md shadow-lg",
            "py-1 animate-in fade-in-0 zoom-in-95 duration-100"
          )}
          role="menu"
          aria-orientation="vertical"
        >
          {/* Remove speaker option */}
          <button
            type="button"
            onClick={() => handleSpeakerSelect(null)}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left",
              "hover:bg-accent hover:text-accent-foreground",
              "focus:outline-none focus:bg-accent focus:text-accent-foreground",
              !currentSpeaker && "bg-accent/50"
            )}
            role="menuitem"
          >
            <span className="text-muted-foreground italic">Aucun</span>
          </button>

          {/* Separator if there are existing speakers */}
          {existingSpeakers.length > 0 && (
            <div className="border-t border-border my-1" />
          )}

          {/* Existing speakers */}
          {existingSpeakers.map((speaker) => (
            <button
              key={speaker}
              type="button"
              onClick={() => handleSpeakerSelect(speaker)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left",
                "hover:bg-accent hover:text-accent-foreground",
                "focus:outline-none focus:bg-accent focus:text-accent-foreground",
                currentSpeaker === speaker && "bg-accent/50"
              )}
              role="menuitem"
            >
              <span className="font-mono text-xs text-muted-foreground">[{speaker}]</span>
            </button>
          ))}

          {/* Separator */}
          <div className="border-t border-border my-1" />

          {/* New speaker option */}
          {showCustomInput ? (
            <div className="px-2 py-1.5">
              <div className="flex items-center gap-1">
                <Input
                  ref={customInputRef}
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  onKeyDown={handleCustomKeyDown}
                  placeholder="Nom du locuteur..."
                  className="h-7 text-sm flex-1 uppercase"
                  aria-label="Nom du nouveau locuteur"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCustomSubmit}
                  disabled={!customName.trim()}
                  className="h-7 px-2"
                  aria-label="Valider"
                >
                  OK
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowCustomInput(false);
                    setCustomName("");
                  }}
                  className="h-7 w-7 p-0"
                  aria-label="Annuler"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1 px-1">
                <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Enter</kbd> valider
                {" · "}
                <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Esc</kbd> annuler
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCustomInput(true)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left",
                "hover:bg-accent hover:text-accent-foreground",
                "focus:outline-none focus:bg-accent focus:text-accent-foreground"
              )}
              role="menuitem"
            >
              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Nouveau locuteur...</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default SpeakerDropdown;
