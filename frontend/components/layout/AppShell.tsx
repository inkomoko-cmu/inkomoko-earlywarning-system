"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const router = useRouter();
  const warmupKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session?.access_token) return;

    const warmupKey = `${session.user_id}:${session.role}`;
    if (warmupKeyRef.current === warmupKey) return;
    warmupKeyRef.current = warmupKey;

    const routePrefetches =
      session.role === "Donor"
        ? ["/reports"]
        : ["/portfolio", "/profiles", "/reports", "/advisory"];

    for (const path of routePrefetches) {
      router.prefetch(path);
    }

    const warmHeavyData = async () => {
      const calls =
        session.role === "Donor"
          ? [
              apiFetch("/portfolio/overview", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/risk-distribution", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/country-comparison", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/sector-risk-summary?limit=12", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/anomaly-signals", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/composition", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/risk-migration", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/performance-distribution", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/correlation-drivers", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/quality-ops", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/enterprises", { method: "GET" }, true, { cacheTtlMs: 120000 }),
            ]
          : [
              apiFetch("/portfolio/overview", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/risk-distribution", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/country-comparison", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/sector-risk-summary?limit=12", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/anomaly-signals", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/composition", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/risk-migration", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/performance-distribution", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/correlation-drivers", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/quality-ops", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/by-country", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/by-sector", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/trends?months=12", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/enterprises", { method: "GET" }, true, { cacheTtlMs: 120000 }),
              apiFetch("/portfolio/loans", { method: "GET" }, true, { cacheTtlMs: 120000 }),
            ];

      await Promise.allSettled(calls);
    };

    const run = () => {
      void warmHeavyData();
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      (window as any).requestIdleCallback(run, { timeout: 1500 });
    } else {
      setTimeout(run, 400);
    }
  }, [router, session]);

  return (
    <div className="min-h-screen flex">
      <div className="no-print sticky top-0 h-screen flex-shrink-0 overflow-y-auto">
        <Sidebar />
      </div>

      <div className="flex-1 min-w-0">
        <div className="no-print">
          <Topbar />
        </div>

        {/* Page content */}
        <main className="px-6 py-6 print:p-0 bg-inkomoko-bg print:bg-white min-h-[calc(100vh-60px)]">
          {children}
        </main>
      </div>
    </div>
  );
}
