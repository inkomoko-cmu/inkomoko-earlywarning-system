"use client";

import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { RequireRole } from "@/components/auth/RequireRole";
import { Badge } from "@/components/ui/Badge";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { InsightPanel } from "@/components/ui/InsightPanel";
import { apiFetch } from "@/lib/api";
import { type AiInsight, clampConfidence } from "@/lib/insights";
import { useLiveAiInsights } from "@/lib/useLiveAiInsights";
import { Building2, Briefcase, DollarSign, Search, ShieldAlert, TrendingUp, Users } from "lucide-react";

type RiskFilter = "All" | "High" | "Medium" | "Low";

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

const PROFILE_PAGE_SIZE = 60;

export default function EnterpriseProfilesPage() {
  const [rows, setRows] = useState<EnterpriseProfile[]>([]);
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState<string>("All");
  const [risk, setRisk] = useState<RiskFilter>("All");
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PROFILE_PAGE_SIZE);
  const deferredSearch = useDeferredValue(search);

  const loadProfiles = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setApiError(null);
      const res = await apiFetch<EnterpriseProfile[]>(
        "/portfolio/enterprises",
        { method: "GET" },
        true,
        { cacheTtlMs: 120000, forceRefresh }
      );
      setRows(res);
    } catch (e: any) {
      setApiError(e?.message ?? "Failed to load enterprise profiles.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const countries = useMemo(() => {
    const items = Array.from(
      new Set(rows.map((enterprise) => enterprise.country_specific || enterprise.country_code).filter(Boolean) as string[])
    ).sort();
    return ["All", ...items];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();

    return rows.filter((enterprise) => {
      const riskTier = normalizeRiskTier(enterprise.risk_tier_3m);
      const enterpriseCountry = enterprise.country_specific || enterprise.country_code || "Unknown";

      if (country !== "All" && enterpriseCountry !== country) return false;
      if (risk !== "All" && riskTier !== risk) return false;

      if (q.length) {
        const haystack = [
          enterprise.unique_id,
          enterprise.business_sector || "",
          enterprise.business_sub_sector || "",
          enterpriseCountry,
          riskTier,
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [rows, country, risk, deferredSearch]);

  useEffect(() => {
    setVisibleCount(PROFILE_PAGE_SIZE);
  }, [country, risk, deferredSearch, rows.length]);

  const visibleProfiles = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const summary = useMemo(() => {
    const totalRevenue = filtered.reduce((acc, enterprise) => acc + enterprise.revenue_3m, 0);
    const totalJobsCreated = filtered.reduce((acc, enterprise) => acc + enterprise.jobs_created_3m, 0);
    const totalJobsLost = filtered.reduce((acc, enterprise) => acc + enterprise.jobs_lost_3m, 0);

    return {
      count: filtered.length,
      totalRevenue,
      totalJobsCreated,
      totalJobsLost,
    };
  }, [filtered]);

  const aiInsights = useMemo<AiInsight[]>(() => {
    const highRisk = filtered.filter((enterprise) => normalizeRiskTier(enterprise.risk_tier_3m) === "High").length;
    const netJobs = summary.totalJobsCreated - summary.totalJobsLost;
    const confidence = clampConfidence(50 + Math.min(35, filtered.length / 8));

    return [
      {
        id: "profiles-risk-mix",
        title: "Risk mix across visible enterprises",
        narrative: `${highRisk.toLocaleString()} high-risk profiles out of ${summary.count.toLocaleString()} currently visible enterprises.`,
        confidence,
        tone: highRisk > Math.max(5, summary.count * 0.3) ? "warning" : "success",
        evidence: [
          `Filtered profiles: ${summary.count.toLocaleString()}`,
          `High-risk count: ${highRisk.toLocaleString()}`,
        ],
        actions: ["Open high-risk profiles first for action planning."],
      },
      {
        id: "profiles-impact",
        title: "Projected impact snapshot",
        narrative: `Projected revenue is ${formatMoney(summary.totalRevenue)} with net jobs ${netJobs >= 0 ? "+" : ""}${netJobs.toLocaleString()} in the selected profile set.`,
        confidence: clampConfidence(55 + Math.min(20, countries.length * 4)),
        tone: netJobs < 0 ? "warning" : "success",
        evidence: [
          `Jobs created: ${summary.totalJobsCreated.toLocaleString()}`,
          `Jobs lost: ${summary.totalJobsLost.toLocaleString()}`,
        ],
        actions: ["Combine country and risk filters to isolate intervention cohorts."],
      },
      {
        id: "profiles-operating-note",
        title: "Advisor operating note",
        narrative: "Insight confidence improves with broader filtered coverage; narrow slices are directional and should be validated against enterprise detail context.",
        confidence: clampConfidence(45 + Math.min(35, summary.count / 5)),
        tone: "neutral",
        evidence: [`Countries in filter: ${countries.length - 1}`],
        actions: ["Use enterprise detail pages for decision-critical cases."],
      },
    ];
  }, [filtered, summary, countries.length]);

  const aiContext = useMemo(
    () => ({
      summary,
      filters: { country, risk, search: deferredSearch },
      visibleProfiles: visibleProfiles.slice(0, 120),
      totalFiltered: filtered.length,
      totalRows: rows.length,
    }),
    [summary, country, risk, deferredSearch, visibleProfiles, filtered.length, rows.length]
  );

  const liveAi = useLiveAiInsights({
    scopeType: "profiles",
    context: aiContext,
    fallbackInsights: aiInsights,
  });

  return (
    <RequireRole allow={["Admin", "Program Manager", "Advisor"]}>
      <div className="space-y-8">
        <section className="rounded-2xl bg-gradient-to-br from-inkomoko-blue via-inkomoko-blueSoft to-inkomoko-blue p-8 text-white">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-blue-300">Inkomoko Early Warning System</p>
          <h1 className="mb-2 text-3xl font-bold tracking-tight">Enterprise Profiles</h1>
          <p className="max-w-2xl text-sm text-blue-100">
            Profile-level view across the portfolio with projected risk, revenue, and employment outcomes for each enterprise.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryChip icon={<Building2 size={14} />} label="Profiles" value={summary.count.toLocaleString()} />
            <SummaryChip icon={<DollarSign size={14} />} label="Revenue (3M)" value={formatMoney(summary.totalRevenue)} />
            <SummaryChip icon={<Users size={14} />} label="Jobs Created (3M)" value={summary.totalJobsCreated.toLocaleString()} />
            <SummaryChip icon={<Briefcase size={14} />} label="Jobs Lost (3M)" value={summary.totalJobsLost.toLocaleString()} />
          </div>
        </section>

        {apiError && (
          <ErrorCard
            title="Failed to load enterprise profiles"
            message={apiError}
            variant="error"
            onDismiss={() => setApiError(null)}
            onRetry={() => loadProfiles(true)}
          />
        )}

        <InsightPanel
          title="AI Insights"
          subtitle="Narrative summaries generated from the currently filtered profile universe."
          status={liveAi.status}
          lastUpdated={liveAi.lastUpdated}
          insights={liveAi.insights}
        />

        <section className="rounded-2xl border border-inkomoko-border bg-white p-5 shadow-card">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-inkomoko-muted" size={16} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search unique ID, client ID, sector, country, risk..."
                className="w-full rounded-xl border border-inkomoko-border bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-inkomoko-blue/30 focus:ring-2"
              />
            </label>

            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="rounded-xl border border-inkomoko-border bg-white px-3 py-2.5 text-sm outline-none ring-inkomoko-blue/30 focus:ring-2"
            >
              {countries.map((countryItem) => (
                <option key={countryItem} value={countryItem}>
                  {countryItem}
                </option>
              ))}
            </select>

            <select
              value={risk}
              onChange={(e) => setRisk(e.target.value as RiskFilter)}
              className="rounded-xl border border-inkomoko-border bg-white px-3 py-2.5 text-sm outline-none ring-inkomoko-blue/30 focus:ring-2"
            >
              <option value="All">All risk tiers</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visibleProfiles.map((enterprise) => {
            const riskTier = normalizeRiskTier(enterprise.risk_tier_3m);
            const countryLabel = enterprise.country_specific || enterprise.country_code || "Unknown";
            const sectorLabel = enterprise.business_sector || "Unknown sector";
            const subSectorLabel = enterprise.business_sub_sector || "";
            return (
            <Link key={enterprise.unique_id} href={`/profiles/${encodeURIComponent(enterprise.unique_id)}`} className="group block">
            <article className="rounded-2xl border border-inkomoko-border bg-white p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-inkomoko-blue/40 hover:shadow-lg">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-inkomoko-muted">Enterprise Profile</p>
                  <h2 className="text-lg font-semibold text-inkomoko-text">{enterprise.unique_id}</h2>
                  <p className="text-sm text-inkomoko-muted">
                    {countryLabel} · {sectorLabel}{subSectorLabel ? ` · ${subSectorLabel}` : ""}
                  </p>
                </div>
                <Badge tone={riskTone(riskTier)}>{riskTier} risk</Badge>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
                <MetricBlock label="Country" value={countryLabel} icon={<Building2 size={15} />} />
                <MetricBlock label="Risk score" value={`${Math.round(enterprise.risk_score_3m * 100)}%`} icon={<ShieldAlert size={15} />} />
                <MetricBlock label="Revenue projection (3M)" value={formatMoney(enterprise.revenue_3m)} icon={<TrendingUp size={15} />} />
                <MetricBlock
                  label="Job projection (3M)"
                  value={`+${enterprise.jobs_created_3m} / -${enterprise.jobs_lost_3m}`}
                  icon={<Users size={15} />}
                />
              </div>

              <div className="mb-4">
                <div className="mb-1 flex items-center justify-between text-xs text-inkomoko-muted">
                  <span>Risk intensity</span>
                  <span>{Math.round(enterprise.risk_score_3m * 100)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-inkomoko-bg">
                  <div
                    className={riskBarClass(riskTier)}
                    style={{ width: `${Math.max(4, Math.round(enterprise.risk_score_3m * 100))}%` }}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-inkomoko-border bg-inkomoko-bg/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-inkomoko-muted">Recommended action</p>
                <p className="mt-1 text-sm text-inkomoko-text">{enterprise.plan_after_program || defaultAction(riskTier)}</p>
              </div>

              <div className="mt-4 text-sm font-semibold text-inkomoko-blue transition-colors group-hover:text-inkomoko-blueSoft">
                Open full profile &rarr;
              </div>
            </article>
            </Link>
          );})}
        </section>

        {!loading && filtered.length > 0 && (
          <section className="flex flex-col items-center gap-3 rounded-2xl border border-inkomoko-border bg-white p-4 text-center shadow-card">
            <p className="text-sm text-inkomoko-muted">
              Showing {visibleProfiles.length.toLocaleString()} of {filtered.length.toLocaleString()} enterprise profiles
            </p>
            {visibleProfiles.length < filtered.length && (
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => Math.min(prev + PROFILE_PAGE_SIZE, filtered.length))}
                className="rounded-xl border border-inkomoko-border bg-inkomoko-bg px-4 py-2 text-sm font-semibold text-inkomoko-text transition hover:bg-white"
              >
                Load more profiles
              </button>
            )}
          </section>
        )}

        {!loading && filtered.length === 0 && (
          <section className="rounded-2xl border border-dashed border-inkomoko-border bg-white p-10 text-center shadow-card">
            <p className="text-sm text-inkomoko-muted">No enterprises match your filters.</p>
          </section>
        )}

        {loading && (
          <section className="rounded-2xl border border-inkomoko-border bg-white p-10 text-center shadow-card">
            <p className="text-sm text-inkomoko-muted">Loading enterprise profiles...</p>
          </section>
        )}
      </div>
    </RequireRole>
  );
}

function SummaryChip({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm backdrop-blur-sm">
      <p className="mb-1 flex items-center gap-1 text-xs text-blue-100">
        {icon}
        {label}
      </p>
      <p className="font-semibold text-white">{value}</p>
    </div>
  );
}

function MetricBlock({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-inkomoko-border bg-inkomoko-bg/60 p-3">
      <p className="mb-1 flex items-center gap-1 text-xs text-inkomoko-muted">
        {icon}
        {label}
      </p>
      <p className="font-semibold text-inkomoko-text">{value}</p>
    </div>
  );
}

function formatMoney(amount: number) {
  return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
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

function defaultAction(riskTier: "Low" | "Medium" | "High") {
  if (riskTier === "High") return "Immediate coaching + weekly follow-up";
  if (riskTier === "Medium") return "Targeted mentoring + monthly check-in";
  return "Growth planning + market linkage support";
}