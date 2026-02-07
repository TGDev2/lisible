"use client";

import React, { memo, useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { parseSrtTimecode, formatSrtTimecode } from "@sme-studio/subtitle-parser";

interface TimecodeInputProps {
  value: number; // milliseconds
  onChange: (ms: number) => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  error?: string;
}

/**
 * Timecode input component with mask HH:MM:SS,mmm
 * Parses and validates SRT timecode format
 */
export const TimecodeInput = memo(function TimecodeInput({
  value,
  onChange,
  onBlur,
  onKeyDown,
  disabled,
  className,
  label,
  error,
}: TimecodeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(() => formatSrtTimecode(value));
  const [isEditing, setIsEditing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Sync input value when external value changes (and not editing)
  useEffect(() => {
    if (!isEditing) {
      setInputValue(formatSrtTimecode(value));
      setLocalError(null);
    }
  }, [value, isEditing]);

  /**
   * Validate and format the input as user types
   */
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue = e.target.value;

    // Allow only valid characters: digits, colons, commas, dots
    newValue = newValue.replace(/[^\d:,.]/g, "");

    // Auto-format as user types
    // Remove all separators first
    const digitsOnly = newValue.replace(/[^0-9]/g, "");

    // Format based on digit count
    let formatted = "";
    if (digitsOnly.length <= 2) {
      formatted = digitsOnly;
    } else if (digitsOnly.length <= 4) {
      formatted = `${digitsOnly.slice(0, 2)}:${digitsOnly.slice(2)}`;
    } else if (digitsOnly.length <= 6) {
      formatted = `${digitsOnly.slice(0, 2)}:${digitsOnly.slice(2, 4)}:${digitsOnly.slice(4)}`;
    } else {
      formatted = `${digitsOnly.slice(0, 2)}:${digitsOnly.slice(2, 4)}:${digitsOnly.slice(4, 6)},${digitsOnly.slice(6, 9)}`;
    }

    setInputValue(formatted);
    setLocalError(null);
  }, []);

  /**
   * Validate on blur and convert to milliseconds
   */
  const handleBlur = useCallback(() => {
    setIsEditing(false);

    // Pad incomplete input
    let finalValue = inputValue;
    const digitsOnly = inputValue.replace(/[^0-9]/g, "");

    if (digitsOnly.length < 9) {
      // Pad with zeros to complete the format
      const padded = digitsOnly.padEnd(9, "0");
      finalValue = `${padded.slice(0, 2)}:${padded.slice(2, 4)}:${padded.slice(4, 6)},${padded.slice(6, 9)}`;
      setInputValue(finalValue);
    }

    const parsed = parseSrtTimecode(finalValue);

    if (parsed === null) {
      setLocalError("Format invalide (HH:MM:SS,mmm)");
      // Reset to original value
      setInputValue(formatSrtTimecode(value));
    } else {
      onChange(parsed);
    }

    onBlur?.();
  }, [inputValue, onChange, onBlur, value]);

  /**
   * Handle keyboard events
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      inputRef.current?.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setInputValue(formatSrtTimecode(value));
      setLocalError(null);
      setIsEditing(false);
      inputRef.current?.blur();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      // Increment/decrement by 100ms
      const delta = e.key === "ArrowUp" ? 100 : -100;
      const newValue = Math.max(0, value + delta);
      onChange(newValue);
      setInputValue(formatSrtTimecode(newValue));
    }

    onKeyDown?.(e);
  }, [value, onChange, onKeyDown]);

  const handleFocus = useCallback(() => {
    setIsEditing(true);
    // Select all on focus for easy replacement
    setTimeout(() => {
      inputRef.current?.select();
    }, 0);
  }, []);

  const displayError = error || localError;

  return (
    <div className="flex flex-col gap-0.5">
      {label && (
        <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
          {label}
        </label>
      )}
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        disabled={disabled}
        placeholder="00:00:00,000"
        maxLength={12}
        className={cn(
          "w-[100px] px-1.5 py-0.5 text-xs font-mono",
          "bg-background border rounded",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          displayError && "border-red-500 focus:ring-red-500",
          className
        )}
        aria-label={label || "Timecode"}
        aria-invalid={!!displayError}
      />
      {displayError && (
        <span className="text-[10px] text-red-500">{displayError}</span>
      )}
    </div>
  );
});

export default TimecodeInput;
