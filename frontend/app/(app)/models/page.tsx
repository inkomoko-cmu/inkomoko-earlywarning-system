"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { InsightPanel } from "@/components/ui/InsightPanel";
import { BrainCircuit, Download, Loader2, AlertCircle } from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";
import { apiFetch } from "@/lib/api";
import { type AiInsight, clampConfidence } from "@/lib/insights";
import { useLiveAiInsights } from "@/lib/useLiveAiInsights";

type MetricInterpretation = {
  excellent: number;
  good: number;
  fair: number;
  lower_is_better?: boolean;
};

type MetricExplanation = {
  label: string;
  explanation: string;
  interpretation?: MetricInterpretation;
};

type ModelInfo = {
  name: string;
  target: string;
  horizon: number;
  type: string;
  algorithm: string;
  feature_count: number;
  feature_importance?: Array<{ feature: string; importance: number }>;
  hyperparameters?: Record<string, any>;
  file?: string;
  size_mb?: number;
  last_modified?: string;
};

type PipelineCard = {
  pipeline: string;
  description: string;
  purpose: string;
  what_it_predicts: Array<{
    target: string;
    label: string;
    explanation: string;
  }>;
  metric_explanations: Record<string, MetricExplanation>;
  num_models: number;
  feature_count: number;
  features: string[];
  training_metrics: Record<string, any>;
  models: ModelInfo[];
};

type ModelCards = {
  risk: PipelineCard;
  employment: PipelineCard;
  revenue: PipelineCard;
};

function getMetricQuality(value: number, interpretation?: MetricInterpretation): string {
  if (!interpretation) return "unknown";
  
  const lowerIsBetter = interpretation.lower_is_better || false;
  
  if (lowerIsBetter) {
    if (value <= interpretation.excellent) return "excellent";
    if (value <= interpretation.good) return "good";
    if (value <= interpretation.fair) return "fair";
    return "poor";
  } else {
    if (value >= interpretation.excellent) return "excellent";
    if (value >= interpretation.good) return "good";
    if (value >= interpretation.fair) return "fair";
    return "poor";
  }
}

function getBarPercent(value: number, interpretation?: MetricInterpretation): number {
  if (!interpretation) return 0;
  
  const lowerIsBetter = interpretation.lower_is_better || false;
  
  if (lowerIsBetter) {
    // For lower is better metrics, invert the scale
    const max = interpretation.fair * 1.5; // Worst expected value
    const min = 0; // Best possible value
    const normalized = Math.max(0, Math.min(1, 1 - (value - min) / (max - min)));
    return normalized * 100;
  } else {
    // For higher is better metrics
    const max = 1.0; // Best possible (assuming 0-1 scale)
    const min = 0; // Worst possible
    const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return normalized * 100;
  }
}

function getBarColor(quality: string): string {
  switch (quality) {
    case "excellent":
      return "bg-green-500";
    case "good":
      return "bg-blue-500";
    case "fair":
      return "bg-yellow-500";
    case "poor":
      return "bg-red-500";
    default:
      return "bg-gray-400";
  }
}

function getQualityBadge(quality: string): JSX.Element {
  const colors = {
    excellent: "bg-green-100 text-green-800 border-green-300",
    good: "bg-blue-100 text-blue-800 border-blue-300",
    fair: "bg-yellow-100 text-yellow-800 border-yellow-300",
    poor: "bg-red-100 text-red-800 border-red-300",
    unknown: "bg-gray-100 text-gray-800 border-gray-300",
  };

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${colors[quality as keyof typeof colors] || colors.unknown}`}>
      {quality.charAt(0).toUpperCase() + quality.slice(1)}
    </span>
  );
}

export default function ModelsPage() {
  const [modelCards, setModelCards] = useState<ModelCards | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchModelCards();
  }, []);

  const fetchModelCards = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<ModelCards>("/ml/model-cards", { method: "GET" }, true);
      setModelCards(data);
    } catch (err: any) {
      setError(err.message || "Failed to load model cards");
      console.error("Model cards fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const exportPDF = () => {
    // Simple export for now - can enhance later
    alert("PDF export feature coming soon!");
  };

  const pipelines = useMemo(
    () =>
      modelCards
        ? [
            { key: "risk", data: modelCards.risk, color: "red" },
            { key: "employment", data: modelCards.employment, color: "green" },
            { key: "revenue", data: modelCards.revenue, color: "blue" },
          ]
        : [],
    [modelCards]
  );

  const aiInsights = useMemo<AiInsight[]>(() => {
    const totalModels = pipelines.reduce((acc, pipeline) => acc + (pipeline.data?.num_models || 0), 0);
    const totalFeatures = pipelines.reduce((acc, pipeline) => acc + (pipeline.data?.feature_count || 0), 0);
    const richestPipeline = pipelines
      .slice()
      .sort((a, b) => (b.data?.feature_count || 0) - (a.data?.feature_count || 0))[0];
    if (!pipelines.length) return [];

    const confidence = clampConfidence(60 + Math.min(20, totalModels));

    return [
      {
        id: "models-coverage",
        title: "Model coverage",
        narrative: `${totalModels} production models are documented across risk, employment, and revenue pipelines.`,
        confidence,
        tone: totalModels >= 9 ? "success" : "warning",
        evidence: pipelines.map((pipeline) => `${pipeline.data.pipeline}: ${pipeline.data.num_models} models`),
        actions: ["Review pipeline cards for horizon-level behavior and caveats."],
      },
      {
        id: "models-feature-depth",
        title: "Feature depth",
        narrative: `${totalFeatures} total engineered features are in play; ${richestPipeline?.data.pipeline || "Primary"} pipeline has the widest feature footprint.`,
        confidence: clampConfidence(confidence + 6),
        tone: "neutral",
        evidence: [`Largest feature set: ${richestPipeline?.data.feature_count || 0}`],
        actions: ["Prioritize monitoring on the highest-complexity pipeline."],
      },
      {
        id: "models-governance",
        title: "Governance readiness",
        narrative: "Model cards expose metrics, feature signals, and hyperparameters, supporting transparent review before operational decisions.",
        confidence: clampConfidence(72),
        tone: "success",
        actions: ["Pair model-card review with Data Quality and Audit pages for full traceability."],
      },
    ];
  }, [pipelines]);

  const aiContext = useMemo(
    () => ({
      pipelines,
      modelCards,
    }),
    [pipelines, modelCards]
  );

  const liveAi = useLiveAiInsights({
    scopeType: "models",
    context: aiContext,
    fallbackInsights: aiInsights,
  });

  if (loading) {
    return (
      <RequireRole allow={["Admin", "Program Manager"]}>
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center gap-3 text-inkomoko-blue">
            <Loader2 className="animate-spin" size={24} />
            <span>Loading model cards...</span>
          </div>
        </div>
      </RequireRole>
    );
  }

  if (error) {
    return (
      <RequireRole allow={["Admin", "Program Manager"]}>
        <div className="space-y-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-inkomoko-blue flex items-center gap-2">
                <BrainCircuit size={20} /> Model Cards
              </h1>
              <p className="text-sm text-inkomoko-muted mt-1">
                Transparent documentation of models, data assumptions, evaluation, and governance readiness.
              </p>
            </div>
          </div>

          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-4 text-center">
                <AlertCircle size={48} className="text-red-500" />
                <div>
                  <h3 className="text-lg font-semibold text-inkomoko-text">Failed to Load Model Cards</h3>
                  <p className="text-sm text-inkomoko-muted mt-2">{error}</p>
                  <Button onClick={fetchModelCards} className="mt-4">
                    Retry
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </RequireRole>
    );
  }

  if (!modelCards) {
    return null;
  }

  const totalModels = pipelines.reduce((acc, pipeline) => acc + (pipeline.data?.num_models || 0), 0);
  const totalFeatures = pipelines.reduce((acc, pipeline) => acc + (pipeline.data?.feature_count || 0), 0);
  const avgFeaturesPerPipeline = pipelines.length ? Math.round(totalFeatures / pipelines.length) : 0;

  return (
    <RequireRole allow={["Admin", "Program Manager"]}>
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-inkomoko-blue flex items-center gap-2">
              <BrainCircuit size={20} /> Model Cards
            </h1>
            <p className="text-sm text-inkomoko-muted mt-1">
              Transparent documentation of models, data assumptions, evaluation, and governance readiness.
            </p>
          </div>
          <Button className="gap-2" onClick={exportPDF}>
            <Download size={16} /> Export PDF
          </Button>
        </div>

        <InsightPanel
          title="AI Insights"
          subtitle="Narrative interpretation generated from current model-card metadata."
          status={liveAi.status}
          lastUpdated={liveAi.lastUpdated}
          insights={liveAi.insights}
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-inkomoko-border bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-inkomoko-muted">Pipelines</div>
            <div className="mt-1 text-2xl font-semibold text-inkomoko-text">{pipelines.length}</div>
          </div>
          <div className="rounded-2xl border border-inkomoko-border bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-inkomoko-muted">Total Models</div>
            <div className="mt-1 text-2xl font-semibold text-inkomoko-text">{totalModels}</div>
          </div>
          <div className="rounded-2xl border border-inkomoko-border bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-inkomoko-muted">Total Features</div>
            <div className="mt-1 text-2xl font-semibold text-inkomoko-text">{totalFeatures}</div>
          </div>
          <div className="rounded-2xl border border-inkomoko-border bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-inkomoko-muted">Avg Features/Pipeline</div>
            <div className="mt-1 text-2xl font-semibold text-inkomoko-text">{avgFeaturesPerPipeline}</div>
          </div>
        </div>

        <div className="space-y-6">
          {pipelines.map(({ key, data }) => (
            <Card key={key}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl">{data.pipeline} Pipeline</CardTitle>
                    <CardDescription className="mt-2">
                      {data.description}
                    </CardDescription>
                  </div>
                  <Badge tone="blue">{data.num_models} models</Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Purpose */}
                <div className="rounded-2xl border border-inkomoko-border bg-inkomoko-bg p-4">
                  <div className="text-sm font-semibold text-inkomoko-blue">Purpose</div>
                  <div className="mt-2 text-sm text-inkomoko-muted">{data.purpose}</div>
                </div>

                {/* What it Predicts */}
                <div className="rounded-2xl border border-inkomoko-border bg-white p-4">
                  <div className="text-sm font-semibold mb-3">What it Predicts</div>
                  <div className="space-y-2">
                    {data.what_it_predicts.map((pred) => (
                      <div key={pred.target} className="flex gap-3">
                        <Badge tone="neutral" className="shrink-0">{pred.label}</Badge>
                        <span className="text-sm text-inkomoko-muted">{pred.explanation}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Training Metrics */}
                {Object.keys(data.training_metrics).length > 0 && (
                  <div className="rounded-2xl border border-inkomoko-border bg-white p-4">
                    <div className="text-sm font-semibold mb-4">Training Metrics</div>
                    <div className="space-y-4">
                      {Object.entries(data.training_metrics).map(([metricKey, metricValue]) => {
                        const explanation = data.metric_explanations[metricKey];
                        if (!explanation) {
                          // Handle nested metrics (employment/revenue)
                          if (typeof metricValue === "object") {
                            return (
                              <div key={metricKey} className="space-y-2">
                                <div className="text-xs font-medium text-inkomoko-blue">{metricKey}</div>
                                {Object.entries(metricValue).map(([subKey, subValue]) => {
                                  const subExplanation = data.metric_explanations[subKey];
                                  const quality = getMetricQuality(subValue as number, subExplanation?.interpretation);
                                  const percent = getBarPercent(subValue as number, subExplanation?.interpretation);
                                  
                                  return (
                                    <div key={subKey} className="pl-4 space-y-1">
                                      <div className="flex items-center justify-between text-sm">
                                        <span className="font-medium">{subExplanation?.label || subKey}</span>
                                        <div className="flex items-center gap-2">
                                          <span className="text-inkomoko-text font-semibold">{String(subValue)}</span>
                                          {getQualityBadge(quality)}
                                        </div>
                                      </div>
                                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                        <div
                                          className={`h-full ${getBarColor(quality)} transition-all duration-300`}
                                          style={{ width: `${percent}%` }}
                                        />
                                      </div>
                                      {subExplanation && (
                                        <div className="text-xs text-inkomoko-muted">{subExplanation.explanation}</div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          }
                          return null;
                        }

                        const quality = getMetricQuality(metricValue as number, explanation.interpretation);
                        const percent = getBarPercent(metricValue as number, explanation.interpretation);

                        return (
                          <div key={metricKey} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{explanation.label}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-inkomoko-text">{metricValue}</span>
                                {getQualityBadge(quality)}
                              </div>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-full ${getBarColor(quality)} transition-all duration-300`}
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                            <div className="text-xs text-inkomoko-muted">{explanation.explanation}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Model Details */}
                <div className="rounded-2xl border border-inkomoko-border bg-inkomoko-bg p-4">
                  <div className="text-sm font-semibold text-inkomoko-blue mb-3">Model Details</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {data.models.map((model) => (
                      <div key={model.name} className="bg-white rounded-lg p-3 border border-inkomoko-border">
                        <div className="flex items-start justify-between mb-2">
                          <div className="text-xs font-medium text-inkomoko-blue">{model.name}</div>
                          <Badge tone="neutral" className="text-xs">{model.horizon}m</Badge>
                        </div>
                        <div className="space-y-1 text-xs text-inkomoko-muted">
                          <div className="flex justify-between">
                            <span>Algorithm:</span>
                            <span className="font-medium text-inkomoko-text">{model.algorithm}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Type:</span>
                            <span className="font-medium text-inkomoko-text capitalize">{model.type}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Features:</span>
                            <span className="font-medium text-inkomoko-text">{model.feature_count}</span>
                          </div>
                          {model.size_mb && (
                            <div className="flex justify-between">
                              <span>Size:</span>
                              <span className="font-medium text-inkomoko-text">{model.size_mb} MB</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Feature Summary */}
                <div className="rounded-2xl border border-inkomoko-border bg-white p-4">
                  <div className="text-sm font-semibold mb-2">Feature Engineering</div>
                  <div className="text-xs text-inkomoko-muted mb-3">
                    This pipeline uses {data.feature_count} engineered features from business, financial, and demographic data.
                  </div>
                  {data.models[0]?.feature_importance && data.models[0].feature_importance.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-inkomoko-blue hover:underline mb-2">
                        View top features (from {data.models[0].name})
                      </summary>
                      <div className="space-y-1 pl-4 mt-2 max-h-48 overflow-y-auto">
                        {data.models[0].feature_importance.slice(0, 10).map((fi, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="text-inkomoko-muted">{fi.feature}</span>
                            <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                              <div
                                className="bg-inkomoko-blue h-full rounded-full"
                                style={{ width: `${fi.importance * 100}%` }}
                              />
                            </div>
                            <span className="text-inkomoko-text font-mono">{(fi.importance * 100).toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </RequireRole>
  );
}
