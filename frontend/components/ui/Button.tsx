import { cn } from "@/lib/ui";
import React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};

export function Button({ className, variant = "primary", size = "md", ...props }: Props) {
  const base = "inline-flex items-center justify-center rounded-xl font-medium transition focus:outline-none focus:ring-2 focus:ring-inkomoko-orange/30 disabled:opacity-60 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    primary: "bg-inkomoko-blue text-white hover:bg-inkomoko-blueSoft shadow-soft",
    secondary: "bg-white border border-inkomoko-border text-inkomoko-text hover:bg-inkomoko-bg",
    ghost: "bg-transparent text-inkomoko-text hover:bg-inkomoko-bg",
    danger: "bg-inkomoko-danger text-white hover:opacity-95",
  };
  const sizes: Record<string, string> = {
    sm: "h-9 px-3 text-sm",
    md: "h-10 px-4 text-sm",
    lg: "h-11 px-5 text-base",
  };
  return <button className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}
