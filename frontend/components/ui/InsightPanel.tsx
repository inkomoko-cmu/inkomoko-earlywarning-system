import { AlertCircle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { type AiInsight, confidenceLabel } from "@/lib/insights";

export function InsightPanel({
  title = "AI Insights",
  subtitle,
  insights,
  status = "idle",
  lastUpdated,
}: {
  title?: string;
  subtitle?: string;
  insights: AiInsight[];
  status?: string;
  lastUpdated?: string | null;
}) {
  const isRefreshing = status === "queued" || status === "running";

  return (
    <section className="rounded-2xl border border-inkomoko-border bg-gradient-to-br from-[#fcfcfd] via-[#f8fafc] to-[#f4f7fb] p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-inkomoko-border bg-white px-2.5 py-1 text-[11px] font-semibold text-inkomoko-blue">
          <Sparkles size={12} /> AI-assisted summary
        </span>
        <div className="flex items-center gap-2">
          {isRefreshing ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-inkomoko-border bg-white px-2 py-0.5 text-[11px] font-medium text-inkomoko-muted">
              <Loader2 size={12} className="animate-spin text-inkomoko-blue" />
            </span>
          ) : status === "done" && lastUpdated ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-inkomoko-border bg-white px-2 py-0.5 text-[11px] font-medium text-inkomoko-muted">
              <CheckCircle2 size={12} className="text-green-600" />
              {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          ) : status === "failed" ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
              <AlertCircle size={12} />
            </span>
          ) : null}
          <h2 className="text-sm font-semibold text-inkomoko-text">{title}</h2>
        </div>
      </div>
      {subtitle && <p className="mb-4 text-xs text-inkomoko-muted">{subtitle}</p>}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </section>
  );
}

function InsightCard({ insight }: { insight: AiInsight }) {
  const tone = toneToBadge(insight.tone);
  const confidence = Math.max(5, Math.min(99, Math.round(insight.confidence)));
  return (
    <Card className="border-inkomoko-border bg-white/90 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm leading-snug">{insight.title}</CardTitle>
          <Badge tone={tone}>{confidenceLabel(confidence)} {confidence}%</Badge>
        </div>
        <CardDescription className="text-xs leading-relaxed">{insight.narrative}</CardDescription>
      </CardHeader>
      {(insight.evidence?.length || insight.actions?.length) ? (
        <CardContent className="pt-0 space-y-2">
          {insight.evidence && insight.evidence.length > 0 && (
            <ul className="space-y-1 text-xs text-inkomoko-muted">
              {insight.evidence.slice(0, 2).map((item) => (
                <li key={item} className="rounded-md bg-inkomoko-bg px-2 py-1">{item}</li>
              ))}
            </ul>
          )}
          {insight.actions && insight.actions.length > 0 && (
            <div className="text-xs text-inkomoko-text font-medium">Next: {insight.actions[0]}</div>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}

function toneToBadge(tone: AiInsight["tone"]): "success" | "warning" | "danger" | "neutral" | "blue" | "orange" {
  if (tone === "success") return "success";
  if (tone === "warning") return "warning";
  if (tone === "danger") return "danger";
  return "blue";
}
