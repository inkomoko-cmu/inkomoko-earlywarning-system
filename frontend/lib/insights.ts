export type InsightTone = "neutral" | "success" | "warning" | "danger";

export type AiInsight = {
  id: string;
  title: string;
  narrative: string;
  confidence: number;
  tone: InsightTone;
  evidence?: string[];
  actions?: string[];
};

export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(5, Math.min(99, Math.round(value)));
}

export function confidenceFromCompleteness(available: number, total: number): number {
  if (!Number.isFinite(available) || !Number.isFinite(total) || total <= 0) return 45;
  return clampConfidence((available / total) * 100);
}

export function confidenceLabel(confidence: number): "High" | "Medium" | "Low" {
  if (confidence >= 75) return "High";
  if (confidence >= 50) return "Medium";
  return "Low";
}

export function trendDirection(value: number): "up" | "down" | "flat" {
  if (!Number.isFinite(value)) return "flat";
  if (value > 0.5) return "up";
  if (value < -0.5) return "down";
  return "flat";
}
