"use client";

import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { InsightPanel } from "@/components/ui/InsightPanel";
import { exportPDF } from "@/lib/export";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { type AiInsight, clampConfidence } from "@/lib/insights";
import { useLiveAiInsights } from "@/lib/useLiveAiInsights";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Gauge,
  Zap,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  DollarSign,
  AlertTriangle,
  Briefcase,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  Trash2,
  Download,
  BarChart3,
} from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";
import {
  buildTrajectorySeries,
  compareScenarioRuns,
  deleteAllScenarioRuns,
  deleteScenarioRun,
  DEFAULT_SCENARIO_TARGET_KEYS,
  getRunEnterpriseImpacts,
  getRunResults,
  getSensitivityFromParams,
  isSuccessfulRun,
  listScenarioRuns,
  listScenarios,
  runScenario,
  summarizeRunResults,
  TRAJECTORY_HORIZONS,
  type ScenarioSummary,
  type TrajectoryHorizon,
} from "@/lib/scenarios";
import {
  type ApiScenario,
  type RiskDistribution,
  type SimulationComparisonResponse,
  type SimulationEnterpriseImpactItem,
  type SimulationResultResponse,
  type SimulationRunListItem,
} from "@/lib/types";

/* --- helpers ------------------------------------------------- */

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function pctChange(base: number, target: number): number {
  if (base === 0) return target === 0 ? 0 : 100;
  return ((target - base) / Math.abs(base)) * 100;
}

function fmtCurrency(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toLocaleString()}`;
}

function fmtNum(v: number): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function severityColor(pct: number): string {
  if (pct <= 10) return "bg-green-500";
  if (pct <= 30) return "bg-yellow-500";
  if (pct <= 60) return "bg-orange-500";
  return "bg-red-500";
}

function severityTone(pct: number): "success" | "warning" | "orange" | "danger" {
  if (pct <= 10) return "success";
  if (pct <= 30) return "warning";
  if (pct <= 60) return "orange";
  return "danger";
}

const PIE_COLORS: Record<string, string> = {
  LOW: "#16A34A",
  MEDIUM: "#F59E0B",
  HIGH: "#DC2626",
};

/* --- skeleton components ------------------------------------- */

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`rounded-xl bg-inkomoko-border/40 animate-skeleton ${className}`} />;
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-inkomoko-border bg-white p-5 space-y-3">
      <SkeletonBlock className="h-3 w-24" />
      <SkeletonBlock className="h-8 w-32" />
      <SkeletonBlock className="h-2 w-20" />
    </div>
  );
}

function SkeletonChart() {
  return (
    <Card className="h-[380px]">
      <CardHeader>
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="h-3 w-60 mt-1" />
      </CardHeader>
      <CardContent className="h-[280px] flex items-center justify-center">
        <SkeletonBlock className="h-full w-full" />
      </CardContent>
    </Card>
  );
}

function SkeletonTable() {
  return (
    <Card>
      <CardHeader>
        <SkeletonBlock className="h-4 w-48" />
        <SkeletonBlock className="h-3 w-64 mt-1" />
      </CardHeader>
      <CardContent className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-8 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

/* --- custom chart tooltip ------------------------------------ */

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-inkomoko-border bg-white p-3 shadow-card text-xs">
      <div className="font-semibold text-inkomoko-text mb-1">{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-inkomoko-muted capitalize">{entry.name}:</span>
          <span className="font-medium">{entry.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

/* --- main page ----------------------------------------------- */

export default function ScenariosPage() {
  const [idx, setIdx] = useState(0);
  const [runNonce, setRunNonce] = useState(0);
  const [scenarios, setScenarios] = useState<ApiScenario[]>([]);
  const [runResults, setRunResults] = useState<SimulationResultResponse | null>(null);
  const [horizonResults, setHorizonResults] = useState<
    Partial<Record<TrajectoryHorizon, SimulationResultResponse>>
  >({});
  const [horizonRunIds, setHorizonRunIds] = useState<
    Partial<Record<TrajectoryHorizon, string>>
  >({});
  const [runHistory, setRunHistory] = useState<SimulationRunListItem[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [trajectoryMetric, setTrajectoryMetric] = useState<
    "revenue" | "risk" | "jobs"
  >("revenue");
  const [enterpriseImpacts, setEnterpriseImpacts] = useState<
    SimulationEnterpriseImpactItem[]
  >([]);
  const [comparison, setComparison] =
    useState<SimulationComparisonResponse | null>(null);
  const [loadingScenarios, setLoadingScenarios] = useState(true);
  const [loadingRun, setLoadingRun] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingImpacts, setLoadingImpacts] = useState(false);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const [deletingAllRuns, setDeletingAllRuns] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [impactSort, setImpactSort] = useState<{
    key: "revenue" | "jobs" | "risk";
    dir: "asc" | "desc";
  }>({ key: "revenue", dir: "desc" });
  const [scenarioTypeFilter, setScenarioTypeFilter] = useState<
    "all" | "downside" | "upside"
  >("all");

  const filteredScenarios = useMemo(
    () =>
      scenarioTypeFilter === "all"
        ? scenarios
        : scenarios.filter((s) => s.scenario_type === scenarioTypeFilter),
    [scenarios, scenarioTypeFilter],
  );

  const selectedScenario = filteredScenarios[idx] ?? null;
  const isUpside = selectedScenario?.scenario_type === "upside";

  /* --- per-scenario result cache ----------------------------- */

  type ScenarioCache = {
    runResults: SimulationResultResponse | null;
    horizonResults: Partial<Record<TrajectoryHorizon, SimulationResultResponse>>;
    horizonRunIds: Partial<Record<TrajectoryHorizon, string>>;
    runHistory: SimulationRunListItem[];
    selectedRunId: string | null;
    enterpriseImpacts: SimulationEnterpriseImpactItem[];
    comparison: SimulationComparisonResponse | null;
  };
  const cacheRef = useRef<Map<string, ScenarioCache>>(new Map());

  /** Save current state into the cache for the given scenario. */
  const saveToCache = useCallback(
    (scenarioId: string, patch?: Partial<ScenarioCache>) => {
      cacheRef.current.set(scenarioId, {
        runResults: patch?.runResults ?? runResults,
        horizonResults: patch?.horizonResults ?? horizonResults,
        horizonRunIds: patch?.horizonRunIds ?? horizonRunIds,
        runHistory: patch?.runHistory ?? runHistory,
        selectedRunId: patch?.selectedRunId ?? selectedRunId,
        enterpriseImpacts: patch?.enterpriseImpacts ?? enterpriseImpacts,
        comparison: patch?.comparison ?? comparison,
      });
    },
    [runResults, horizonResults, horizonRunIds, runHistory, selectedRunId, enterpriseImpacts, comparison],
  );

  /** Restore cached state for a scenario. Returns true if cache hit. */
  const restoreFromCache = useCallback((scenarioId: string): boolean => {
    const cached = cacheRef.current.get(scenarioId);
    if (!cached || !cached.runResults) return false;
    setRunResults(cached.runResults);
    setHorizonResults(cached.horizonResults);
    setHorizonRunIds(cached.horizonRunIds);
    setRunHistory(cached.runHistory);
    setSelectedRunId(cached.selectedRunId);
    setEnterpriseImpacts(cached.enterpriseImpacts);
    setComparison(cached.comparison);
    cacheHitRef.current = true;
    return true;
  }, []);

  /** True for one render cycle after a cache restore — downstream effects skip. */
  const cacheHitRef = useRef(false);
  useEffect(() => {
    if (cacheHitRef.current) cacheHitRef.current = false;
  });

  /* --- data loading effects -------------------------------- */

  useEffect(() => {
    const load = async () => {
      try {
        setLoadingScenarios(true);
        setApiError(null);
        const rows = await listScenarios();
        setScenarios(Array.isArray(rows) ? rows : []);
        setIdx(0);
      } catch (err: unknown) {
        setApiError(getErrorMessage(err, "Failed to load scenarios."));
        setScenarios([]);
      } finally {
        setLoadingScenarios(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    setTrajectoryMetric("revenue");
  }, [selectedScenario?.scenario_id]);

  /* Track runNonce so we know "explicit re-run" vs "scenario switch" */
  const prevNonceRef = useRef(runNonce);

  useEffect(() => {
    let active = true;
    const isExplicitRerun = runNonce !== prevNonceRef.current;
    prevNonceRef.current = runNonce;

    const run = async () => {
      if (!selectedScenario) {
        if (active) {
          setRunResults(null);
          setHorizonResults({});
          setHorizonRunIds({});
          setRunHistory([]);
          setSelectedRunId(null);
          setEnterpriseImpacts([]);
          setComparison(null);
        }
        return;
      }

      /* Cache hit — restore instantly on scenario switch (not explicit re-run) */
      if (!isExplicitRerun && restoreFromCache(selectedScenario.scenario_id)) {
        return;
      }

      try {
        if (active) {
          setLoadingRun(true);
          setApiError(null);
        }
        const nextResults: Partial<
          Record<TrajectoryHorizon, SimulationResultResponse>
        > = {};
        const nextRunIds: Partial<Record<TrajectoryHorizon, string>> = {};
        let fallbackRun: SimulationResultResponse | null = null;
        let fallbackRunId: string | null = null;
        for (const horizon of TRAJECTORY_HORIZONS) {
          const r = await runScenario(selectedScenario.scenario_id, {
            horizon,
            target_keys: DEFAULT_SCENARIO_TARGET_KEYS,
            scope: {},
            notes: `UI simulation run for ${selectedScenario.scenario_name} (${horizon})`,
          });
          if (r.run_status !== "succeeded") continue;
          const details = await getRunResults(
            selectedScenario.scenario_id,
            r.sim_run_id,
            horizon,
          );
          nextResults[horizon] = details;
          nextRunIds[horizon] = r.sim_run_id;
          if (horizon === "3m") {
            fallbackRun = details;
            fallbackRunId = r.sim_run_id;
          }
        }
        if (active) {
          setHorizonResults(nextResults);
          setHorizonRunIds(nextRunIds);
          const firstH = TRAJECTORY_HORIZONS.find((h) => nextResults[h]);
          const firstRun = firstH ? (nextResults[firstH] ?? null) : null;
          const firstId = firstH ? (nextRunIds[firstH] ?? null) : null;
          const selRun = fallbackRun || firstRun;
          const selId = fallbackRunId || firstId;
          if (!selRun || !selId) {
            const history = await listScenarioRuns(
              selectedScenario.scenario_id,
              { limit: 25, offset: 0 },
            );
            const hist = history.runs.find(isSuccessfulRun);
            if (hist) {
              setSelectedRunId(hist.sim_run_id);
              setApiError(
                "Latest run did not return usable results. Showing most recent successful historical run.",
              );
            } else {
              setApiError(
                "Scenario simulation runs did not return usable results.",
              );
              setSelectedRunId(null);
            }
            return;
          }
          setRunResults(selRun);
          setSelectedRunId(selId);
          setApiError(null);
          /* Save to cache after successful run */
          saveToCache(selectedScenario.scenario_id, {
            runResults: selRun,
            horizonResults: nextResults,
            horizonRunIds: nextRunIds,
            selectedRunId: selId,
          });
        }
      } catch (err: unknown) {
        if (active)
          setApiError(
            getErrorMessage(err, "Failed to run scenario simulation."),
          );
      } finally {
        if (active) setLoadingRun(false);
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [selectedScenario?.scenario_id, runNonce]);

  useEffect(() => {
    if (cacheHitRef.current) return;
    let active = true;
    const load = async () => {
      if (!selectedScenario) return;
      try {
        if (active) setLoadingHistory(true);
        const history = await listScenarioRuns(
          selectedScenario.scenario_id,
          { limit: 25, offset: 0 },
        );
        if (!active) return;
        setRunHistory(history.runs);
        saveToCache(selectedScenario.scenario_id, { runHistory: history.runs });
        setSelectedRunId((prev) => {
          if (prev && history.runs.some((r) => r.sim_run_id === prev))
            return prev;
          const ok = history.runs.filter(isSuccessfulRun);
          if (
            runResults?.sim_run_id &&
            ok.some((r) => r.sim_run_id === runResults.sim_run_id)
          )
            return runResults.sim_run_id;
          if (ok.length > 0) return ok[0].sim_run_id;
          if (
            runResults?.sim_run_id &&
            history.runs.some((r) => r.sim_run_id === runResults.sim_run_id)
          )
            return runResults.sim_run_id;
          return history.runs[0]?.sim_run_id ?? null;
        });
      } catch {
        if (active) setRunHistory([]);
      } finally {
        if (active) setLoadingHistory(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [selectedScenario?.scenario_id, runResults?.sim_run_id]);

  useEffect(() => {
    if (cacheHitRef.current) return;
    let active = true;
    const load = async () => {
      if (!selectedScenario || !selectedRunId) return;
      try {
        const meta = runHistory.find((r) => r.sim_run_id === selectedRunId);
        const hg = (meta?.notes || "").match(/\((1m|3m|6m|12m)\)$/)?.[1] as
          | TrajectoryHorizon
          | undefined;
        const details = await getRunResults(
          selectedScenario.scenario_id,
          selectedRunId,
          hg,
        );
        if (active) {
          setRunResults(details);
          saveToCache(selectedScenario.scenario_id, { runResults: details });
          setApiError(null);
        }
      } catch {
        /* preserve previous */
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [selectedScenario?.scenario_id, selectedRunId, runHistory]);

  useEffect(() => {
    if (cacheHitRef.current) return;
    let active = true;
    const load = async () => {
      if (!selectedScenario || !selectedRunId) {
        if (active) setEnterpriseImpacts([]);
        return;
      }
      try {
        if (active) setLoadingImpacts(true);
        const res = await getRunEnterpriseImpacts(
          selectedScenario.scenario_id,
          selectedRunId,
          { limit: 25, offset: 0 },
        );
        if (active) {
          setEnterpriseImpacts(res.impacts);
          saveToCache(selectedScenario.scenario_id, { enterpriseImpacts: res.impacts });
        }
      } catch {
        if (active) setEnterpriseImpacts([]);
      } finally {
        if (active) setLoadingImpacts(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [selectedScenario?.scenario_id, selectedRunId]);

  useEffect(() => {
    if (cacheHitRef.current) return;
    let active = true;
    const load = async () => {
      if (
        !selectedScenario ||
        !selectedRunId ||
        runHistory.length < 2
      ) {
        if (active) setComparison(null);
        return;
      }
      const base = runHistory.find(
        (r) => r.sim_run_id !== selectedRunId && isSuccessfulRun(r),
      );
      if (!base) {
        if (active) setComparison(null);
        return;
      }
      try {
        if (active) setLoadingComparison(true);
        const cmp = await compareScenarioRuns(
          selectedScenario.scenario_id,
          base.sim_run_id,
          selectedRunId,
          12,
        );
        if (active) {
          setComparison(cmp);
          saveToCache(selectedScenario.scenario_id, { comparison: cmp });
        }
      } catch {
        if (active) setComparison(null);
      } finally {
        if (active) setLoadingComparison(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [selectedScenario?.scenario_id, selectedRunId, runHistory]);

  /* --- derived data ---------------------------------------- */

  const summary: ScenarioSummary = useMemo(() => {
    if (!runResults)
      return {
        baseHigh: 0,
        stressedHigh: 0,
        baseRevenue: 0,
        stressedRevenue: 0,
        baseJobsNet: 0,
        stressedJobsNet: 0,
        enterpriseCount: 0,
      };
    return summarizeRunResults(runResults.results, runResults.enterprise_count);
  }, [runResults]);

  const hasRunData = Boolean(runResults && runResults.result_count > 0);

  const trajectoryPoints = useMemo(
    () => buildTrajectorySeries(horizonResults, horizonRunIds),
    [horizonResults, horizonRunIds],
  );

  const chart = useMemo(() => {
    return trajectoryPoints.map((pt) => {
      if (trajectoryMetric === "risk")
        return {
          month: pt.label,
          Baseline: pt.baselineHighRisk,
          Scenario: pt.scenarioHighRisk,
        };
      if (trajectoryMetric === "jobs")
        return {
          month: pt.label,
          Baseline: pt.baselineJobsNet,
          Scenario: pt.scenarioJobsNet,
        };
      return {
        month: pt.label,
        Baseline: Math.round(pt.baselineRevenue / 1000),
        Scenario: Math.round(pt.scenarioRevenue / 1000),
      };
    });
  }, [trajectoryMetric, trajectoryPoints]);

  const sensitivity = useMemo(() => {
    if (!selectedScenario)
      return [
        { driver: "Inflation", impact: 0 },
        { driver: "FX", impact: 0 },
        { driver: "Funding", impact: 0 },
        { driver: "Conflict", impact: 0 },
      ];
    return getSensitivityFromParams(selectedScenario.parameters).sort(
      (a, b) => b.impact - a.impact,
    );
  }, [selectedScenario]);

  const riskDist: RiskDistribution | null =
    runResults?.risk_distribution ?? null;

  const riskPieData = useMemo(() => {
    if (!riskDist) return { baseline: [], scenario: [] };
    const toArr = (d: Record<string, number>) =>
      ["LOW", "MEDIUM", "HIGH"]
        .filter((k) => (d[k] ?? 0) > 0)
        .map((k) => ({ name: k, value: d[k] ?? 0 }));
    return {
      baseline: toArr(riskDist.baseline),
      scenario: toArr(riskDist.scenario),
    };
  }, [riskDist]);

  const sortedImpacts = useMemo(() => {
    const clone = [...enterpriseImpacts];
    const { key, dir } = impactSort;
    clone.sort((a, b) => {
      let va = 0,
        vb = 0;
      if (key === "revenue") {
        va = a.revenue_delta;
        vb = b.revenue_delta;
      } else if (key === "jobs") {
        va = a.jobs_net_delta;
        vb = b.jobs_net_delta;
      } else {
        const riskRank = (l: string | null) =>
          ({ HIGH: 3, MEDIUM: 2, LOW: 1 }[(l || "").toUpperCase()] ?? 0);
        va = riskRank(a.scenario_risk_label);
        vb = riskRank(b.scenario_risk_label);
      }
      return dir === "asc" ? va - vb : vb - va;
    });
    return clone;
  }, [enterpriseImpacts, impactSort]);

  /* --- posture severity ------------------------------------ */

  const maxShock = Math.max(...sensitivity.map((s) => s.impact), 0);
  const postureSeverity: "upside" | "low" | "moderate" | "elevated" | "critical" =
    isUpside
      ? "upside"
      : maxShock <= 10
        ? "low"
        : maxShock <= 30
          ? "moderate"
          : maxShock <= 60
            ? "elevated"
            : "critical";
  const postureConfig = {
    upside: {
      bg: "bg-emerald-50 border-emerald-200",
      text: "text-emerald-800",
      label: "Growth Opportunity",
      Icon: TrendingUp,
    },
    low: {
      bg: "bg-green-50 border-green-200",
      text: "text-green-800",
      label: "Low Risk",
      Icon: CheckCircle2,
    },
    moderate: {
      bg: "bg-yellow-50 border-yellow-200",
      text: "text-yellow-800",
      label: "Moderate Risk",
      Icon: AlertTriangle,
    },
    elevated: {
      bg: "bg-orange-50 border-orange-200",
      text: "text-orange-800",
      label: "Elevated Risk",
      Icon: AlertTriangle,
    },
    critical: {
      bg: "bg-red-50 border-red-200",
      text: "text-red-800",
      label: "Critical Risk",
      Icon: XCircle,
    },
  }[postureSeverity];

  /* --- KPI deltas ------------------------------------------ */

  const revDelta = pctChange(summary.baseRevenue, summary.stressedRevenue);
  const riskDelta = summary.stressedHigh - summary.baseHigh;
  const jobsDelta = pctChange(summary.baseJobsNet, summary.stressedJobsNet);

  /* --- AI insights ----------------------------------------- */

  const aiInsights = useMemo<AiInsight[]>(() => {
    const highestDriver = sensitivity[0];
    const revenueDeltaPct =
      summary.baseRevenue > 0
        ? ((summary.stressedRevenue - summary.baseRevenue) /
            summary.baseRevenue) *
          100
        : 0;
    const highRiskDelta = summary.stressedHigh - summary.baseHigh;
    const confidence = clampConfidence(
      52 + Math.min(25, summary.enterpriseCount / 10),
    );
    const scenarioName =
      selectedScenario?.scenario_name || "Selected scenario";
    return [
      {
        id: "scenario-dominant-driver",
        title: "Dominant stress driver",
        narrative: `${highestDriver?.driver || "Scenario"} is the strongest shock contributor at ${highestDriver?.impact || 0}% under ${scenarioName}.`,
        confidence,
        tone:
          (highestDriver?.impact || 0) >= 35 ? "warning" : "neutral",
        evidence: sensitivity
          .map((s) => `${s.driver}: ${s.impact}%`)
          .slice(0, 3),
        actions: [
          "Prioritize mitigation actions for the dominant driver first.",
        ],
      },
      {
        id: "scenario-risk-shift",
        title: "Risk migration outlook",
        narrative: `High-risk enterprises move from ${summary.baseHigh} to ${summary.stressedHigh} (${highRiskDelta >= 0 ? "+" : ""}${highRiskDelta}) in this simulation.`,
        confidence: clampConfidence(confidence + 5),
        tone: highRiskDelta > 0 ? "danger" : "success",
        evidence: [
          `Baseline high-risk: ${summary.baseHigh}`,
          `Scenario high-risk: ${summary.stressedHigh}`,
        ],
        actions: [
          "Allocate advisory capacity to the projected incremental high-risk group.",
        ],
      },
      {
        id: "scenario-revenue-impact",
        title: "Revenue impact",
        narrative: `Projected revenue shifts by ${revenueDeltaPct.toFixed(1)}% relative to baseline over the modeled horizon.`,
        confidence: clampConfidence(confidence + 3),
        tone: revenueDeltaPct < -10 ? "warning" : "success",
        evidence: [
          `Baseline revenue: $${summary.baseRevenue.toLocaleString()}`,
          `Scenario revenue: $${summary.stressedRevenue.toLocaleString()}`,
        ],
        actions: [
          "Use the sensitivity chart to sequence financial protection measures.",
        ],
      },
    ];
  }, [selectedScenario?.scenario_name, sensitivity, summary]);

  const aiContext = useMemo(
    () => ({
      scenario: selectedScenario,
      summary,
      sensitivity,
      trajectory: trajectoryPoints,
      runResults,
      enterpriseCount: summary.enterpriseCount,
    }),
    [selectedScenario, summary, sensitivity, trajectoryPoints, runResults],
  );

  const liveAi = useLiveAiInsights({
    scopeType: "scenarios",
    scopeId: selectedScenario?.scenario_id ?? null,
    context: aiContext,
    fallbackInsights: aiInsights,
    enabled: Boolean(selectedScenario),
  });

  /* --- actions --------------------------------------------- */

  const aiInsights = useMemo<AiInsight[]>(() => {
    const highestDriver = sensitivity.slice().sort((a, b) => b.impact - a.impact)[0];
    const revenueDeltaPct = summary.baseRevenue > 0
      ? ((summary.stressedRevenue - summary.baseRevenue) / summary.baseRevenue) * 100
      : 0;
    const highRiskDelta = summary.stressedHigh - summary.baseHigh;
    const confidence = clampConfidence(52 + Math.min(25, enterprises.length / 10));

    return [
      {
        id: "scenario-dominant-driver",
        title: "Dominant stress driver",
        narrative: `${highestDriver?.driver || "Scenario"} is the strongest shock contributor at ${highestDriver?.impact || 0}% under ${s.name}.`,
        confidence,
        tone: (highestDriver?.impact || 0) >= 35 ? "warning" : "neutral",
        evidence: sensitivity.map((item) => `${item.driver}: ${item.impact}%`).slice(0, 3),
        actions: ["Prioritize mitigation actions for the dominant driver first."],
      },
      {
        id: "scenario-risk-shift",
        title: "Risk migration outlook",
        narrative: `High-risk enterprises move from ${summary.baseHigh} to ${summary.stressedHigh} (${highRiskDelta >= 0 ? "+" : ""}${highRiskDelta}) in this simulation.`,
        confidence: clampConfidence(confidence + 5),
        tone: highRiskDelta > 0 ? "danger" : "success",
        evidence: [`Baseline high-risk: ${summary.baseHigh}`, `Scenario high-risk: ${summary.stressedHigh}`],
        actions: ["Allocate advisory capacity to the projected incremental high-risk group."],
      },
      {
        id: "scenario-revenue-impact",
        title: "Revenue impact",
        narrative: `Projected revenue shifts by ${revenueDeltaPct.toFixed(1)}% relative to baseline over the modeled horizon.`,
        confidence: clampConfidence(confidence + 3),
        tone: revenueDeltaPct < -10 ? "warning" : "success",
        evidence: [
          `Baseline revenue: $${summary.baseRevenue.toLocaleString()}`,
          `Scenario revenue: $${summary.stressedRevenue.toLocaleString()}`,
        ],
        actions: ["Use the sensitivity chart to sequence financial protection measures."],
      },
    ];
  }, [s.name, sensitivity, summary, enterprises.length]);

  const aiContext = useMemo(
    () => ({
      scenario: s,
      summary,
      sensitivity,
      trajectory: chart,
      enterpriseCount: enterprises.length,
    }),
    [s, summary, sensitivity, chart, enterprises.length]
  );

  const liveAi = useLiveAiInsights({
    scopeType: "scenarios",
    scopeId: s.name,
    context: aiContext,
    fallbackInsights: aiInsights,
  });

  const exportScenario = () => {
    if (!selectedScenario) return;
    const p = selectedScenario.parameters;
    const rows = [
      {
        Metric: "High-risk enterprises",
        Baseline: summary.baseHigh,
        Scenario: summary.stressedHigh,
      },
      {
        Metric: "Projected revenue (3M) USD",
        Baseline: summary.baseRevenue,
        Scenario: summary.stressedRevenue,
      },
      {
        Metric: "Net jobs (3M)",
        Baseline: summary.baseJobsNet,
        Scenario: summary.stressedJobsNet,
      },
      {
        Metric: "Inflation",
        Baseline: "-",
        Scenario: `${Math.round(p.inflation)}%`,
      },
      {
        Metric: "FX depreciation",
        Baseline: "-",
        Scenario: `${Math.round(p.fxDepreciation)}%`,
      },
      {
        Metric: "Funding cut",
        Baseline: "-",
        Scenario: `${Math.round(p.fundingCut)}%`,
      },
      {
        Metric: "Conflict disruption",
        Baseline: "-",
        Scenario: `${Math.round(p.conflictDisruption)}%`,
      },
    ];
    exportPDF(
      `Scenario_${selectedScenario.scenario_name.replace(/\s+/g, "_")}`,
      `Scenario Report \u2014 ${selectedScenario.scenario_name}`,
      rows,
    );
  };

  const runAllHorizons = () => setRunNonce((n) => n + 1);

  const deleteRun = async (simRunId: string) => {
    if (
      !selectedScenario ||
      !window.confirm(
        "Delete this simulation run? This cannot be undone.",
      )
    )
      return;
    try {
      setDeletingRunId(simRunId);
      setApiError(null);
      await deleteScenarioRun(selectedScenario.scenario_id, simRunId);
      const history = await listScenarioRuns(
        selectedScenario.scenario_id,
        { limit: 25, offset: 0 },
      );
      setRunHistory(history.runs);
      if (history.runs.length === 0) {
        setSelectedRunId(null);
        setRunResults(null);
        setHorizonResults({});
        setHorizonRunIds({});
        setEnterpriseImpacts([]);
        setComparison(null);
        return;
      }
      if (selectedRunId === simRunId) {
        const next =
          history.runs.find(isSuccessfulRun) || history.runs[0];
        setSelectedRunId(next?.sim_run_id ?? null);
      }
    } catch (err: unknown) {
      setApiError(
        getErrorMessage(err, "Failed to delete simulation run."),
      );
    } finally {
      setDeletingRunId(null);
    }
  };

  const deleteAllRuns = async () => {
    if (
      !selectedScenario ||
      !window.confirm(
        "Delete all runs for this scenario? This cannot be undone.",
      )
    )
      return;
    try {
      setDeletingAllRuns(true);
      setApiError(null);
      await deleteAllScenarioRuns(selectedScenario.scenario_id);
      setRunHistory([]);
      setSelectedRunId(null);
      setRunResults(null);
      setHorizonResults({});
      setHorizonRunIds({});
      setEnterpriseImpacts([]);
      setComparison(null);
    } catch (err: unknown) {
      setApiError(
        getErrorMessage(err, "Failed to delete all simulation runs."),
      );
    } finally {
      setDeletingAllRuns(false);
    }
  };

  const toggleImpactSort = useCallback(
    (key: "revenue" | "jobs" | "risk") => {
      setImpactSort((prev) =>
        prev.key === key
          ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
          : { key, dir: "desc" },
      );
    },
    [],
  );

  /* --- render ---------------------------------------------- */

  const PostureIcon = postureConfig.Icon;

  return (
    <RequireRole allow={["Admin", "Program Manager"]}>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-inkomoko-blue">
              Scenario Simulation
            </h1>
            <p className="text-sm text-inkomoko-muted mt-1">
              Run stress-test simulations across your portfolio and explore
              projected impacts by horizon.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={exportScenario}
              disabled={!selectedScenario}
            >
              <Download size={14} className="mr-1.5" /> Export PDF
            </Button>
            <Button
              onClick={runAllHorizons}
              disabled={loadingRun || !selectedScenario}
            >
              {loadingRun ? (
                <>
                  <Loader2
                    size={14}
                    className="mr-1.5 animate-spin"
                  />{" "}
                  Running...
                </>
              ) : (
                <>
                  <Play size={14} className="mr-1.5" /> Run All
                  Horizons
                </>
              )}
            </Button>
          </div>
        </div>

        {/* AI Insights */}
        <InsightPanel
          title="AI Insights"
          subtitle="Scenario interpretation generated from active shock settings and simulated outcomes."
          status={liveAi.status}
          lastUpdated={liveAi.lastUpdated}
          insights={liveAi.insights}
        />

        {/* Scenario selector cards */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-inkomoko-text">
              Select a scenario
            </span>
            <div className="inline-flex rounded-lg border border-inkomoko-border bg-inkomoko-bg p-0.5 text-xs font-medium">
              {(["all", "downside", "upside"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    setScenarioTypeFilter(f);
                    setIdx(0);
                  }}
                  className={`px-3 py-1 rounded-md capitalize transition-colors ${
                    scenarioTypeFilter === f
                      ? "bg-white text-inkomoko-blue shadow-sm"
                      : "text-inkomoko-muted hover:text-inkomoko-text"
                  }`}
                >
                  {f === "all" ? `All (${scenarios.length})` : `${f} (${scenarios.filter((s) => s.scenario_type === f).length})`}
                </button>
              ))}
            </div>
          </div>
          {loadingScenarios ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : scenarios.length === 0 ? (
            <div className="rounded-2xl border border-inkomoko-border bg-white p-8 text-center">
              <BarChart3
                size={32}
                className="mx-auto text-inkomoko-muted mb-2"
              />
              <p className="text-sm text-inkomoko-muted">
                No scenarios available from the API. Create a scenario
                to get started.
              </p>
              {apiError && <p className="mt-2 text-xs text-red-600">{apiError}</p>}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {filteredScenarios.map((sc, i) => {
                const isActive = i === idx;
                const params = sc.parameters;
                const maxP = Math.max(
                  params.inflation,
                  params.fxDepreciation,
                  params.fundingCut,
                  params.conflictDisruption,
                );
                return (
                  <button
                    key={sc.scenario_id}
                    onClick={() => setIdx(i)}
                    className={`text-left rounded-xl border px-3 py-2 transition-all ${
                      isActive
                        ? "bg-inkomoko-blue text-white border-inkomoko-blue shadow-soft ring-2 ring-inkomoko-blue/20"
                        : "bg-white border-inkomoko-border hover:border-inkomoko-blueSoft hover:shadow-card"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="font-semibold text-xs truncate">
                        {sc.scenario_name}
                      </span>
                      <Badge
                        tone={
                          isActive ? "blue" : sc.scenario_type === "upside" ? "success" : severityTone(maxP)
                        }
                        className={`text-[9px] px-1.5 py-0 leading-4 ${
                          isActive
                            ? "bg-white/20 text-white border-white/30"
                            : ""
                        }`}
                      >
                        {sc.scenario_type}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {[
                        {
                          label: "Inf",
                          val: params.inflation,
                        },
                        {
                          label: "FX",
                          val: params.fxDepreciation,
                        },
                        {
                          label: "Fund",
                          val: params.fundingCut,
                        },
                        {
                          label: "Conf",
                          val: params.conflictDisruption,
                        },
                      ]
                        .filter((p) => p.val !== 0)
                        .map((p) => (
                          <span
                            key={p.label}
                            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[9px] font-medium leading-4 ${
                              isActive
                                ? "bg-white/20 text-white"
                                : "bg-inkomoko-bg text-inkomoko-text border border-inkomoko-border"
                            }`}
                          >
                            <span
                              className={`w-1 h-1 rounded-full ${isActive ? "bg-white/60" : p.val < 0 ? "bg-green-500" : severityColor(p.val)}`}
                            />
                            {p.label} {p.val > 0 ? `+${p.val}` : p.val}%
                          </span>
                        ))}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected scenario description */}
        {selectedScenario && (
          <div className="flex items-start gap-3 rounded-xl border border-inkomoko-border bg-white px-4 py-3">
            <span className={`mt-0.5 shrink-0 rounded-full p-1.5 ${isUpside ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}>
              {isUpside ? <TrendingUp size={14} /> : <AlertTriangle size={14} />}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-inkomoko-text">{selectedScenario.scenario_name}</span>
                <Badge tone={isUpside ? "success" : severityTone(Math.max(selectedScenario.parameters.inflation, selectedScenario.parameters.fxDepreciation, selectedScenario.parameters.fundingCut, selectedScenario.parameters.conflictDisruption))} className="text-[10px]">{selectedScenario.scenario_type}</Badge>
              </div>
              {selectedScenario.description && (
                <p className="text-xs text-inkomoko-muted mt-0.5 leading-relaxed">{selectedScenario.description}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-1.5">
                {[
                  { label: "Inflation", val: selectedScenario.parameters.inflation },
                  { label: "FX Depreciation", val: selectedScenario.parameters.fxDepreciation },
                  { label: "Funding Cut", val: selectedScenario.parameters.fundingCut },
                  { label: "Conflict Disruption", val: selectedScenario.parameters.conflictDisruption },
                ].map((p) => (
                  <span key={p.label} className="inline-flex items-center gap-1 text-[10px] text-inkomoko-muted">
                    <span className={`w-1.5 h-1.5 rounded-full ${p.val === 0 ? "bg-gray-300" : p.val < 0 ? "bg-green-500" : severityColor(p.val)}`} />
                    {p.label}: <span className="font-medium text-inkomoko-text">{p.val > 0 ? `+${p.val}` : p.val}%</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* KPI cards */}
        {loadingRun && !hasRunData ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              icon={<AlertTriangle size={18} />}
              label="High-Risk Enterprises"
              baseline={hasRunData ? summary.baseHigh : null}
              scenario={hasRunData ? summary.stressedHigh : null}
              delta={hasRunData ? riskDelta : null}
              deltaLabel={
                hasRunData
                  ? `${riskDelta >= 0 ? "+" : ""}${riskDelta} enterprises`
                  : undefined
              }
              tone={riskDelta > 0 ? "danger" : "success"}
              format="int"
            />
            <KpiCard
              icon={<DollarSign size={18} />}
              label="Projected Revenue"
              baseline={hasRunData ? summary.baseRevenue : null}
              scenario={hasRunData ? summary.stressedRevenue : null}
              delta={hasRunData ? revDelta : null}
              deltaLabel={
                hasRunData
                  ? `${revDelta >= 0 ? "+" : ""}${revDelta.toFixed(1)}%`
                  : undefined
              }
              tone={revDelta < 0 ? "danger" : "success"}
              format="currency"
            />
            <KpiCard
              icon={<Briefcase size={18} />}
              label="Net Jobs"
              baseline={hasRunData ? summary.baseJobsNet : null}
              scenario={hasRunData ? summary.stressedJobsNet : null}
              delta={hasRunData ? jobsDelta : null}
              deltaLabel={
                hasRunData
                  ? `${jobsDelta >= 0 ? "+" : ""}${jobsDelta.toFixed(1)}%`
                  : undefined
              }
              tone={jobsDelta < 0 ? "danger" : "success"}
              format="int"
            />
            <KpiCard
              icon={<Users size={18} />}
              label="Enterprises Simulated"
              baseline={null}
              scenario={
                hasRunData ? summary.enterpriseCount : null
              }
              delta={null}
              tone="blue"
              format="int"
              singleValue
            />
          </div>
        )}

        {/* Charts row */}
        {loadingRun && !hasRunData ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <SkeletonChart />
            <SkeletonChart />
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Trajectory chart */}
            <Card className="min-h-[380px]">
              <CardHeader>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle>
                    {trajectoryMetric === "risk"
                      ? "High-Risk Trajectory"
                      : trajectoryMetric === "jobs"
                        ? "Net Jobs Trajectory"
                        : "Revenue Trajectory"}
                  </CardTitle>
                  <div className="flex items-center gap-1 text-xs">
                    {(["revenue", "risk", "jobs"] as const).map(
                      (m) => (
                        <button
                          key={m}
                          className={`rounded-lg border px-2.5 py-1 capitalize transition ${
                            trajectoryMetric === m
                              ? "bg-inkomoko-blue text-white border-inkomoko-blue"
                              : "bg-white border-inkomoko-border hover:bg-inkomoko-bg"
                          }`}
                          onClick={() => setTrajectoryMetric(m)}
                        >
                          {m}
                        </button>
                      ),
                    )}
                  </div>
                </div>
                <CardDescription>
                  {trajectoryMetric === "risk"
                    ? "Baseline vs scenario high-risk count over time."
                    : trajectoryMetric === "jobs"
                      ? "Baseline vs scenario net jobs over time."
                      : "Baseline vs scenario revenue by horizon (USD thousands)."}
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[280px]">
                {chart.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-xs text-inkomoko-muted">
                      No trajectory data available yet. Run a
                      simulation to see results.
                    </p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chart}>
                      <defs>
                        <linearGradient
                          id="gradBaseline"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#0B2E5B"
                            stopOpacity={0.15}
                          />
                          <stop
                            offset="95%"
                            stopColor="#0B2E5B"
                            stopOpacity={0}
                          />
                        </linearGradient>
                        <linearGradient
                          id="gradScenario"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#F05A28"
                            stopOpacity={0.15}
                          />
                          <stop
                            offset="95%"
                            stopColor="#F05A28"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#E5E7EB"
                      />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis tick={{ fontSize: 12 }} />
                      <RTooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Area
                        type="monotone"
                        dataKey="Baseline"
                        stroke="#0B2E5B"
                        strokeWidth={2.5}
                        fill="url(#gradBaseline)"
                        dot={{ r: 4 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="Scenario"
                        stroke="#F05A28"
                        strokeWidth={2.5}
                        fill="url(#gradScenario)"
                        dot={{ r: 4 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Sensitivity bars */}
            <Card className="min-h-[380px]">
              <CardHeader>
                <CardTitle>Shock Sensitivity Profile</CardTitle>
                <CardDescription>
                  Relative stress magnitude by driver, sorted by
                  impact.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={sensitivity}
                    layout="vertical"
                    margin={{ left: 10 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#E5E7EB"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 12 }}
                      unit="%"
                    />
                    <YAxis
                      type="category"
                      dataKey="driver"
                      tick={{ fontSize: 12 }}
                      width={60}
                    />
                    <RTooltip content={<ChartTooltip />} />
                    <Bar
                      dataKey="impact"
                      radius={[0, 8, 8, 0]}
                      barSize={28}
                    >
                      {sensitivity.map((entry) => (
                        <Cell
                          key={entry.driver}
                          fill={
                            entry.impact <= 10
                              ? "#16A34A"
                              : entry.impact <= 30
                                ? "#F59E0B"
                                : entry.impact <= 60
                                  ? "#F05A28"
                                  : "#DC2626"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Risk distribution donuts */}
        {riskPieData.baseline.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Risk Distribution Shift</CardTitle>
              <CardDescription>
                Enterprise count by risk tier — baseline vs scenario
                stress projection.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="text-xs font-semibold text-inkomoko-muted mb-2 text-center">
                    Baseline
                  </div>
                  <div className="h-[220px]">
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                    >
                      <PieChart>
                        <Pie
                          data={riskPieData.baseline}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          innerRadius={45}
                          paddingAngle={3}
                          label={({ name, value }) =>
                            `${name}: ${value}`
                          }
                        >
                          {riskPieData.baseline.map((entry) => (
                            <Cell
                              key={entry.name}
                              fill={
                                PIE_COLORS[entry.name] ??
                                "#6B7280"
                              }
                            />
                          ))}
                        </Pie>
                        <Legend
                          wrapperStyle={{ fontSize: 12 }}
                        />
                        <RTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-inkomoko-muted mb-2 text-center">
                    Under Scenario Stress
                  </div>
                  <div className="h-[220px]">
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                    >
                      <PieChart>
                        <Pie
                          data={riskPieData.scenario}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          innerRadius={45}
                          paddingAngle={3}
                          label={({ name, value }) =>
                            `${name}: ${value}`
                          }
                        >
                          {riskPieData.scenario.map((entry) => (
                            <Cell
                              key={entry.name}
                              fill={
                                PIE_COLORS[entry.name] ??
                                "#6B7280"
                              }
                            />
                          ))}
                        </Pie>
                        <Legend
                          wrapperStyle={{ fontSize: 12 }}
                        />
                        <RTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Enterprise impact + Comparison row */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Enterprise impact table */}
          {loadingImpacts && enterpriseImpacts.length === 0 ? (
            <SkeletonTable />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Enterprise Impact Drilldown</CardTitle>
                <CardDescription>
                  Top affected enterprises in the selected run.
                  {enterpriseImpacts.length > 0 && (
                    <span className="ml-1 font-medium text-inkomoko-text">
                      ({enterpriseImpacts.length} shown)
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {enterpriseImpacts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-inkomoko-border p-8 text-center">
                    <Users
                      size={28}
                      className="mx-auto text-inkomoko-muted mb-2"
                    />
                    <p className="text-sm text-inkomoko-muted">
                      No enterprise impact data available for
                      this run.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="text-left text-inkomoko-muted border-b-2 border-inkomoko-border">
                          <th className="py-2 pr-3 font-medium">
                            Enterprise
                          </th>
                          <th className="py-2 pr-3 font-medium">
                            Risk Shift
                          </th>
                          <th
                            className="py-2 pr-3 font-medium cursor-pointer select-none"
                            onClick={() =>
                              toggleImpactSort("revenue")
                            }
                          >
                            <span className="inline-flex items-center gap-1">
                              Revenue Delta
                              {impactSort.key === "revenue" &&
                                (impactSort.dir === "desc" ? (
                                  <ChevronDown size={12} />
                                ) : (
                                  <ChevronUp size={12} />
                                ))}
                            </span>
                          </th>
                          <th
                            className="py-2 font-medium cursor-pointer select-none"
                            onClick={() =>
                              toggleImpactSort("jobs")
                            }
                          >
                            <span className="inline-flex items-center gap-1">
                              Jobs Delta
                              {impactSort.key === "jobs" &&
                                (impactSort.dir === "desc" ? (
                                  <ChevronDown size={12} />
                                ) : (
                                  <ChevronUp size={12} />
                                ))}
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedImpacts.map((item, i) => {
                          const riskChanged =
                            item.baseline_risk_label !==
                            item.scenario_risk_label;
                          return (
                            <tr
                              key={
                                item.enterprise_id ||
                                `row-${i}`
                              }
                              className={`border-b border-inkomoko-border/50 ${i % 2 === 1 ? "bg-inkomoko-bg/40" : ""}`}
                            >
                              <td className="py-2.5 pr-3 font-medium truncate max-w-[140px]">
                                {item.enterprise_id ||
                                  "Anonymous"}
                              </td>
                              <td className="py-2.5 pr-3">
                                <div className="flex items-center gap-1.5">
                                  <RiskBadge
                                    label={
                                      item.baseline_risk_label
                                    }
                                  />
                                  <span className="text-inkomoko-muted">
                                    &rarr;
                                  </span>
                                  <RiskBadge
                                    label={
                                      item.scenario_risk_label
                                    }
                                  />
                                  {riskChanged && (
                                    <span className="text-[10px]">
                                      {(
                                        item.scenario_risk_label ||
                                        ""
                                      ).toUpperCase() ===
                                      "HIGH"
                                        ? "\u2B06"
                                        : "\u2B07"}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 pr-3">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={
                                      item.revenue_delta < 0
                                        ? "text-red-600 font-semibold"
                                        : "text-green-700 font-semibold"
                                    }
                                  >
                                    {item.revenue_delta < 0
                                      ? ""
                                      : "+"}
                                    {fmtNum(
                                      item.revenue_delta,
                                    )}
                                  </span>
                                  <MicroBar
                                    value={item.revenue_delta}
                                    maxAbs={Math.max(
                                      ...enterpriseImpacts.map(
                                        (e) =>
                                          Math.abs(
                                            e.revenue_delta,
                                          ),
                                      ),
                                      1,
                                    )}
                                  />
                                </div>
                              </td>
                              <td className="py-2.5">
                                <span
                                  className={
                                    item.jobs_net_delta < 0
                                      ? "text-red-600 font-semibold"
                                      : "text-green-700 font-semibold"
                                  }
                                >
                                  {item.jobs_net_delta < 0
                                    ? ""
                                    : "+"}
                                  {fmtNum(
                                    item.jobs_net_delta,
                                  )}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Summary strip */}
                    <div className="mt-3 flex items-center gap-4 rounded-xl bg-inkomoko-bg p-3 text-xs text-inkomoko-muted">
                      <span>
                        Total Revenue Delta:{" "}
                        <strong className="text-inkomoko-text">
                          {fmtCurrency(
                            enterpriseImpacts.reduce(
                              (s, e) =>
                                s + e.revenue_delta,
                              0,
                            ),
                          )}
                        </strong>
                      </span>
                      <span>
                        Total Jobs Delta:{" "}
                        <strong className="text-inkomoko-text">
                          {fmtNum(
                            enterpriseImpacts.reduce(
                              (s, e) =>
                                s + e.jobs_net_delta,
                              0,
                            ),
                          )}
                        </strong>
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Run comparison */}
          {loadingComparison ? (
            <SkeletonTable />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Run Comparison</CardTitle>
                <CardDescription>
                  Selected run compared to the most recent alternate
                  run.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!comparison ? (
                  <div className="rounded-xl border border-dashed border-inkomoko-border p-8 text-center">
                    <BarChart3
                      size={28}
                      className="mx-auto text-inkomoko-muted mb-2"
                    />
                    <p className="text-sm text-inkomoko-muted">
                      Need at least two successful runs to
                      compare.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <ComparisonTile
                        label="High-Risk Delta"
                        value={comparison.delta.high_risk_count}
                      />
                      <ComparisonTile
                        label="Revenue Delta"
                        value={comparison.delta.total_revenue}
                        isCurrency
                      />
                      <ComparisonTile
                        label="Jobs Delta"
                        value={comparison.delta.total_jobs_net}
                      />
                    </div>
                    <div>
                      <div className="text-xs font-semibold mb-2">
                        Top movers
                      </div>
                      <div className="space-y-2">
                        {comparison.top_movers
                          .slice(0, 6)
                          .map((m) => (
                            <div
                              key={m.enterprise_id}
                              className="rounded-xl border border-inkomoko-border p-3 text-xs bg-white hover:shadow-card transition"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium">
                                  {m.enterprise_id}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <RiskBadge
                                    label={
                                      m.run_a_risk_label
                                    }
                                  />
                                  <span className="text-inkomoko-muted">
                                    &rarr;
                                  </span>
                                  <RiskBadge
                                    label={
                                      m.run_b_risk_label
                                    }
                                  />
                                </div>
                              </div>
                              <div className="flex items-center gap-4 mt-1.5 text-inkomoko-muted">
                                <span>
                                  Revenue Delta:{" "}
                                  <strong
                                    className={
                                      m.revenue_delta_change <
                                      0
                                        ? "text-red-600"
                                        : "text-green-700"
                                    }
                                  >
                                    {fmtNum(
                                      m.revenue_delta_change,
                                    )}
                                  </strong>
                                </span>
                                <span>
                                  Jobs Delta:{" "}
                                  <strong
                                    className={
                                      m.jobs_net_delta_change <
                                      0
                                        ? "text-red-600"
                                        : "text-green-700"
                                    }
                                  >
                                    {fmtNum(
                                      m.jobs_net_delta_change,
                                    )}
                                  </strong>
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Run timeline (collapsible) */}
        <Card>
          <CardHeader
            className="cursor-pointer select-none"
            onClick={() => setTimelineOpen((o) => !o)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock
                  size={16}
                  className="text-inkomoko-muted"
                />
                <CardTitle className="text-sm">
                  Run Timeline
                </CardTitle>
                <span className="text-xs text-inkomoko-muted">
                  ({runHistory.length} runs)
                </span>
                {loadingHistory && (
                  <Loader2
                    size={14}
                    className="animate-spin text-inkomoko-muted"
                  />
                )}
              </div>
              <div className="flex items-center gap-2">
                {timelineOpen && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="border border-red-200 text-red-700 hover:bg-red-50 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteAllRuns();
                    }}
                    disabled={
                      deletingAllRuns ||
                      runHistory.length === 0
                    }
                  >
                    <Trash2 size={12} className="mr-1" />{" "}
                    {deletingAllRuns
                      ? "Deleting..."
                      : "Clear All"}
                  </Button>
                )}
                {timelineOpen ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </div>
            </div>
          </CardHeader>
          {timelineOpen && (
            <CardContent>
              {runHistory.length === 0 ? (
                <p className="text-xs text-inkomoko-muted py-2">
                  No historical runs yet. Run a simulation above
                  to get started.
                </p>
              ) : (
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {runHistory.map((run) => {
                    const isSelected =
                      run.sim_run_id === selectedRunId;
                    const isOk =
                      run.run_status === "succeeded";
                    const horizonMatch = (
                      run.notes || ""
                    ).match(
                      /\((1m|3m|6m|12m)\)$/,
                    )?.[1];
                    return (
                      <div
                        key={run.sim_run_id}
                        className={`flex items-center justify-between rounded-xl border px-4 py-2.5 text-xs transition cursor-pointer ${
                          isSelected
                            ? "bg-inkomoko-blue/5 border-inkomoko-blue ring-1 ring-inkomoko-blue/20"
                            : "bg-white border-inkomoko-border hover:bg-inkomoko-bg"
                        }`}
                        onClick={() =>
                          setSelectedRunId(
                            run.sim_run_id,
                          )
                        }
                      >
                        <div className="flex items-center gap-3">
                          {isOk ? (
                            <CheckCircle2
                              size={14}
                              className="text-green-600 shrink-0"
                            />
                          ) : (
                            <XCircle
                              size={14}
                              className="text-red-500 shrink-0"
                            />
                          )}
                          <div>
                            <div className="font-medium">
                              {new Date(
                                run.started_at,
                              ).toLocaleString()}
                            </div>
                            <div className="text-inkomoko-muted mt-0.5">
                              {run.result_count}{" "}
                              results
                              {horizonMatch && (
                                <Badge
                                  tone="blue"
                                  className="ml-1.5 text-[10px] px-1.5 py-0"
                                >
                                  {horizonMatch}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          className="rounded-lg border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50 transition"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteRun(
                              run.sim_run_id,
                            );
                          }}
                          disabled={
                            deletingRunId ===
                            run.sim_run_id
                          }
                        >
                          {deletingRunId ===
                          run.sim_run_id ? (
                            <Loader2
                              size={12}
                              className="animate-spin"
                            />
                          ) : (
                            <Trash2 size={12} />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Operational posture */}
        <div
          className={`rounded-2xl border p-5 ${postureConfig.bg}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <PostureIcon
              size={18}
              className={postureConfig.text}
            />
            <span
              className={`text-sm font-semibold ${postureConfig.text}`}
            >
              Recommended Operational Posture &mdash;{" "}
              {postureConfig.label}
            </span>
          </div>
          <p className="text-sm text-inkomoko-muted leading-relaxed">
            Under{" "}
            <span className="font-semibold text-inkomoko-text">
              {selectedScenario?.scenario_name ||
                "this scenario"}
            </span>
            {postureSeverity === "upside" &&
              ", leverage improving conditions to accelerate growth programming, expand market linkages, increase lending capacity, and invest in skills development to maximise the upside window."}
            {postureSeverity === "critical" &&
              ", prioritize emergency stabilization for high-risk tiers, activate contingency funding, and escalate market linkage support immediately. Deploy crisis response protocols."}
            {postureSeverity === "elevated" &&
              ", prioritize rapid stabilization for high-risk tiers, expand cashflow coaching capacity, and intensify market linkage support to offset revenue pressure."}
            {postureSeverity === "moderate" &&
              ", maintain enhanced monitoring of high-risk enterprises, prepare contingency advisory plans, and ensure cashflow coaching capacity can scale if conditions worsen."}
            {postureSeverity === "low" &&
              ", continue standard monitoring cadence. Current shock parameters are within normal operating tolerance. Focus on growth enablement."}
          </p>
          {apiError && (
            <p className="mt-3 text-xs text-red-600 bg-white/60 rounded-lg p-2">
              {apiError}
            </p>
          )}
        </div>
      </div>
    </RequireRole>
  );
}

/* --- KPI Card ------------------------------------------------ */

function KpiCard({
  icon,
  label,
  baseline,
  scenario,
  delta,
  deltaLabel,
  tone,
  format,
  singleValue,
}: {
  icon: React.ReactNode;
  label: string;
  baseline: number | null;
  scenario: number | null;
  delta: number | null;
  deltaLabel?: string;
  tone: "success" | "danger" | "warning" | "blue" | "orange";
  format: "int" | "currency";
  singleValue?: boolean;
}) {
  const fmt = (v: number | null) => {
    if (v === null) return "--";
    if (format === "currency") return fmtCurrency(v);
    return fmtNum(v);
  };

  const toneColors: Record<string, string> = {
    success: "text-green-600",
    danger: "text-red-600",
    warning: "text-yellow-600",
    blue: "text-inkomoko-blue",
    orange: "text-inkomoko-orange",
  };

  const DeltaIcon =
    delta !== null && delta > 0
      ? TrendingUp
      : delta !== null && delta < 0
        ? TrendingDown
        : Minus;

  return (
    <div className="rounded-2xl border border-inkomoko-border bg-white p-5 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-inkomoko-muted">
          {icon}
          <span className="text-xs font-medium uppercase tracking-wide">
            {label}
          </span>
        </div>
        {delta !== null && (
          <div
            className={`flex items-center gap-1 text-xs font-semibold ${toneColors[tone]}`}
          >
            <DeltaIcon size={14} />
            {deltaLabel}
          </div>
        )}
      </div>
      {singleValue ? (
        <div className="text-3xl font-bold text-inkomoko-text">
          {fmt(scenario)}
        </div>
      ) : (
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-inkomoko-muted">
              Baseline
            </div>
            <div className="text-xl font-bold text-inkomoko-text">
              {fmt(baseline)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-inkomoko-muted">
              Scenario
            </div>
            <div
              className={`text-xl font-bold ${toneColors[tone]}`}
            >
              {fmt(scenario)}
            </div>
          </div>
        </div>
      )}
      {/* Proportional bar */}
      {baseline !== null &&
        scenario !== null &&
        !singleValue && (
          <div className="mt-3 flex h-1.5 rounded-full overflow-hidden bg-gray-100">
            <div
              className="bg-inkomoko-blue/60 transition-all"
              style={{
                width: `${Math.min(100, Math.max(5, baseline && scenario ? (baseline / (baseline + scenario)) * 100 : 50))}%`,
              }}
            />
            <div
              className={`transition-all ${tone === "danger" ? "bg-red-400" : tone === "success" ? "bg-green-400" : "bg-inkomoko-orange/60"}`}
              style={{ flex: 1 }}
            />
          </div>
        )}
    </div>
  );
}

/* --- Risk Badge ---------------------------------------------- */

function RiskBadge({ label }: { label: string | null }) {
  const l = (label || "").toUpperCase();
  const tone: "success" | "warning" | "danger" | "neutral" =
    l === "LOW"
      ? "success"
      : l === "MEDIUM"
        ? "warning"
        : l === "HIGH"
          ? "danger"
          : "neutral";
  return (
    <Badge tone={tone} className="text-[10px] px-1.5 py-0">
      {l || "\u2014"}
    </Badge>
  );
}

/* --- Micro Bar ----------------------------------------------- */

function MicroBar({
  value,
  maxAbs,
}: {
  value: number;
  maxAbs: number;
}) {
  const pct = maxAbs > 0 ? Math.abs(value) / maxAbs : 0;
  return (
    <div className="w-16 h-2 rounded-full bg-gray-100 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${value < 0 ? "bg-red-400" : "bg-green-400"}`}
        style={{ width: `${Math.max(4, pct * 100)}%` }}
      />
    </div>
  );
}

/* --- Comparison Tile ----------------------------------------- */

function ComparisonTile({
  label,
  value,
  isCurrency,
}: {
  label: string;
  value: number;
  isCurrency?: boolean;
}) {
  const DIcon =
    value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  return (
    <div className="rounded-xl border border-inkomoko-border bg-white p-3">
      <div className="text-inkomoko-muted text-xs">{label}</div>
      <div
        className={`mt-1 flex items-center gap-1 text-sm font-semibold ${value < 0 ? "text-red-600" : value > 0 ? "text-green-700" : "text-inkomoko-text"}`}
      >
        <DIcon size={14} />
        {isCurrency ? fmtCurrency(value) : fmtNum(value)}
      </div>
    </div>
  );
}
