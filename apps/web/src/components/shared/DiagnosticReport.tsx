"use client";

import { ScoreBadge } from "@/components/shared/ScoreBadge";
import { LockedFeatureTeaser } from "@/components/shared/LockedFeatureTeaser";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface DiagnosticAlert {
  ruleCode: string;
  severity: "critical" | "warning" | "info";
  message: string;
  count: number;
}

export interface DiagnosticReportData {
  score: number;
  breakdown: {
    totalAlerts: number;
    bySeverity: { critical: number; warning: number; info: number };
    byRule: Record<string, { count: number; penalty: number }>;
    totalPenalty: number;
  };
  topAlerts: DiagnosticAlert[];
  fileName: string;
  format: string;
  segmentCount: number;
}

export interface DiagnosticReportProps {
  data: DiagnosticReportData;
  onReset?: () => void;
}

const SEVERITY_STYLES = {
  critical: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
    badge: "bg-red-100 text-red-700",
    icon: "text-red-500",
    label: "Critique",
  },
  warning: {
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    text: "text-yellow-800",
    badge: "bg-yellow-100 text-yellow-700",
    icon: "text-yellow-500",
    label: "Avertissement",
  },
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-800",
    badge: "bg-blue-100 text-blue-700",
    icon: "text-blue-500",
    label: "Information",
  },
} as const;

function SeverityIcon({
  severity,
  className,
}: {
  severity: "critical" | "warning" | "info";
  className?: string;
}) {
  if (severity === "critical") {
    return (
      <svg
        className={cn("h-4 w-4", className)}
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  if (severity === "warning") {
    return (
      <svg
        className={cn("h-4 w-4", className)}
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return (
    <svg
      className={cn("h-4 w-4", className)}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * DiagnosticReport — Displays the full diagnostic result for anonymous visitors.
 * Shows score badge, severity breakdown, top 3 alerts, and locked feature teasers.
 */
export function DiagnosticReport({ data, onReset }: DiagnosticReportProps) {
  const { score, breakdown, topAlerts, fileName, format, segmentCount } = data;
  const isExcellent = score >= 95;

  return (
    <div className="space-y-6">
      {/* Score + file info */}
      <Card>
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-xl">Résultat du diagnostic</CardTitle>
          <p className="text-sm text-muted-foreground">{fileName}</p>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          <ScoreBadge
            score={score}
            size="lg"
            showDelta={false}
            excellentThreshold={95}
          />

          {/* Severity breakdown */}
          <div
            className="w-full grid grid-cols-3 gap-3 sm:gap-4 text-center"
            role="list"
            aria-label="Répartition des alertes par sévérité"
          >
            <div className="rounded-lg bg-red-50 p-3" role="listitem">
              <p className="text-2xl font-bold text-red-700">
                {breakdown.bySeverity.critical}
              </p>
              <p className="text-xs text-red-600">Critiques</p>
            </div>
            <div className="rounded-lg bg-yellow-50 p-3" role="listitem">
              <p className="text-2xl font-bold text-yellow-700">
                {breakdown.bySeverity.warning}
              </p>
              <p className="text-xs text-yellow-600">Avertissements</p>
            </div>
            <div className="rounded-lg bg-blue-50 p-3" role="listitem">
              <p className="text-2xl font-bold text-blue-700">
                {breakdown.bySeverity.info}
              </p>
              <p className="text-xs text-blue-600">Informations</p>
            </div>
          </div>

          {/* File stats */}
          <p className="text-sm text-muted-foreground text-center">
            {segmentCount} segments analysés — Format {format.toUpperCase()}
          </p>
        </CardContent>
      </Card>

      {/* Top alerts */}
      {topAlerts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {isExcellent
                ? "Alertes restantes"
                : "Alertes principales"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3" role="list">
              {topAlerts.map((alert) => {
                const style = SEVERITY_STYLES[alert.severity];
                // For excellent scores, present all alerts as informative
                const displaySeverity = isExcellent ? "info" : alert.severity;
                const displayStyle = SEVERITY_STYLES[displaySeverity];

                return (
                  <li
                    key={alert.ruleCode}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3",
                      displayStyle.bg,
                      displayStyle.border
                    )}
                  >
                    <SeverityIcon
                      severity={displaySeverity}
                      className={cn("mt-0.5 shrink-0", displayStyle.icon)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            "text-sm font-medium",
                            displayStyle.text
                          )}
                        >
                          {alert.message}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            isExcellent ? SEVERITY_STYLES.info.badge : style.badge
                          )}
                        >
                          {isExcellent
                            ? "Info"
                            : style.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {alert.count} segment{alert.count > 1 ? "s" : ""}{" "}
                        concerné{alert.count > 1 ? "s" : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Locked feature teasers */}
      <div className="space-y-4">
        <LockedFeatureTeaser
          title="Détail des segments"
          description="Visualisez chaque segment avec ses alertes et corrigez-les dans l'éditeur guidé."
        />
        <LockedFeatureTeaser
          title="Dossier de preuves PDF"
          description="Générez un rapport professionnel à transmettre à vos clients."
        />
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center gap-3">
        {onReset && (
          <button
            onClick={onReset}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 4v6h6" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            Nouveau diagnostic
          </button>
        )}
      </div>
    </div>
  );
}
