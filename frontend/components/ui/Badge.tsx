import { cn } from "@/lib/ui";
import React from "react";

type Props = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "blue" | "orange" | "success" | "warning" | "danger" | "neutral";
};

export function Badge({ className, tone = "neutral", ...props }: Props) {
  const tones: Record<string, string> = {
    neutral: "bg-inkomoko-bg text-inkomoko-text border-inkomoko-border",
    blue: "bg-inkomoko-info/10 text-inkomoko-blue border-inkomoko-info/20",
    orange: "bg-inkomoko-orange/10 text-inkomoko-orange border-inkomoko-orange/20",
    success: "bg-inkomoko-success/10 text-inkomoko-success border-inkomoko-success/20",
    warning: "bg-inkomoko-warning/10 text-inkomoko-warning border-inkomoko-warning/20",
    danger: "bg-inkomoko-danger/10 text-inkomoko-danger border-inkomoko-danger/20",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium", tones[tone], className)} {...props} />;
}
