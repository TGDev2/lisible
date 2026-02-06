"use client";

import { cn } from "@/lib/utils";
import type { ProcessingStage } from "@/hooks/useFileStatus";

/**
 * Step definition for progress display
 */
interface Step {
  id: ProcessingStage;
  label: string;
  description: string;
}

/**
 * Processing steps in order
 */
const STEPS: Step[] = [
  {
    id: "uploading",
    label: "Upload",
    description: "Envoi du fichier",
  },
  {
    id: "transcribing",
    label: "Transcription",
    description: "Conversion audio vers texte",
  },
  {
    id: "analyzing",
    label: "Analyse",
    description: "Vérification des règles SME",
  },
];

/**
 * Get step status based on current stage
 */
type StepStatus = "pending" | "active" | "completed" | "error";

function getStepStatus(
  _step: Step,
  currentStage: ProcessingStage,
  stepIndex: number,
  currentIndex: number
): StepStatus {
  if (currentStage === "failed") {
    // If failed, mark current step as error, previous as completed
    if (stepIndex < currentIndex) return "completed";
    if (stepIndex === currentIndex) return "error";
    return "pending";
  }

  if (currentStage === "completed") {
    return "completed";
  }

  if (stepIndex < currentIndex) return "completed";
  if (stepIndex === currentIndex) return "active";
  return "pending";
}

/**
 * Get the index of current stage in steps array
 */
function getCurrentStepIndex(stage: ProcessingStage): number {
  // Map stages to step indices
  switch (stage) {
    case "pending":
    case "uploading":
      return 0;
    case "processing":
    case "transcribing":
      return 1;
    case "analyzing":
      return 2;
    case "completed":
      return 3; // Past last step
    case "failed":
      // Keep at current step (will be determined by progress)
      return -1;
    default:
      return 0;
  }
}

export interface ProgressStepsProps {
  /**
   * Current processing stage
   */
  stage: ProcessingStage;
  /**
   * Progress percentage (0-100)
   */
  progressPercent: number;
  /**
   * Error message to display (when stage is "failed")
   */
  errorMessage?: string | null;
  /**
   * Additional CSS classes
   */
  className?: string;
  /**
   * Show compact view (icons only)
   */
  compact?: boolean;
}

/**
 * ProgressSteps component
 *
 * Displays the current processing stage with visual steps:
 * uploading → transcribing → analyzing → completed
 *
 * @example
 * ```tsx
 * <ProgressSteps
 *   stage="transcribing"
 *   progressPercent={45}
 * />
 * ```
 */
export function ProgressSteps({
  stage,
  progressPercent,
  errorMessage,
  className,
  compact = false,
}: ProgressStepsProps) {
  // Determine current step index based on stage and progress
  let currentIndex = getCurrentStepIndex(stage);

  // For failed state, estimate which step failed based on progress
  if (stage === "failed") {
    if (progressPercent < 30) currentIndex = 0; // Upload phase
    else if (progressPercent < 90) currentIndex = 1; // Transcription phase
    else currentIndex = 2; // Analysis phase
  }

  return (
    <div className={cn("w-full", className)}>
      {/* Progress percentage display */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-foreground">
          Traitement en cours
        </span>
        <span className="text-sm text-muted-foreground">
          {stage === "completed" ? "100" : progressPercent}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-muted rounded-full mb-6 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            stage === "failed" ? "bg-destructive" : "bg-primary",
            stage !== "completed" && stage !== "failed" && "animate-pulse"
          )}
          style={{ width: `${stage === "completed" ? 100 : progressPercent}%` }}
        />
      </div>

      {/* Steps */}
      <div className="relative">
        {/* Connection line */}
        <div className="absolute top-4 left-4 right-4 h-0.5 bg-muted" />

        {/* Steps container */}
        <div className="relative flex justify-between">
          {STEPS.map((step, index) => {
            const status = getStepStatus(step, stage, index, currentIndex);

            return (
              <div
                key={step.id}
                className={cn(
                  "flex flex-col items-center",
                  compact ? "w-8" : "w-24"
                )}
              >
                {/* Step circle */}
                <div
                  className={cn(
                    "relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-300",
                    status === "completed" && "bg-primary border-primary",
                    status === "active" && "bg-background border-primary",
                    status === "pending" && "bg-background border-muted",
                    status === "error" && "bg-destructive border-destructive"
                  )}
                >
                  {/* Icon based on status */}
                  {status === "completed" && (
                    <svg
                      className="w-4 h-4 text-primary-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                  {status === "active" && (
                    <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
                  )}
                  {status === "pending" && (
                    <div className="w-2 h-2 rounded-full bg-muted" />
                  )}
                  {status === "error" && (
                    <svg
                      className="w-4 h-4 text-destructive-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  )}
                </div>

                {/* Label (hidden in compact mode) */}
                {!compact && (
                  <div className="mt-2 text-center">
                    <p
                      className={cn(
                        "text-xs font-medium",
                        status === "completed" && "text-primary",
                        status === "active" && "text-foreground",
                        status === "pending" && "text-muted-foreground",
                        status === "error" && "text-destructive"
                      )}
                    >
                      {step.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                      {step.description}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Error message */}
      {stage === "failed" && errorMessage && (
        <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
          <p className="text-sm text-destructive">{errorMessage}</p>
        </div>
      )}

      {/* Current stage description */}
      {stage !== "failed" && stage !== "completed" && (
        <p className="mt-4 text-sm text-center text-muted-foreground">
          {stage === "uploading" && "Envoi du fichier en cours..."}
          {stage === "pending" && "En attente de traitement..."}
          {(stage === "processing" || stage === "transcribing") &&
            "Transcription du fichier audio/vidéo..."}
          {stage === "analyzing" && "Analyse des règles SME..."}
        </p>
      )}

      {/* Success message */}
      {stage === "completed" && (
        <p className="mt-4 text-sm text-center text-primary font-medium">
          Traitement terminé !
        </p>
      )}
    </div>
  );
}
