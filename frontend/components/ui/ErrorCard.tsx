"use client";

import { AlertTriangle, RefreshCw, XCircle } from "lucide-react";
import { useState } from "react";

type ErrorCardProps = {
  message?: string;
  title?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  variant?: "error" | "warning" | "info";
};

export function ErrorCard({
  message = "Something went wrong. Please try again.",
  title = "An error occurred",
  onRetry,
  onDismiss,
  variant = "error",
}: ErrorCardProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const styles = {
    error: {
      container: "bg-red-50 border-red-200",
      icon: "bg-red-100 text-red-600",
      title: "text-red-800",
      message: "text-red-600",
      retry: "bg-red-600 hover:bg-red-700 text-white",
      dismiss: "text-red-400 hover:text-red-600",
    },
    warning: {
      container: "bg-amber-50 border-amber-200",
      icon: "bg-amber-100 text-amber-600",
      title: "text-amber-800",
      message: "text-amber-600",
      retry: "bg-amber-600 hover:bg-amber-700 text-white",
      dismiss: "text-amber-400 hover:text-amber-600",
    },
    info: {
      container: "bg-blue-50 border-blue-200",
      icon: "bg-blue-100 text-blue-600",
      title: "text-blue-800",
      message: "text-blue-600",
      retry: "bg-blue-600 hover:bg-blue-700 text-white",
      dismiss: "text-blue-400 hover:text-blue-600",
    },
  };

  const s = styles[variant];

  return (
    <div
      className={`rounded-2xl border ${s.container} p-5 shadow-sm flex items-start gap-4 w-full`}
    >
      {/* Icon */}
      <div className={`rounded-xl p-2.5 ${s.icon} shrink-0`}>
        <AlertTriangle size={20} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold ${s.title}`}>{title}</div>
        <div className={`mt-1 text-sm ${s.message} break-words`}>{message}</div>

        {/* Actions */}
        {onRetry && (
          <button
            onClick={onRetry}
            className={`mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${s.retry}`}
          >
            <RefreshCw size={12} />
            Try again
          </button>
        )}
      </div>

      {/* Dismiss */}
      {onDismiss && (
        <button
          onClick={() => {
            setDismissed(true);
            onDismiss?.();
          }}
          className={`shrink-0 transition-colors ${s.dismiss}`}
        >
          <XCircle size={18} />
        </button>
      )}
    </div>
  );
}