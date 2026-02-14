"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PricingCardProps {
  name: string;
  description: string;
  price: string;
  priceDetail?: string;
  features: string[];
  limits?: string[];
  cta: string;
  ctaVariant?: "default" | "outline";
  highlighted?: boolean;
  isCurrentPlan?: boolean;
  onCtaClick?: () => void;
  disabled?: boolean;
}

export function PricingCard({
  name,
  description,
  price,
  priceDetail,
  features,
  limits,
  cta,
  ctaVariant = "default",
  highlighted = false,
  isCurrentPlan = false,
  onCtaClick,
  disabled = false,
}: PricingCardProps) {
  return (
    <Card
      className={cn(
        "relative flex flex-col",
        highlighted && "border-primary shadow-lg scale-105"
      )}
    >
      {highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
          Recommandé
        </div>
      )}

      <CardHeader>
        <CardTitle>{name}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="flex-1">
        <div className="mb-6">
          <span className="text-4xl font-bold">{price}</span>
          {priceDetail && (
            <span className="ml-1 text-muted-foreground">{priceDetail}</span>
          )}
        </div>

        <ul className="space-y-2">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm">
              <svg
                className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
              {feature}
            </li>
          ))}
        </ul>

        {limits && limits.length > 0 && (
          <ul className="mt-4 space-y-2 border-t pt-4">
            {limits.map((limit) => (
              <li
                key={limit}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M18 12H6"
                  />
                </svg>
                {limit}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <CardFooter>
        <Button
          className="w-full"
          variant={isCurrentPlan ? "outline" : ctaVariant}
          onClick={onCtaClick}
          disabled={disabled || isCurrentPlan}
        >
          {isCurrentPlan ? "Plan actuel" : cta}
        </Button>
      </CardFooter>
    </Card>
  );
}
