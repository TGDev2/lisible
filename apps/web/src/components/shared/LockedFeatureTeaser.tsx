"use client";

import { cn } from "@/lib/utils";

export interface LockedFeatureTeaserProps {
  title: string;
  description: string;
  ctaText?: string;
  ctaHref?: string;
  className?: string;
}

/**
 * LockedFeatureTeaser — Blurred/locked zone encouraging sign-up.
 * Displays a locked feature with a faded preview effect and CTA.
 */
export function LockedFeatureTeaser({
  title,
  description,
  ctaText = "Créer un compte gratuit",
  ctaHref = "/register",
  className,
}: LockedFeatureTeaserProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-dashed border-muted-foreground/25 bg-muted/30",
        className
      )}
    >
      {/* Blurred preview content */}
      <div className="px-4 py-6 sm:px-6" aria-hidden="true">
        <div className="space-y-3 select-none blur-[6px] pointer-events-none">
          <div className="h-3 w-3/4 rounded bg-muted-foreground/10" />
          <div className="h-3 w-1/2 rounded bg-muted-foreground/10" />
          <div className="h-3 w-5/6 rounded bg-muted-foreground/10" />
          <div className="h-3 w-2/3 rounded bg-muted-foreground/10" />
        </div>
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-[2px]">
        {/* Lock icon */}
        <svg
          className="h-8 w-8 text-muted-foreground/50 mb-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>

        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground text-center max-w-xs px-4">
          {description}
        </p>

        <a
          href={ctaHref}
          className="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          {ctaText}
        </a>
      </div>
    </div>
  );
}
