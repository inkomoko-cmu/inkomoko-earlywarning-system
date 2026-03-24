"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ScrollText, Download, RefreshCw, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Search, SlidersHorizontal,
  Server, Brain, Shield, AlertTriangle, Info, XCircle, Zap,
  Database, Activity, User, Clock, Trash2,
} from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { InsightPanel } from "@/components/ui/InsightPanel";
import { exportPDF } from "@/lib/export";
import { apiFetch } from "@/lib/api";
import { type AiInsight, clampConfidence } from "@/lib/insights";
import { useLiveAiInsights } from "@/lib/useLiveAiInsights";

// ── Types ──────────────────────────────────────────────────────────────────
type Source = "governance" | "backend" | "ml";
type Category = "data" | "prediction" | "model" | "advisory" | "system" | "auth";
type Severity = "info" | "warning" | "error" | "critical";

interface AuditEntry {
  id: string | number;
  timestamp: string;
  source: Source;
  action: string;
  category: Category | string;
  severity: Severity | string;
  actor: string;
  details: string;
  meta?: Record<string, unknown>;
}

interface AuditResponse {
  total: number;
  events: AuditEntry[];
  category_counts: Record<string, number>;
  severity_counts: Record<string, number>;
  source_counts: Record<string, number>;
  ml_available: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────
const PAGE_SIZE = 20;

const SOURCE_CONFIG: Record<Source, { label: string; icon: React.ReactNode; color: string; bg: string; border: string }> = {
  governance: { label: "Governance", icon: <Shield size={13} />, color: "text-[#3B82F6]", bg: "bg-[#EFF6FF]", border: "border-[#BFDBFE]" },
  backend:    { label: "Backend API", icon: <Server size={13} />,  color: "text-[#7C3AED]", bg: "bg-[#F5F3FF]", border: "border-[#DDD6FE]" },
  ml:         { label: "ML Service", icon: <Brain size={13} />,   color: "text-[#059669]", bg: "bg-[#ECFDF5]", border: "border-[#A7F3D0]" },
};

const SEV_CONFIG: Record<string, { tone: "success" | "warning" | "danger" | "neutral"; icon: React.ReactNode; dot: string }> = {
  info:     { tone: "success", icon: <Info size={11} />,          dot: "bg-emerald-500" },
  warning:  { tone: "warning", icon: <AlertTriangle size={11} />, dot: "bg-amber-500" },
  error:    { tone: "danger",  icon: <XCircle size={11} />,       dot: "bg-red-600" },
  critical: { tone: "danger",  icon: <Zap size={11} />,           dot: "bg-purple-700" },
};

const CAT_CONFIG: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  data:       { bg: "bg-emerald-50",  text: "text-emerald-700",  icon: <Database size={11} /> },
  prediction: { bg: "bg-blue-50",     text: "text-blue-700",     icon: <Activity size={11} /> },
  model:      { bg: "bg-orange-50",   text: "text-orange-700",   icon: <Brain size={11} /> },
  advisory:   { bg: "bg-purple-50",   text: "text-purple-700",   icon: <ScrollText size={11} /> },
  system:     { bg: "bg-slate-100",   text: "text-slate-600",    icon: <Server size={11} /> },
  auth:       { bg: "bg-indigo-50",   text: "text-indigo-700",   icon: <Shield size={11} /> },
};

// ── KPI Card ──────────────────────────────────────────────────────────────
function KpiCard({ value, label, highlight, sub }: { value: number | string; label: string; highlight?: string; sub?: string }) {
  return (
    <div className={`rounded-2xl border bg-white p-4 text-center shadow-sm ${highlight ? `border-${highlight}-200` : "border-inkomoko-border"}`}>
      <div className={`text-2xl font-bold leading-tight ${highlight ? `text-${highlight}-600` : "text-inkomoko-text"}`}>{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-inkomoko-muted">{label}</div>
      {sub && <div className="mt-1 text-[11px] text-inkomoko-muted">{sub}</div>}
    </div>
  );
}

// ── Source Pill ───────────────────────────────────────────────────────────
function SourcePill({ source }: { source: Source }) {
  const cfg = SOURCE_CONFIG[source];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ── Severity Badge ────────────────────────────────────────────────────────
function SevBadge({ severity }: { severity: string }) {
  const cfg = SEV_CONFIG[severity] ?? SEV_CONFIG.info;
  return (
    <Badge tone={cfg.tone} className="gap-1 capitalize">
      {cfg.icon}{severity}
    </Badge>
  );
}

// ── Category Badge ─────────────────────────────────────────────────────────
function CatBadge({ category }: { category: string }) {
  const cfg = CAT_CONFIG[category] ?? CAT_CONFIG.system;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.icon}{category}
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────
export default function AuditPage() {
  const [liveEvents, setLiveEvents] = useState<AuditEntry[]>([]);
  const [mlAvailable, setMlAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [sourceFilter, setSourceFilter] = useState<Source | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const fetchLive = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AuditResponse>("/audit/logs?limit=1000");
      setLiveEvents(data?.events ?? []);
      setMlAvailable(data?.ml_available ?? false);
      setLastRefresh(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLive(); }, [fetchLive]);

  // Merge all sources
  const allEvents = useMemo<AuditEntry[]>(() => {
    const combined = [...liveEvents];
    // Sort newest-first
    return combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [liveEvents]);

  // Apply filters
  const filtered = useMemo(() => {
    let ev = allEvents;
    if (sourceFilter !== "all") ev = ev.filter(e => e.source === sourceFilter);
    if (categoryFilter !== "all") ev = ev.filter(e => e.category === categoryFilter);
    if (severityFilter !== "all") ev = ev.filter(e => e.severity === severityFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      ev = ev.filter(e =>
        [e.action, e.details, e.actor, e.category].join(" ").toLowerCase().includes(q)
      );
    }
    return ev;
  }, [allEvents, sourceFilter, categoryFilter, severityFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // KPI counts from all events
  const totalWarnings = allEvents.filter(e => ["warning", "error", "critical"].includes(e.severity)).length;
  const backendCount = liveEvents.filter(e => e.source === "backend").length;
  const mlCount = liveEvents.filter(e => e.source === "ml").length;
  const governanceCount = liveEvents.filter(e => e.source === "governance").length;
  const criticalErrors = allEvents.filter(e => e.severity === "critical" || e.severity === "error").length;

  const aiInsights = useMemo<AiInsight[]>(() => {
    const riskRatio = allEvents.length > 0 ? totalWarnings / allEvents.length : 0;
    return [
      {
        id: "audit-risk",
        title: "Control pressure",
        narrative: `${totalWarnings} of ${allEvents.length} events are warning-or-higher, with ${criticalErrors} errors/critical incidents requiring closer review.`,
        confidence: clampConfidence(58 + (1 - riskRatio) * 25),
        tone: criticalErrors > 0 ? "danger" : totalWarnings > 0 ? "warning" : "success",
        evidence: [
          `Warning+ ratio: ${(riskRatio * 100).toFixed(1)}%`,
          `Critical/Error count: ${criticalErrors}`,
        ],
        actions: ["Escalate recurring critical actions into a weekly governance checkpoint."],
      },
      {
        id: "audit-source-mix",
        title: "Source observability",
        narrative: `Event coverage currently spans Governance (${governanceCount}), Backend (${backendCount}), and ML (${mlAvailable ? mlCount : 0}).`,
        confidence: clampConfidence(mlAvailable ? 78 : 62),
        tone: mlAvailable ? "neutral" : "warning",
        evidence: [mlAvailable ? "ML telemetry online" : "ML telemetry offline"],
        actions: ["Maintain balanced telemetry to avoid blind spots in incident root-cause analysis."],
      },
      {
        id: "audit-filtered-view",
        title: "Current analytical view",
        narrative: `The active filters surface ${filtered.length} events across ${totalPages} page(s), focused for targeted forensic review.`,
        confidence: clampConfidence(70),
        tone: "neutral",
        actions: ["Export filtered evidence pack before governance and donor review sessions."],
      },
    ];
  }, [allEvents.length, backendCount, criticalErrors, filtered.length, governanceCount, mlAvailable, mlCount, totalPages, totalWarnings]);

  const aiContext = useMemo(
    () => ({
      summary: {
        allEvents: allEvents.length,
        totalWarnings,
        criticalErrors,
        backendCount,
        governanceCount,
        mlCount: mlAvailable ? mlCount : 0,
      },
      filters: {
        sourceFilter,
        categoryFilter,
        severityFilter,
        search,
      },
      filteredSample: filtered.slice(0, 200),
    }),
    [
      allEvents.length,
      totalWarnings,
      criticalErrors,
      backendCount,
      governanceCount,
      mlAvailable,
      mlCount,
      sourceFilter,
      categoryFilter,
      severityFilter,
      search,
      filtered,
    ]
  );

  const liveAi = useLiveAiInsights({
    scopeType: "audit",
    context: aiContext,
    fallbackInsights: aiInsights,
  });

  // Reset page on filter change
  useEffect(() => { setPage(0); }, [sourceFilter, categoryFilter, severityFilter, search]);

  const handleExport = () => {
    const rows = filtered.map(e => ({
      Timestamp: new Date(e.timestamp).toLocaleString(),
      Source: e.source,
      Action: e.action,
      Category: e.category,
      Severity: e.severity,
      Actor: e.actor,
      Details: e.details,
    }));
    exportPDF("Audit_Log", "System Audit Log", rows);
  };

  return (
    <RequireRole allow={["Admin"]}>
      <div className="space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-inkomoko-blue">
              <ScrollText size={22} /> Audit Log
            </h1>
            <p className="mt-1 text-sm text-inkomoko-muted">
              Full traceability trail — every action across governance, API, and ML pipelines.
            </p>
            {lastRefresh && (
              <p className="mt-0.5 text-xs text-inkomoko-muted flex items-center gap-1">
                <Clock size={11} /> Last refreshed: {lastRefresh.toLocaleTimeString()}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="gap-1.5 text-sm" onClick={fetchLive} disabled={loading}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
            <Button className="gap-1.5 text-sm" onClick={handleExport}>
              <Download size={14} /> Export PDF
            </Button>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard value={allEvents.length} label="Total Events" />
          <KpiCard value={governanceCount}  label="Governance"  sub="DB" />
          <KpiCard value={backendCount}       label="Backend API" sub="Live"     />
          <KpiCard
            value={mlAvailable ? mlCount : "—"}
            label="ML Service"
            sub={mlAvailable ? "Live" : "Offline"}
          />
          <KpiCard
            value={totalWarnings}
            label="Warnings+"
            highlight={totalWarnings > 0 ? "amber" : undefined}
          />
          <KpiCard
            value={allEvents.filter(e => e.severity === "error" || e.severity === "critical").length}
            label="Errors"
            highlight={allEvents.some(e => ["error","critical"].includes(e.severity)) ? "red" : undefined}
          />
        </div>

        {/* ── Source Tabs ── */}
        <div className="flex flex-wrap gap-2 border-b border-inkomoko-border pb-3">
          {(["all", "governance", "backend", "ml"] as const).map(src => {
            const active = sourceFilter === src;
            const cfg = src !== "all" ? SOURCE_CONFIG[src] : null;
            return (
              <button
                key={src}
                onClick={() => setSourceFilter(src)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-all
                  ${active
                    ? "border-inkomoko-blue bg-inkomoko-blue text-white shadow-sm"
                    : "border-inkomoko-border bg-white text-inkomoko-muted hover:border-inkomoko-blue hover:text-inkomoko-blue"
                  }`}
              >
                {cfg?.icon ?? <Activity size={13} />}
                {src === "all" ? "All Sources" : cfg!.label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none
                  ${active ? "bg-white/20 text-white" : "bg-inkomoko-bg text-inkomoko-muted"}`}>
                  {src === "all" ? allEvents.length
                    : src === "governance" ? governanceCount
                    : src === "backend" ? backendCount
                    : mlCount}
                </span>
              </button>
            );
          })}
          {!mlAvailable && (
            <span className="ml-auto self-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700">
              ML service offline — showing backend events only
            </span>
          )}
        </div>

        {/* ── Filters ── */}
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-inkomoko-border bg-white p-3 shadow-sm">
          <SlidersHorizontal size={16} className="mb-1.5 text-inkomoko-muted" />

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-inkomoko-muted">Category</label>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-inkomoko-border bg-inkomoko-bg px-2.5 py-1.5 text-sm text-inkomoko-text focus:outline-none focus:ring-2 focus:ring-inkomoko-blue/20"
            >
              <option value="all">All Categories</option>
              {["data","prediction","model","advisory","system","auth"].map(c => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-inkomoko-muted">Severity</label>
            <select
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value)}
              className="rounded-lg border border-inkomoko-border bg-inkomoko-bg px-2.5 py-1.5 text-sm text-inkomoko-text focus:outline-none focus:ring-2 focus:ring-inkomoko-blue/20"
            >
              <option value="all">All Severities</option>
              {["info","warning","error","critical"].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-inkomoko-muted">Search</label>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-inkomoko-muted" />
              <input
                type="text"
                placeholder="Search actions, actors, details…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-lg border border-inkomoko-border bg-inkomoko-bg py-1.5 pl-8 pr-3 text-sm text-inkomoko-text placeholder:text-inkomoko-muted focus:outline-none focus:ring-2 focus:ring-inkomoko-blue/20"
              />
            </div>
          </div>

          <div className="ml-auto self-end text-xs text-inkomoko-muted whitespace-nowrap pb-1.5">
            {filtered.length} event{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* ── Error Banner ── */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <XCircle size={16} /> {error}
          </div>
        )}

        <InsightPanel
          title="AI Insights"
          subtitle="Narrative interpretation of current audit activity and control signals."
          status={liveAi.status}
          lastUpdated={liveAi.lastUpdated}
          insights={liveAi.insights}
        />

        {/* ── Table ── */}
        <div className="rounded-2xl border border-inkomoko-border bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-sm">
              <thead>
                <tr className="border-b border-inkomoko-border bg-inkomoko-bg">
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-inkomoko-muted w-[140px]">Timestamp</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-inkomoko-muted w-[110px]">Source</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-inkomoko-muted">Action</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-inkomoko-muted w-[100px]">Category</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-inkomoko-muted w-[90px]">Severity</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-inkomoko-muted w-[140px]">Actor</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-inkomoko-muted">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-inkomoko-border">
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-inkomoko-muted">
                        <ScrollText size={36} className="opacity-30" />
                        <p className="text-sm">No audit events match the current filters.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginated.map((e, i) => (
                    <tr
                      key={`${e.source}-${e.id}-${i}`}
                      className={`transition-colors hover:bg-inkomoko-bg/60 ${
                        e.severity === "critical" ? "bg-purple-50/30" :
                        e.severity === "error"    ? "bg-red-50/30"    :
                        e.severity === "warning"  ? "bg-amber-50/20"  : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-[11px] text-inkomoko-muted whitespace-nowrap">
                        {new Date(e.timestamp).toLocaleString(undefined, {
                          month: "short", day: "2-digit",
                          hour: "2-digit", minute: "2-digit", second: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3"><SourcePill source={e.source as Source} /></td>
                      <td className="px-4 py-3 font-semibold text-inkomoko-text">{e.action}</td>
                      <td className="px-4 py-3"><CatBadge category={e.category} /></td>
                      <td className="px-4 py-3"><SevBadge severity={e.severity} /></td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-inkomoko-text">
                          <User size={11} className="shrink-0 text-inkomoko-muted" />{e.actor}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-inkomoko-muted max-w-xs truncate" title={e.details}>
                        {e.details || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 border-t border-inkomoko-border bg-inkomoko-bg px-4 py-2.5">
              <span className="text-xs text-inkomoko-muted">
                Page {page + 1} of {totalPages} &mdash; {filtered.length} events
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(0)} disabled={page === 0}
                  className="rounded-lg border border-inkomoko-border bg-white p-1.5 text-inkomoko-muted hover:border-inkomoko-blue hover:text-inkomoko-blue disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronsLeft size={14} />
                </button>
                <button onClick={() => setPage(p => p - 1)} disabled={page === 0}
                  className="rounded-lg border border-inkomoko-border bg-white p-1.5 text-inkomoko-muted hover:border-inkomoko-blue hover:text-inkomoko-blue disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  const offset = Math.max(0, Math.min(page - 3, totalPages - 7));
                  const p = i + offset;
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      className={`min-w-[30px] rounded-lg border px-2 py-1 text-xs font-medium transition-colors
                        ${p === page
                          ? "border-inkomoko-blue bg-inkomoko-blue text-white"
                          : "border-inkomoko-border bg-white text-inkomoko-muted hover:border-inkomoko-blue hover:text-inkomoko-blue"}`}>
                      {p + 1}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}
                  className="rounded-lg border border-inkomoko-border bg-white p-1.5 text-inkomoko-muted hover:border-inkomoko-blue hover:text-inkomoko-blue disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronRight size={14} />
                </button>
                <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}
                  className="rounded-lg border border-inkomoko-border bg-white p-1.5 text-inkomoko-muted hover:border-inkomoko-blue hover:text-inkomoko-blue disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronsRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Policy Note ── */}
        <div className="rounded-2xl border border-inkomoko-border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-inkomoko-text">
            <Shield size={15} className="text-inkomoko-blue" /> Audit Policy
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-inkomoko-muted">
            All system events are logged with actor identity, timestamp, and outcome. Governance
            actions are evaluated against role-based policies and consent flags. Backend API events
            include auth, data ingestion, and prediction runs. ML pipeline events cover model
            training, inference, and data quality checks. Logs are retained in-memory and can be
            exported for donor transparency and compliance review.
          </p>
        </div>

      </div>
    </RequireRole>
  );
}

