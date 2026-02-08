"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Music, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Predefined sound info options with normalized bracket format
 */
const SOUND_INFO_OPTIONS = [
  { value: "[musique]", label: "Musique" },
  { value: "[applaudissements]", label: "Applaudissements" },
  { value: "[silence]", label: "Silence" },
  { value: "[sonnerie]", label: "Sonnerie" },
] as const;

interface SoundInfoDropdownProps {
  /** Called when a sound info is selected (normalized format with brackets) */
  onInsert: (soundInfo: string) => void;
  /** Whether the dropdown is disabled */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * Normalize text to bracket format [xxx]
 * Handles various input formats and ensures consistent output
 */
function normalizeSoundInfo(text: string): string {
  // Remove existing brackets and trim
  let normalized = text.replace(/^\[|\]$/g, "").trim().toLowerCase();

  // Remove any remaining brackets
  normalized = normalized.replace(/[\[\]]/g, "");

  // Return with brackets
  return `[${normalized}]`;
}

/**
 * SoundInfoDropdown component - Dropdown to add sound info like [musique], [applaudissements], etc.
 *
 * Features:
 * - Predefined options: [musique], [applaudissements], [silence], [sonnerie]
 * - "Autre..." option for custom text
 * - Normalizes all input to bracket format
 */
export function SoundInfoDropdown({
  onInsert,
  disabled = false,
  className,
}: SoundInfoDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customText, setCustomText] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowCustomInput(false);
        setCustomText("");
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
      setCustomText("");
    }
  }, []);

  // Handle option selection
  const handleOptionSelect = useCallback((value: string) => {
    onInsert(value);
    setIsOpen(false);
    setShowCustomInput(false);
    setCustomText("");
  }, [onInsert]);

  // Handle custom text submission
  const handleCustomSubmit = useCallback(() => {
    if (customText.trim()) {
      const normalized = normalizeSoundInfo(customText);
      onInsert(normalized);
      setIsOpen(false);
      setShowCustomInput(false);
      setCustomText("");
    }
  }, [customText, onInsert]);

  // Handle custom input keydown
  const handleCustomKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCustomSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowCustomInput(false);
      setCustomText("");
    }
  }, [handleCustomSubmit]);

  // Toggle dropdown
  const toggleDropdown = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
    if (isOpen) {
      setShowCustomInput(false);
      setCustomText("");
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
          isOpen && "bg-muted text-foreground"
        )}
        aria-label="Ajouter une info sonore"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Music className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Info sonore</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", isOpen && "rotate-180")} />
      </Button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className={cn(
            "absolute top-full left-0 mt-1 z-50 min-w-[180px]",
            "bg-popover border border-border rounded-md shadow-lg",
            "py-1 animate-in fade-in-0 zoom-in-95 duration-100"
          )}
          role="menu"
          aria-orientation="vertical"
        >
          {/* Predefined options */}
          {SOUND_INFO_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleOptionSelect(option.value)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left",
                "hover:bg-accent hover:text-accent-foreground",
                "focus:outline-none focus:bg-accent focus:text-accent-foreground"
              )}
              role="menuitem"
            >
              <span className="text-muted-foreground font-mono text-xs">{option.value}</span>
              <span className="text-muted-foreground">·</span>
              <span>{option.label}</span>
            </button>
          ))}

          {/* Separator */}
          <div className="border-t border-border my-1" />

          {/* Custom option */}
          {showCustomInput ? (
            <div className="px-2 py-1.5">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-sm">[</span>
                <Input
                  ref={customInputRef}
                  type="text"
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  onKeyDown={handleCustomKeyDown}
                  placeholder="texte..."
                  className="h-7 text-sm flex-1"
                  aria-label="Texte personnalisé"
                />
                <span className="text-muted-foreground text-sm">]</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCustomSubmit}
                  disabled={!customText.trim()}
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
                    setCustomText("");
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
                "focus:outline-none focus:bg-accent focus:text-accent-foreground",
                "text-muted-foreground"
              )}
              role="menuitem"
            >
              Autre...
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default SoundInfoDropdown;
