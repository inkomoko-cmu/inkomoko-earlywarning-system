"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { type AiInsight } from "@/lib/insights";

type UseLiveAiInsightsParams = {
  scopeType: string;
  scopeId?: string | null;
  context: Record<string, unknown>;
  fallbackInsights: AiInsight[];
  enabled?: boolean;
};

type RefreshResponse = {
  status: string;
  stale: boolean;
  job_id?: string | null;
  generated_at?: string | null;
  insights?: AiInsight[];
};

type JobStatusResponse = {
  status: string;
};

export function useLiveAiInsights({
  scopeType,
  scopeId = null,
  context,
  fallbackInsights,
  enabled = true,
}: UseLiveAiInsightsParams) {
  const [liveInsights, setLiveInsights] = useState<AiInsight[] | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const refresh = async () => {
      try {
        const res = await apiFetch<RefreshResponse>(
          "/ai-insights/refresh",
          {
            method: "POST",
            body: JSON.stringify({
              scope_type: scopeType,
              scope_id: scopeId,
              context,
              force_refresh: false,
            }),
          },
          true
        );

        if (cancelled) return;

        if (res.insights && res.insights.length > 0) {
          setLiveInsights(res.insights);
        }
        setStatus(res.status || "queued");
        setJobId(res.job_id || null);
        setLastUpdated(res.generated_at || null);
      } catch {
        if (cancelled) return;
        setStatus("failed");
      }
    };

    refresh();

    return () => {
      cancelled = true;
    };
  }, [scopeType, scopeId, enabled, context]);

  useEffect(() => {
    if (!enabled || !jobId) return;

    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const st = await apiFetch<JobStatusResponse>(`/ai-insights/jobs/${jobId}`, { method: "GET" }, true);
        if (cancelled) return;

        setStatus(st.status);
        if (st.status === "done") {
          const latest = await apiFetch<{
            status: string;
            stale: boolean;
            generated_at?: string | null;
            insights?: AiInsight[];
          }>(
            `/ai-insights?scope_type=${encodeURIComponent(scopeType)}${scopeId ? `&scope_id=${encodeURIComponent(scopeId)}` : ""}`,
            { method: "GET" },
            true
          );
          if (!cancelled && latest.insights && latest.insights.length > 0) {
            setLiveInsights(latest.insights);
            setLastUpdated(latest.generated_at || null);
          }
          setJobId(null);
          clearInterval(timer);
        }

        if (st.status === "failed") {
          setJobId(null);
          clearInterval(timer);
        }
      } catch {
        if (!cancelled) {
          setJobId(null);
          clearInterval(timer);
        }
      }
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jobId, scopeType, scopeId, enabled]);

  const insights = useMemo(() => {
    if (liveInsights && liveInsights.length > 0) {
      return liveInsights;
    }
    return fallbackInsights;
  }, [liveInsights, fallbackInsights]);

  return {
    insights,
    status,
    lastUpdated,
  };
}
