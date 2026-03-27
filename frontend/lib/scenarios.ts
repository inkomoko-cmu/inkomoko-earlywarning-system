import { apiFetch } from "@/lib/api";
import {
  type ApiScenario,
  type SimulationRunListItem,
  type ScenarioParams,
  type ScenarioUpdateRequest,
  type SimulationComparisonResponse,
  type SimulationEnterpriseImpactResponse,
  type SimulationResultItem,
  type SimulationResultResponse,
  type SimulationRunBulkDeleteResponse,
  type SimulationRunDeleteResponse,
  type SimulationRunListResponse,
  type SimulationRunRequest,
  type SimulationRunResponse,
} from "@/lib/types";

export const DEFAULT_SCENARIO_TARGET_KEYS = ["risk_tier", "revenue", "jobs_created", "jobs_lost"];
export const TRAJECTORY_HORIZONS = ["1m", "3m", "6m", "12m"] as const;

export type TrajectoryHorizon = (typeof TRAJECTORY_HORIZONS)[number];

function normalizeTargetKey(targetKey: string): string {
  const key = targetKey.trim().toLowerCase();
  if (key.endsWith("_1m") || key.endsWith("_3m") || key.endsWith("_6m") || key.endsWith("_12m")) {
    return key.replace(/_(1m|3m|6m|12m)$/, "");
  }
  return key;
}

export type ScenarioSummary = {
  baseHigh: number;
  stressedHigh: number;
  baseRevenue: number;
  stressedRevenue: number;
  baseJobsNet: number;
  stressedJobsNet: number;
  enterpriseCount: number;
};

export type ScenarioTrajectoryPoint = {
  horizon: TrajectoryHorizon;
  label: string;
  baselineRevenue: number;
  scenarioRevenue: number;
  baselineHighRisk: number;
  scenarioHighRisk: number;
  baselineJobsNet: number;
  scenarioJobsNet: number;
  runId: string | null;
};

function horizonLabel(horizon: TrajectoryHorizon): string {
  if (horizon === "1m") return "+1M";
  if (horizon === "3m") return "+3M";
  if (horizon === "6m") return "+6M";
  return "+12M";
}

export async function listScenarios(): Promise<ApiScenario[]> {
  return apiFetch<ApiScenario[]>("/scenarios", { method: "GET" }, true, {
    cacheTtlMs: 120000,
  });
}

export async function updateScenario(
  scenarioId: string,
  payload: ScenarioUpdateRequest
): Promise<ApiScenario> {
  return apiFetch<ApiScenario>(
    `/scenarios/${scenarioId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    true
  );
}

export async function runScenario(
  scenarioId: string,
  payload: SimulationRunRequest
): Promise<SimulationRunResponse> {
  return apiFetch<SimulationRunResponse>(
    `/scenarios/${scenarioId}/run`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    true
  );
}

export async function getRunResults(
  scenarioId: string,
  simRunId: string,
  horizon?: TrajectoryHorizon
): Promise<SimulationResultResponse> {
  const query = horizon ? `?horizon=${encodeURIComponent(horizon)}` : "";
  return apiFetch<SimulationResultResponse>(
    `/scenarios/${scenarioId}/runs/${simRunId}${query}`,
    { method: "GET" },
    true
  );
}

export async function listScenarioRuns(
  scenarioId: string,
  params?: { limit?: number; offset?: number }
): Promise<SimulationRunListResponse> {
  const search = new URLSearchParams();
  if (typeof params?.limit === "number") {
    search.set("limit", String(params.limit));
  }
  if (typeof params?.offset === "number") {
    search.set("offset", String(params.offset));
  }
  const query = search.toString();

  return apiFetch<SimulationRunListResponse>(
    `/scenarios/${scenarioId}/runs${query ? `?${query}` : ""}`,
    { method: "GET" },
    true
  );
}

export async function getRunEnterpriseImpacts(
  scenarioId: string,
  simRunId: string,
  params?: { limit?: number; offset?: number }
): Promise<SimulationEnterpriseImpactResponse> {
  const search = new URLSearchParams();
  if (typeof params?.limit === "number") {
    search.set("limit", String(params.limit));
  }
  if (typeof params?.offset === "number") {
    search.set("offset", String(params.offset));
  }
  const query = search.toString();

  return apiFetch<SimulationEnterpriseImpactResponse>(
    `/scenarios/${scenarioId}/runs/${simRunId}/enterprises${query ? `?${query}` : ""}`,
    { method: "GET" },
    true
  );
}

export async function compareScenarioRuns(
  scenarioId: string,
  runA: string,
  runB: string,
  topN: number = 20
): Promise<SimulationComparisonResponse> {
  const search = new URLSearchParams({
    run_a: runA,
    run_b: runB,
    top_n: String(topN),
  });

  return apiFetch<SimulationComparisonResponse>(
    `/scenarios/${scenarioId}/compare?${search.toString()}`,
    { method: "GET" },
    true
  );
}

export async function deleteScenarioRun(
  scenarioId: string,
  simRunId: string
): Promise<SimulationRunDeleteResponse> {
  return apiFetch<SimulationRunDeleteResponse>(
    `/scenarios/${scenarioId}/runs/${simRunId}`,
    { method: "DELETE" },
    true
  );
}

export async function deleteAllScenarioRuns(
  scenarioId: string
): Promise<SimulationRunBulkDeleteResponse> {
  return apiFetch<SimulationRunBulkDeleteResponse>(
    `/scenarios/${scenarioId}/runs`,
    { method: "DELETE" },
    true
  );
}

export function getSensitivityFromParams(params: ScenarioParams) {
  return [
    { driver: "Inflation", impact: Math.round(params.inflation) },
    { driver: "FX", impact: Math.round(params.fxDepreciation) },
    { driver: "Funding", impact: Math.round(params.fundingCut) },
    { driver: "Conflict", impact: Math.round(params.conflictDisruption) },
  ];
}

export function summarizeRunResults(
  resultItems: SimulationResultItem[],
  enterpriseCountOverride?: number,
): ScenarioSummary {
  const uniqueEnterpriseIds = new Set<string>();

  let baseHigh = 0;
  let stressedHigh = 0;
  let baseRevenue = 0;
  let stressedRevenue = 0;
  let baseJobsCreated = 0;
  let baseJobsLost = 0;
  let stressedJobsCreated = 0;
  let stressedJobsLost = 0;

  for (const row of resultItems) {
    const entityKey = row.enterprise_id;
    if (entityKey) {
      uniqueEnterpriseIds.add(entityKey);
    }

    const key = normalizeTargetKey(row.target_key);
    if (key === "risk_tier") {
      if ((row.baseline_label || "").toUpperCase() === "HIGH") {
        baseHigh += 1;
      }
      if ((row.scenario_label || "").toUpperCase() === "HIGH") {
        stressedHigh += 1;
      }
      continue;
    }

    if (key === "revenue") {
      baseRevenue += Number(row.baseline_value ?? 0);
      stressedRevenue += Number(row.scenario_value ?? 0);
      continue;
    }

    if (key === "jobs_created") {
      baseJobsCreated += Number(row.baseline_value ?? 0);
      stressedJobsCreated += Number(row.scenario_value ?? 0);
      continue;
    }

    if (key === "jobs_lost") {
      baseJobsLost += Number(row.baseline_value ?? 0);
      stressedJobsLost += Number(row.scenario_value ?? 0);
    }
  }

  return {
    baseHigh,
    stressedHigh,
    baseRevenue: Math.round(baseRevenue),
    stressedRevenue: Math.round(stressedRevenue),
    baseJobsNet: Math.round(baseJobsCreated - baseJobsLost),
    stressedJobsNet: Math.round(stressedJobsCreated - stressedJobsLost),
    enterpriseCount: enterpriseCountOverride ?? uniqueEnterpriseIds.size,
  };
}

export function isSuccessfulRun(run: SimulationRunListItem): boolean {
  return run.run_status === "succeeded" && Number(run.result_count || 0) > 0;
}

export function buildTrajectorySeries(
  horizonResults: Partial<Record<TrajectoryHorizon, SimulationResultResponse>>,
  horizonRunIds?: Partial<Record<TrajectoryHorizon, string>>
): ScenarioTrajectoryPoint[] {
  const availableHorizons = TRAJECTORY_HORIZONS.filter((horizon) => Boolean(horizonResults[horizon]));
  if (availableHorizons.length === 0) {
    return [];
  }

  return availableHorizons.map((horizon) => {
    const run = horizonResults[horizon];
    const summary = run ? summarizeRunResults(run.results, run.enterprise_count) : null;
    return {
      horizon,
      label: horizonLabel(horizon),
      baselineRevenue: summary?.baseRevenue ?? 0,
      scenarioRevenue: summary?.stressedRevenue ?? 0,
      baselineHighRisk: summary?.baseHigh ?? 0,
      scenarioHighRisk: summary?.stressedHigh ?? 0,
      baselineJobsNet: summary?.baseJobsNet ?? 0,
      scenarioJobsNet: summary?.stressedJobsNet ?? 0,
      runId: horizonRunIds?.[horizon] ?? run?.sim_run_id ?? null,
    };
  });
}
