"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { RequireRole } from "@/components/auth/RequireRole";
import { Badge } from "@/components/ui/Badge";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { InsightPanel } from "@/components/ui/InsightPanel";
import { apiFetch } from "@/lib/api";
import { type AiInsight, clampConfidence } from "@/lib/insights";
import { useLiveAiInsights } from "@/lib/useLiveAiInsights";
import {
  ArrowLeft,
  Briefcase,
  BrainCircuit,
  Building2,
  Calendar,
  CircleAlert,
  DollarSign,
  Gauge,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";

type EnterpriseProfile = {
  unique_id: string;
  country_code: string | null;
  country_specific: string | null;
  business_sector: string | null;
  business_sub_sector: string | null;
  survey_date: string | null;
  risk_tier_3m: string | null;
  risk_score_3m: number;
  revenue_3m: number;
  jobs_created_3m: number;
  jobs_lost_3m: number;
  plan_after_program: string | null;
};

type EnterpriseLoan = {
  loannumber: string;
  country_code: string;
  industrysectorofactivity: string | null;
  loanstatus: string | null;
  disbursedamount: number;
  currentbalance: number;
  daysinarrears: number;
  installmentinarrears: number;
};

type EnterpriseInsight = {
  type: string;
  title: string;
  detail: string;
  severity: string;
  confidence: number;
};

type EnterpriseAction = {
  priority: string;
  owner: string;
  action: string;
  target_days: number;
};

type EnterpriseDetailResponse = {
  enterprise: EnterpriseProfile;
  related_loans: EnterpriseLoan[];
  portfolio_context: {
    loan_count: number;
    high_arrears_count: number;
    avg_arrears_days: number;
    total_outstanding: number;
    net_jobs_3m: number;
  };
  insights: EnterpriseInsight[];
  actions: EnterpriseAction[];
};

const LOAN_PAGE_SIZE = 80;

const enterpriseDetailCache = new Map<string, EnterpriseDetailResponse>();
const enterpriseDetailInFlight = new Map<string, Promise<EnterpriseDetailResponse>>();

function fetchEnterpriseDetail(uniqueId: string, forceRefresh = false) {
  if (!forceRefresh) {
    const cached = enterpriseDetailCache.get(uniqueId);
    if (cached) return Promise.resolve(cached);

    const pending = enterpriseDetailInFlight.get(uniqueId);
    if (pending) return pending;
  }

  const request = apiFetch<EnterpriseDetailResponse>(
    `/portfolio/enterprises/${encodeURIComponent(uniqueId)}`,
    { method: "GET" },
    true
  )
    .then((res) => {
      enterpriseDetailCache.set(uniqueId, res);
      return res;
    })
    .finally(() => {
      enterpriseDetailInFlight.delete(uniqueId);
    });

  enterpriseDetailInFlight.set(uniqueId, request);
  return request;
}

export default function EnterpriseDetailPage() {
  const params = useParams<{ uniqueId: string }>();
  const uniqueId = decodeURIComponent(params?.uniqueId || "");

  const [data, setData] = useState<EnterpriseDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [visibleLoans, setVisibleLoans] = useState(LOAN_PAGE_SIZE);
  const requestVersion = useRef(0);

  const loadDetail = useCallback(async (forceRefresh = false) => {
    if (!uniqueId) return;

    const currentVersion = ++requestVersion.current;

    const cached = !forceRefresh ? enterpriseDetailCache.get(uniqueId) : null;
    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      setApiError(null);
      const res = await fetchEnterpriseDetail(uniqueId, forceRefresh);
      if (currentVersion !== requestVersion.current) return;
      setData(res);
    } catch (e: any) {
      if (currentVersion !== requestVersion.current) return;
      setApiError(e?.message ?? "Failed to load enterprise profile detail.");
    } finally {
      if (currentVersion !== requestVersion.current) return;
      setLoading(false);
    }
  }, [uniqueId]);

  useEffect(() => {
    loadDetail();
    return () => {
      requestVersion.current += 1;
    };
  }, [uniqueId, loadDetail]);

  useEffect(() => {
    setVisibleLoans(LOAN_PAGE_SIZE);
  }, [uniqueId, data?.related_loans.length]);

  const enterprise = data?.enterprise;
  const context = data?.portfolio_context;
  const riskTier = normalizeRiskTier(enterprise?.risk_tier_3m);

  const forecastNarrative = useMemo(() => {
    if (!enterprise) return "";
    const netJobs = enterprise.jobs_created_3m - enterprise.jobs_lost_3m;
    const riskPct = Math.round(enterprise.risk_score_3m * 100);
    if (netJobs < 0) {
      return `Model outlook flags pressure: risk at ${riskPct}% with net ${netJobs} jobs over 3 months.`;
    }
    if (netJobs === 0) {
      return `Model outlook is neutral: risk at ${riskPct}% with flat employment over 3 months.`;
    }
    return `Model outlook is positive: risk at ${riskPct}% with net +${netJobs} jobs over 3 months.`;
  }, [enterprise]);

  const aiInsights = useMemo<AiInsight[]>(() => {
    if (!data || !enterprise || !context) {
      return [
        {
          id: "profile-loading",
          title: "Profile intelligence",
          narrative: "AI insights will appear once profile and loan context are available.",
          confidence: 40,
          tone: "neutral",
        },
      ];
    }

    const insightCards: AiInsight[] = data.insights.slice(0, 3).map((item, idx) => ({
      id: `profile-insight-${idx}`,
      title: item.title,
      narrative: item.detail,
      confidence: clampConfidence(item.confidence * 100),
      tone: item.severity === "high" ? "danger" : item.severity === "medium" ? "warning" : "success",
      evidence: [
        `Risk score: ${(enterprise.risk_score_3m * 100).toFixed(1)}%`,
        `High arrears loans: ${context.high_arrears_count}`,
      ],
      actions: [data.actions[0]?.action || "Review suggested action plan."],
    }));

    return insightCards;
  }, [data, enterprise, context]);

  const aiContext = useMemo(
    () => ({
      uniqueId,
      enterprise,
      portfolioContext: context,
      topRelatedLoans: data?.related_loans?.slice(0, 80) || [],
      insights: data?.insights || [],
      actions: data?.actions || [],
    }),
    [uniqueId, enterprise, context, data?.related_loans, data?.insights, data?.actions]
  );

  const liveAi = useLiveAiInsights({
    scopeType: "profile",
    scopeId: uniqueId || null,
    context: aiContext,
    fallbackInsights: aiInsights,
    enabled: Boolean(uniqueId),
  });

  return (
    <RequireRole allow={["Admin", "Program Manager", "Advisor"]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/profiles"
            className="inline-flex items-center gap-2 rounded-xl border border-inkomoko-border bg-white px-3 py-2 text-sm font-medium text-inkomoko-text transition hover:bg-inkomoko-bg"
          >
            <ArrowLeft size={16} />
            Back to Profiles
          </Link>
        </div>

        {loading && (
          <section className="rounded-2xl border border-inkomoko-border bg-white p-10 text-center shadow-card">
            <p className="text-sm text-inkomoko-muted">Loading enterprise intelligence...</p>
          </section>
        )}

        {apiError && (
          <ErrorCard
            title="Failed to load enterprise detail"
            message={apiError}
            variant="error"
            onDismiss={() => setApiError(null)}
            onRetry={() => loadDetail(true)}
          />
        )}

        {!loading && !apiError && data && enterprise && context && (
          <>
            <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-inkomoko-blue via-[#1567ab] to-[#0b395f] p-8 text-white shadow-xl">
              <div className="pointer-events-none absolute -top-16 -right-16 h-52 w-52 rounded-full bg-white/10 blur-sm" />
              <div className="pointer-events-none absolute -bottom-14 left-1/3 h-44 w-44 rounded-full bg-cyan-200/10 blur-sm" />

              <div className="relative z-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-blue-200">Enterprise Intelligence Profile</p>
                  <h1 className="mt-2 text-4xl font-bold tracking-tight">{enterprise.unique_id}</h1>
                  <p className="mt-2 max-w-2xl text-sm text-blue-100">
                    {forecastNarrative}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Badge tone={riskTone(riskTier)}>{riskTier} risk</Badge>
                    <Badge tone="blue">{enterprise.country_specific || enterprise.country_code || "Unknown"}</Badge>
                    <Badge tone="neutral">{enterprise.business_sector || "Unknown sector"}</Badge>
                    {enterprise.survey_date && <Badge tone="orange">Survey {enterprise.survey_date}</Badge>}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <BrainCircuit size={16} />
                    RAG Agent Pulse
                  </div>
                  <p className="text-xs leading-relaxed text-blue-100">
                    Generated from profile predictions plus nearest loan context for advisor-ready decision support.
                  </p>
                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between rounded-lg bg-white/10 px-3 py-2">
                      <span>Confidence Blend</span>
                      <span className="font-semibold">{confidenceBlend(data.insights)}%</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-white/10 px-3 py-2">
                      <span>Linked Loans</span>
                      <span className="font-semibold">{context.loan_count}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-white/10 px-3 py-2">
                      <span>Net Jobs (3M)</span>
                      <span className="font-semibold">{formatSigned(context.net_jobs_3m)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <InsightPanel
              title="AI Insights"
              subtitle="Entity-level narrative generated from profile metrics and related loan context."
              status={liveAi.status}
              lastUpdated={liveAi.lastUpdated}
              insights={liveAi.insights}
            />

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <KpiTile icon={<ShieldAlert size={16} />} label="Risk Score" value={`${Math.round(enterprise.risk_score_3m * 100)}%`} />
              <KpiTile icon={<DollarSign size={16} />} label="Revenue (3M)" value={formatMoney(enterprise.revenue_3m)} />
              <KpiTile icon={<Users size={16} />} label="Jobs Created (3M)" value={String(enterprise.jobs_created_3m)} />
              <KpiTile icon={<Briefcase size={16} />} label="Jobs Lost (3M)" value={String(enterprise.jobs_lost_3m)} />
              <KpiTile icon={<Gauge size={16} />} label="Net Jobs (3M)" value={formatSigned(context.net_jobs_3m)} />
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="rounded-2xl border border-inkomoko-border bg-white p-5 shadow-card xl:col-span-2">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-inkomoko-text">Loan Context Snapshot</h2>
                  <span className="text-xs text-inkomoko-muted">Top exposures by arrears</span>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <ContextMetric label="Loans linked" value={String(context.loan_count)} />
                  <ContextMetric label="High arrears" value={String(context.high_arrears_count)} />
                  <ContextMetric label="Avg arrears days" value={String(Math.round(context.avg_arrears_days))} />
                  <ContextMetric label="Outstanding" value={formatMoney(context.total_outstanding)} />
                </div>

                <div className="overflow-x-auto rounded-xl border border-inkomoko-border">
                  <table className="w-full text-sm">
                    <thead className="bg-inkomoko-bg text-xs text-inkomoko-muted">
                      <tr>
                        <th className="px-3 py-2 text-left">Loan #</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-left">Sector</th>
                        <th className="px-3 py-2 text-right">Outstanding</th>
                        <th className="px-3 py-2 text-right">Days Arrears</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.related_loans.slice(0, visibleLoans).map((loan) => (
                        <tr key={loan.loannumber} className="border-t border-inkomoko-border/70">
                          <td className="px-3 py-2 font-medium text-inkomoko-text">{loan.loannumber}</td>
                          <td className="px-3 py-2 text-inkomoko-muted">{loan.loanstatus || "Unknown"}</td>
                          <td className="px-3 py-2 text-inkomoko-muted">{loan.industrysectorofactivity || "Unknown"}</td>
                          <td className="px-3 py-2 text-right text-inkomoko-text">{formatMoney(loan.currentbalance)}</td>
                          <td className="px-3 py-2 text-right">
                            <span className={loan.daysinarrears > 30 ? "font-semibold text-red-600" : "text-inkomoko-text"}>
                              {loan.daysinarrears}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {data.related_loans.length === 0 && (
                        <tr>
                          <td className="px-3 py-4 text-center text-sm text-inkomoko-muted" colSpan={5}>
                            No related loan records found for this profile context.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {data.related_loans.length > visibleLoans && (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-inkomoko-muted">
                      Showing {visibleLoans.toLocaleString()} of {data.related_loans.length.toLocaleString()} linked loans
                    </p>
                    <button
                      type="button"
                      onClick={() => setVisibleLoans((prev) => Math.min(prev + LOAN_PAGE_SIZE, data.related_loans.length))}
                      className="rounded-lg border border-inkomoko-border bg-inkomoko-bg px-3 py-1.5 text-xs font-semibold text-inkomoko-text transition hover:bg-white"
                    >
                      Load more loans
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-inkomoko-border bg-white p-5 shadow-card">
                <h2 className="mb-4 text-base font-semibold text-inkomoko-text">Profile Facts</h2>
                <div className="space-y-2">
                  <FactRow icon={<Building2 size={14} />} label="Country" value={enterprise.country_specific || enterprise.country_code || "Unknown"} />
                  <FactRow icon={<TrendingUp size={14} />} label="Business Sector" value={enterprise.business_sector || "Unknown"} />
                  <FactRow icon={<Calendar size={14} />} label="Survey Date" value={enterprise.survey_date || "Unknown"} />
                  <FactRow icon={<ShieldAlert size={14} />} label="Risk Tier" value={riskTier} />
                </div>
                <div className="mt-4 rounded-xl bg-inkomoko-bg p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-inkomoko-muted">Risk Intensity</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className={riskBarClass(riskTier)}
                      style={{ width: `${Math.max(4, Math.round(enterprise.risk_score_3m * 100))}%` }}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-inkomoko-border bg-white p-5 shadow-card">
                <div className="mb-4 flex items-center gap-2">
                  <Sparkles size={16} className="text-inkomoko-blue" />
                  <h2 className="text-base font-semibold text-inkomoko-text">RAG Agent Intelligent Insights</h2>
                </div>
                <div className="space-y-3">
                  {data.insights.map((insight, idx) => (
                    <div key={`${insight.type}-${idx}`} className="rounded-xl border border-inkomoko-border bg-inkomoko-bg/60 p-3">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-inkomoko-text">{insight.title}</p>
                        <span className={severityPillClass(insight.severity)}>{insight.severity.toUpperCase()}</span>
                      </div>
                      <p className="text-sm text-inkomoko-muted">{insight.detail}</p>
                      <p className="mt-2 text-xs text-inkomoko-muted">Confidence {Math.round(insight.confidence * 100)}%</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-inkomoko-border bg-white p-5 shadow-card">
                <div className="mb-4 flex items-center gap-2">
                  <CircleAlert size={16} className="text-inkomoko-blue" />
                  <h2 className="text-base font-semibold text-inkomoko-text">Recommended Actions</h2>
                </div>
                <div className="space-y-3">
                  {data.actions.map((action, idx) => (
                    <div key={`${action.priority}-${idx}`} className="rounded-xl border border-inkomoko-border bg-white p-3">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="rounded-full bg-inkomoko-blue/10 px-2 py-1 text-xs font-semibold text-inkomoko-blue">
                          {action.priority}
                        </span>
                        <span className="text-xs text-inkomoko-muted">Target {action.target_days} days</span>
                      </div>
                      <p className="text-sm font-medium text-inkomoko-text">{action.action}</p>
                      <p className="mt-1 text-xs text-inkomoko-muted">Owner: {action.owner}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </RequireRole>
  );
}

function KpiTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-inkomoko-border bg-white p-4 shadow-card">
      <div className="mb-2 flex items-center gap-2 text-xs text-inkomoko-muted">
        {icon}
        {label}
      </div>
      <div className="text-lg font-semibold text-inkomoko-text">{value}</div>
    </div>
  );
}

function ContextMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-inkomoko-border bg-white px-3 py-2">
      <p className="text-xs text-inkomoko-muted">{label}</p>
      <p className="text-sm font-semibold text-inkomoko-text">{value}</p>
    </div>
  );
}

function FactRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-inkomoko-bg px-3 py-2">
      <span className="flex items-center gap-1.5 text-xs text-inkomoko-muted">
        {icon}
        {label}
      </span>
      <span className="text-sm font-medium text-inkomoko-text">{value}</span>
    </div>
  );
}

function normalizeRiskTier(raw: string | null | undefined): "Low" | "Medium" | "High" {
  const tier = (raw || "").toUpperCase();
  if (tier === "HIGH") return "High";
  if (tier === "MEDIUM") return "Medium";
  return "Low";
}

function riskTone(riskTier: "Low" | "Medium" | "High") {
  if (riskTier === "High") return "danger";
  if (riskTier === "Medium") return "warning";
  return "success";
}

function riskBarClass(riskTier: "Low" | "Medium" | "High") {
  if (riskTier === "High") return "h-full bg-rose-500";
  if (riskTier === "Medium") return "h-full bg-amber-500";
  return "h-full bg-emerald-500";
}

function severityPillClass(severity: string) {
  const s = severity.toLowerCase();
  if (s === "high") return "rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700";
  if (s === "medium") return "rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700";
  return "rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700";
}

function confidenceBlend(items: EnterpriseInsight[]) {
  if (!items.length) return 0;
  const avg = items.reduce((acc, i) => acc + i.confidence, 0) / items.length;
  return Math.round(avg * 100);
}

function formatMoney(amount: number) {
  return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatSigned(value: number) {
  if (value > 0) return `+${value}`;
  return String(value);
}
