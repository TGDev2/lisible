"use client";

import { cn } from "@/lib/utils";
import { useQuota } from "@/hooks/useQuota";

// ─── Calcul couleur selon pourcentage restant ───────────────────────
// Vert  : > 50% restant  (percentUsed < 50)
// Orange: > 20% restant  (percentUsed < 80)
// Rouge : ≤ 20% restant  (percentUsed ≥ 80)
function getColorClasses(percentUsed: number): {
  bar: string;
  text: string;
  bg: string;
  border: string;
} {
  if (percentUsed < 50) {
    // > 50% restant → vert
    return {
      bar: "bg-green-500",
      text: "text-green-700",
      bg: "bg-green-50",
      border: "border-green-200",
    };
  }
  if (percentUsed < 80) {
    // > 20% restant → orange
    return {
      bar: "bg-orange-400",
      text: "text-orange-700",
      bg: "bg-orange-50",
      border: "border-orange-200",
    };
  }
  // ≤ 20% restant → rouge
  return {
    bar: "bg-red-500",
    text: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
  };
}

export interface QuotaBadgeProps {
  /** Additional className */
  className?: string;
}

/**
 * QuotaBadge
 *
 * Affiche :
 * - "X min restantes" (avec mention rollover si applicable)
 * - Barre de progression visuelle
 * - Couleur conditionnelle : vert > 50%, orange > 20%, rouge ≤ 20%
 */
export function QuotaBadge({ className }: QuotaBadgeProps) {
  const { quota, isLoading, error } = useQuota();

  // ── État chargement ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div
        className={cn(
          "flex flex-col gap-1 rounded-md border px-3 py-2 min-w-[140px]",
          "border-gray-200 bg-gray-50",
          className
        )}
        aria-label="Chargement du quota..."
      >
        <div className="h-3 w-24 animate-pulse rounded bg-gray-200" />
        <div className="h-1.5 w-full animate-pulse rounded-full bg-gray-200" />
      </div>
    );
  }

  // ── Erreur silencieuse (ne pas casser l'UI) ────────────────────────────────
  if (error || !quota) {
    return null;
  }

  const { credits } = quota;
  const colors = getColorClasses(credits.percentUsed);

  // ── Label "X min restantes" — edge case rollover ───────────────────────────
  // Si rollover > 0 : "X + Y rollover"
  const rolloverRemaining = Math.max(0, quota.credits.rollover - Math.max(0, quota.credits.used));

  let label: string;
  if (credits.rollover > 0 && rolloverRemaining > 0) {
    const mainRemaining = credits.available - rolloverRemaining;
    label = `${mainRemaining > 0 ? mainRemaining : 0} + ${rolloverRemaining} rollover min restantes`;
  } else {
    label = `${credits.available} min restantes`;
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-md border px-3 py-2 min-w-[150px]",
        colors.bg,
        colors.border,
        className
      )}
      aria-label={label}
      title={`Quota : ${credits.used} / ${credits.total} min utilisées`}
    >
      {/* ── Texte "X min restantes" ─────────────────────────────────────── */}
      <span className={cn("text-xs font-medium", colors.text)}>
        {label}
      </span>

      {/* ── Barre de progression visuelle ─────────── */}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-black/10"
        role="progressbar"
        aria-valuenow={credits.percentUsed}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn("h-full rounded-full transition-all duration-500", colors.bar)}
          style={{ width: `${Math.min(credits.percentUsed, 100)}%` }}
        />
      </div>
    </div>
  );
}
