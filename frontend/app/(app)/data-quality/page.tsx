"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { exportPDF } from "@/lib/export";
import { Button } from "@/components/ui/Button";
import { ShieldCheck, Download, AlertCircle, CheckCircle, Info, XCircle } from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";
import { BASE } from "@/lib/api";

interface ColumnProfile {
  column: string;
  type: string;
  required: boolean;
  present: boolean;
  total_rows: number;
  null_count: number;
  null_pct: number;
  fill_rate: number;
  distinct_count: number;
  checks_passed: number;
  checks_total: number;
  min?: number;
  max?: number;
  mean?: number;
  std?: number;
  duplicate_count?: number;
  outlier_count?: number;
}

interface Violation {
  column: string;
  rule: string;
  severity: "critical" | "error" | "warning" | "info";
  message: string;
  affected_rows: number;
}

interface DataQualityResult {
  total_rows: number;
  total_columns: number;
  contracted_columns: number;
  present_contracted: number;
  missing_required: string[];
  quality_score: number;
  checks_passed: number;
  checks_total: number;
  violations: Violation[];
  violation_severity: {
    critical: number;
    error: number;
    warning: number;
    info: number;
  };
  column_profiles: ColumnProfile[];
  completeness_summary: Array<{ column: string; fill_rate: number }>;
  source: string;
  error?: string;
}

export default function DataQualityPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qualityData, setQualityData] = useState<DataQualityResult | null>(null);

  useEffect(() => {
    const fetchQualityData = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${BASE}/ml/data-quality`);
        if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
        const data = await res.json();
        setQualityData(data);
        setError(null);
      } catch (err) {
        console.error("Data quality fetch error:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch data quality");
      } finally {
        setLoading(false);
      }
    };

    fetchQualityData();
  }, []);

  const exportQuality = () => {
    if (!qualityData) return;
    const rows = qualityData.column_profiles.map((p) => ({
      Column: p.column,
      Type: p.type,
      Required: p.required ? "Yes" : "No",
      "Fill Rate": `${p.fill_rate}%`,
      "Null Count": p.null_count,
      "Checks Passed": `${p.checks_passed}/${p.checks_total}`,
    }));
    exportPDF("Data_Quality_Report", "Data Quality Report", rows);
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical": return <XCircle size={16} className="text-red-600" />;
      case "error": return <AlertCircle size={16} className="text-orange-600" />;
      case "warning": return <AlertCircle size={16} className="text-yellow-600" />;
      case "info": return <Info size={16} className="text-blue-600" />;
      default: return <Info size={16} />;
    }
  };

  const getSeverityBadgeTone = (severity: string): "danger" | "warning" | "blue" | "neutral" => {
    switch (severity) {
      case "critical": return "danger";
      case "error": return "danger";
      case "warning": return "warning";
      case "info": return "blue";
      default: return "neutral";
    }
  };

  if (loading) {
    return (
      <RequireRole allow={["Admin", "Program Manager"]}>
        <div className="flex items-center justify-center h-96">
          <div className="text-inkomoko-muted">Loading data quality results...</div>
        </div>
      </RequireRole>
    );
  }

  if (error) {
    return (
      <RequireRole allow={["Admin", "Program Manager"]}>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
            <div className="text-inkomoko-text font-semibold">Failed to load data quality</div>
            <div className="text-sm text-inkomoko-muted mt-2">{error}</div>
          </div>
        </div>
      </RequireRole>
    );
  }

  if (!qualityData) return null;

  return (
    <RequireRole allow={["Admin", "Program Manager"]}>
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-inkomoko-blue flex items-center gap-2">
              <ShieldCheck size={20} /> Data Quality
            </h1>
            <p className="text-sm text-inkomoko-muted mt-1">
              Automated data quality validation against contracts for {qualityData.source}
            </p>
          </div>
          <Button className="gap-2" onClick={exportQuality}>
            <Download size={16} /> Export PDF
          </Button>
        </div>

        {/* Quality Score Ring & KPIs */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Quality Score Ring */}
          <Card className="lg:col-span-1">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center">
                <div className="relative w-48 h-48">
                  <svg viewBox="0 0 100 100" className="transform -rotate-90">
                    {/* Background circle */}
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="10"
                      className="text-inkomoko-bg"
                    />
                    {/* Progress circle */}
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="10"
                      strokeDasharray={`${2 * Math.PI * 40}`}
                      strokeDashoffset={`${2 * Math.PI * 40 * (1 - qualityData.quality_score / 100)}`}
                      className={qualityData.quality_score >= 90 ? "text-green-500" : qualityData.quality_score >= 70 ? "text-yellow-500" : "text-red-500"}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-4xl font-bold text-inkomoko-blue">{qualityData.quality_score}%</div>
                    <div className="text-xs text-inkomoko-muted mt-1">Quality Score</div>
                  </div>
                </div>
                <div className="mt-6 text-center space-y-1">
                  <div className="text-sm font-semibold text-inkomoko-text">
                    {qualityData.checks_passed} / {qualityData.checks_total} checks passed
                  </div>
                  <div className="text-xs text-inkomoko-muted">
                    Pass Rate: {qualityData.checks_total > 0 ? ((qualityData.checks_passed / qualityData.checks_total) * 100).toFixed(1) : 0}%
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* KPI Cards */}
          <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-inkomoko-muted uppercase tracking-wide">Total Rows</div>
                <div className="text-3xl font-bold text-inkomoko-blue mt-2">{qualityData.total_rows.toLocaleString()}</div>
                <div className="text-xs text-inkomoko-muted mt-1">Data points analyzed</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-inkomoko-muted uppercase tracking-wide">Columns</div>
                <div className="text-3xl font-bold text-inkomoko-blue mt-2">{qualityData.total_columns}</div>
                <div className="text-xs text-inkomoko-muted mt-1">{qualityData.contracted_columns} contracted fields</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-inkomoko-muted uppercase tracking-wide">Coverage</div>
                <div className="text-3xl font-bold text-inkomoko-blue mt-2">
                  {qualityData.contracted_columns > 0 ? ((qualityData.present_contracted / qualityData.contracted_columns) * 100).toFixed(0) : 0}%
                </div>
                <div className="text-xs text-inkomoko-muted mt-1">
                  {qualityData.present_contracted} of {qualityData.contracted_columns} present
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-xs text-inkomoko-muted uppercase tracking-wide">Violations</div>
                <div className="text-3xl font-bold text-red-600 mt-2">{qualityData.violations.length}</div>
                <div className="text-xs text-inkomoko-muted mt-1">
                  {qualityData.violation_severity.critical + qualityData.violation_severity.error} critical/error
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Data Source & Missing Required Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Data Source</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between items-center p-3 bg-inkomoko-bg rounded-xl">
                  <span className="text-sm text-inkomoko-muted">Source File</span>
                  <span className="text-sm font-semibold text-inkomoko-text">{qualityData.source}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-inkomoko-bg rounded-xl">
                  <span className="text-sm text-inkomoko-muted">Timestamp</span>
                  <span className="text-sm font-semibold text-inkomoko-text">{new Date().toLocaleString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {qualityData.missing_required.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-red-600">Missing Required Columns</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {qualityData.missing_required.map((col) => (
                    <div key={col} className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                      <XCircle size={16} className="text-red-600" />
                      <span className="text-sm font-mono text-red-700">{col}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Severity Distribution */}
        {qualityData.violations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Violation Severity</CardTitle>
              <CardDescription>Distribution of data quality violations by severity level</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 flex-wrap">
                <Badge tone="danger" className="flex items-center gap-2">
                  <XCircle size={14} /> Critical: {qualityData.violation_severity.critical}
                </Badge>
                <Badge tone="danger" className="flex items-center gap-2">
                  <AlertCircle size={14} /> Error: {qualityData.violation_severity.error}
                </Badge>
                <Badge tone="warning" className="flex items-center gap-2">
                  <AlertCircle size={14} /> Warning: {qualityData.violation_severity.warning}
                </Badge>
                <Badge tone="blue" className="flex items-center gap-2">
                  <Info size={14} /> Info: {qualityData.violation_severity.info}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Violations Table */}
        {qualityData.violations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Contract Violations ({qualityData.violations.length})</CardTitle>
              <CardDescription>Detailed data quality issues detected during validation with severity classification</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {qualityData.violations.map((v, idx) => {
                  const affectedPct = qualityData.total_rows > 0 
                    ? ((v.affected_rows / qualityData.total_rows) * 100).toFixed(2)
                    : "0";
                  
                  return (
                    <div key={idx} className="flex items-start gap-3 p-4 border-2 border-inkomoko-border rounded-2xl bg-white hover:bg-inkomoko-bg/30 transition-all hover:shadow-sm">
                      <div className="mt-0.5">{getSeverityIcon(v.severity)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-bold text-inkomoko-text font-mono">{v.column}</span>
                          <Badge tone={getSeverityBadgeTone(v.severity)} className="text-xs">{v.rule}</Badge>
                          <Badge tone="neutral" className="text-xs uppercase">{v.severity}</Badge>
                        </div>
                        <div className="text-sm text-inkomoko-text mb-2">{v.message}</div>
                        <div className="flex items-center gap-4 text-xs text-inkomoko-muted">
                          <span className="flex items-center gap-1">
                            <span className="font-semibold">{v.affected_rows.toLocaleString()}</span> rows affected
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="font-semibold">{affectedPct}%</span> of dataset
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-2xl font-bold ${v.severity === "critical" ? "text-red-600" : v.severity === "error" ? "text-orange-600" : v.severity === "warning" ? "text-yellow-600" : "text-blue-600"}`}>
                          {v.affected_rows.toLocaleString()}
                        </div>
                        <div className="text-xs text-inkomoko-muted">rows</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Column Health Profiles */}
        <Card>
          <CardHeader>
            <CardTitle>Column Health Profiles ({qualityData.column_profiles.length})</CardTitle>
            <CardDescription>Comprehensive profiling and validation status for all contracted columns with statistical analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-2xl border border-inkomoko-border bg-white">
              <table className="min-w-[1400px] w-full text-sm">
                <thead className="bg-inkomoko-bg sticky top-0">
                  <tr className="text-left">
                    <Th>Column</Th>
                    <Th>Type</Th>
                    <Th>Required</Th>
                    <Th>Fill Rate</Th>
                    <Th>Null Count</Th>
                    <Th>Distinct</Th>
                    <Th>Checks</Th>
                    <Th>Min</Th>
                    <Th>Max</Th>
                    <Th>Mean</Th>
                    <Th>Std Dev</Th>
                    <Th>Duplicates</Th>
                    <Th>Outliers</Th>
                  </tr>
                </thead>
                <tbody>
                  {qualityData.column_profiles.map((p) => {
                    const checkStatus = p.checks_passed === p.checks_total ? "✓" : "⚠";
                    const checkColor = p.checks_passed === p.checks_total ? "text-green-600" : "text-red-600";
                    
                    return (
                      <tr key={p.column} className="border-t border-inkomoko-border hover:bg-inkomoko-bg/60 transition-colors">
                        <Td className="font-bold font-mono">{p.column}</Td>
                        <Td>
                          <Badge tone={p.type === "numeric" ? "blue" : "neutral"} className="text-xs">
                            {p.type}
                          </Badge>
                        </Td>
                        <Td>
                          {p.required ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle size={16} />
                              <span className="text-xs font-semibold">Yes</span>
                            </div>
                          ) : (
                            <span className="text-xs text-inkomoko-muted">Optional</span>
                          )}
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-inkomoko-bg rounded-full h-2.5 min-w-[80px]">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  p.fill_rate >= 90
                                    ? "bg-green-500"
                                    : p.fill_rate >= 70
                                    ? "bg-yellow-500"
                                    : "bg-red-500"
                                }`}
                                style={{ width: `${p.fill_rate}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-inkomoko-text min-w-[50px] text-right">
                              {p.fill_rate}%
                            </span>
                          </div>
                        </Td>
                        <Td>
                          <div className="text-right">
                            <div className="font-semibold">{p.null_count.toLocaleString()}</div>
                            <div className="text-xs text-inkomoko-muted">{p.null_pct}%</div>
                          </div>
                        </Td>
                        <Td>
                          <div className="text-right font-semibold">{p.distinct_count.toLocaleString()}</div>
                        </Td>
                        <Td>
                          <div className={`text-center font-bold ${checkColor}`}>
                            {checkStatus} {p.checks_passed}/{p.checks_total}
                          </div>
                        </Td>
                        <Td className="text-right font-mono text-xs">
                          {p.min !== undefined ? p.min.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "-"}
                        </Td>
                        <Td className="text-right font-mono text-xs">
                          {p.max !== undefined ? p.max.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "-"}
                        </Td>
                        <Td className="text-right font-mono text-xs">
                          {p.mean !== undefined ? p.mean.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "-"}
                        </Td>
                        <Td className="text-right font-mono text-xs">
                          {p.std !== undefined ? p.std.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "-"}
                        </Td>
                        <Td>
                          {p.duplicate_count !== undefined && p.duplicate_count > 0 ? (
                            <div className="text-center">
                              <div className="font-semibold text-orange-600">{p.duplicate_count}</div>
                              <div className="text-xs text-inkomoko-muted">dupes</div>
                            </div>
                          ) : (
                            <div className="text-center text-green-600 font-semibold">-</div>
                          )}
                        </Td>
                        <Td>
                          {p.outlier_count !== undefined && p.outlier_count > 0 ? (
                            <div className="text-center">
                              <div className="font-semibold text-yellow-600">{p.outlier_count}</div>
                              <div className="text-xs text-inkomoko-muted">outliers</div>
                            </div>
                          ) : (
                            <div className="text-center text-green-600 font-semibold">-</div>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {/* Summary Statistics */}
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-inkomoko-bg rounded-xl">
                <div className="text-xs text-inkomoko-muted uppercase tracking-wide">Avg Fill Rate</div>
                <div className="text-2xl font-bold text-inkomoko-blue mt-1">
                  {(qualityData.column_profiles.reduce((sum, p) => sum + p.fill_rate, 0) / qualityData.column_profiles.length).toFixed(1)}%
                </div>
              </div>
              <div className="p-4 bg-inkomoko-bg rounded-xl">
                <div className="text-xs text-inkomoko-muted uppercase tracking-wide">Total Nulls</div>
                <div className="text-2xl font-bold text-inkomoko-blue mt-1">
                  {qualityData.column_profiles.reduce((sum, p) => sum + p.null_count, 0).toLocaleString()}
                </div>
              </div>
              <div className="p-4 bg-inkomoko-bg rounded-xl">
                <div className="text-xs text-inkomoko-muted uppercase tracking-wide">Duplicates Found</div>
                <div className="text-2xl font-bold text-orange-600 mt-1">
                  {qualityData.column_profiles.reduce((sum, p) => sum + (p.duplicate_count || 0), 0)}
                </div>
              </div>
              <div className="p-4 bg-inkomoko-bg rounded-xl">
                <div className="text-xs text-inkomoko-muted uppercase tracking-wide">Outliers Found</div>
                <div className="text-2xl font-bold text-yellow-600 mt-1">
                  {qualityData.column_profiles.reduce((sum, p) => sum + (p.outlier_count || 0), 0)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Completeness Overview */}
        {qualityData.completeness_summary.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Completeness Heatmap</CardTitle>
              <CardDescription>Fill rates across all {qualityData.completeness_summary.length} columns (sorted by completeness ascending)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {qualityData.completeness_summary.map((c, idx) => {
                  const fillColor = c.fill_rate >= 95 
                    ? "from-green-500 to-green-600" 
                    : c.fill_rate >= 90 
                    ? "from-green-400 to-green-500"
                    : c.fill_rate >= 70 
                    ? "from-yellow-400 to-yellow-500" 
                    : c.fill_rate >= 50
                    ? "from-orange-400 to-orange-500"
                    : "from-red-400 to-red-500";
                  
                  const textColor = c.fill_rate >= 70 ? "text-white" : "text-white";
                  
                  return (
                    <div key={c.column} className="relative overflow-hidden rounded-xl border border-inkomoko-border">
                      <div className={`absolute inset-0 bg-gradient-to-r ${fillColor} opacity-90`} style={{ width: `${c.fill_rate}%` }} />
                      <div className="relative flex items-center justify-between p-3 min-h-[60px]">
                        <div className="flex-1 min-w-0 pr-2">
                          <div className={`text-sm font-mono font-semibold truncate ${c.fill_rate >= 50 ? textColor : "text-inkomoko-text"}`}>
                            {c.column}
                          </div>
                          <div className={`text-xs ${c.fill_rate >= 50 ? textColor + " opacity-90" : "text-inkomoko-muted"}`}>
                            Rank #{idx + 1} of {qualityData.completeness_summary.length}
                          </div>
                        </div>
                        <div className={`text-xl font-bold ${c.fill_rate >= 50 ? textColor : "text-inkomoko-blue"}`}>
                          {c.fill_rate}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Completeness Legend */}
              <div className="mt-6 flex items-center justify-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-green-500" />
                  <span className="text-xs text-inkomoko-muted">≥90% Excellent</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-yellow-500" />
                  <span className="text-xs text-inkomoko-muted">70-89% Good</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-orange-500" />
                  <span className="text-xs text-inkomoko-muted">50-69% Fair</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-red-500" />
                  <span className="text-xs text-inkomoko-muted">&lt;50% Poor</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Data Quality Guide */}
        <Card>
          <CardHeader>
            <CardTitle>Contract Validation Rules</CardTitle>
            <CardDescription>Comprehensive data quality checks applied to the dataset</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border-2 border-inkomoko-border rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle size={18} className="text-green-600" />
                  <h3 className="font-semibold text-inkomoko-text">Completeness Checks</h3>
                </div>
                <ul className="space-y-2 text-sm text-inkomoko-muted">
                  <li className="flex items-start gap-2">
                    <span className="text-inkomoko-blue mt-0.5">•</span>
                    <span>Required fields must have ≥90% fill rate</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-inkomoko-blue mt-0.5">•</span>
                    <span>Null value tracking and percentage calculation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-inkomoko-blue mt-0.5">•</span>
                    <span>Missing required column detection</span>
                  </li>
                </ul>
              </div>

              <div className="p-4 border-2 border-inkomoko-border rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle size={18} className="text-blue-600" />
                  <h3 className="font-semibold text-inkomoko-text">Uniqueness Validation</h3>
                </div>
                <ul className="space-y-2 text-sm text-inkomoko-muted">
                  <li className="flex items-start gap-2">
                    <span className="text-inkomoko-blue mt-0.5">•</span>
                    <span>Duplicate value detection for unique fields</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-inkomoko-blue mt-0.5">•</span>
                    <span>Distinct value counting and cardinality analysis</span>
                  </li>
                </ul>
              </div>

              <div className="p-4 border-2 border-inkomoko-border rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <Info size={18} className="text-yellow-600" />
                  <h3 className="font-semibold text-inkomoko-text">Range & Boundary Checks</h3>
                </div>
                <ul className="space-y-2 text-sm text-inkomoko-muted">
                  <li className="flex items-start gap-2">
                    <span className="text-inkomoko-blue mt-0.5">•</span>
                    <span>Minimum and maximum value validation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-inkomoko-blue mt-0.5">•</span>
                    <span>Statistical outlier detection (&gt;3σ from mean)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-inkomoko-blue mt-0.5">•</span>
                    <span>Allowed value sets for categorical fields</span>
                  </li>
                </ul>
              </div>

              <div className="p-4 border-2 border-inkomoko-border rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck size={18} className="text-purple-600" />
                  <h3 className="font-semibold text-inkomoko-text">Type Consistency</h3>
                </div>
                <ul className="space-y-2 text-sm text-inkomoko-muted">
                  <li className="flex items-start gap-2">
                    <span className="text-inkomoko-blue mt-0.5">•</span>
                    <span>Numeric field type validation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-inkomoko-blue mt-0.5">•</span>
                    <span>Categorical field enumeration checking</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-inkomoko-blue mt-0.5">•</span>
                    <span>Data type coercion error detection</span>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Note & Contract Impact */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border-2 border-inkomoko-border bg-gradient-to-br from-inkomoko-bg to-white p-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle size={20} className="text-inkomoko-blue" />
              <div className="text-base font-bold text-inkomoko-text">Automated Remediation</div>
            </div>
            <p className="text-sm text-inkomoko-muted leading-relaxed">
              When a contract fails, the platform automatically flags impacted KPIs and forecasts, highlights root cause drivers of data missingness, and triggers remediation workflows for the assigned data owner. Critical violations block dashboard publishing until resolved.
            </p>
          </div>

          <div className="rounded-2xl border-2 border-inkomoko-border bg-gradient-to-br from-inkomoko-bg to-white p-6">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={20} className="text-green-600" />
              <div className="text-base font-bold text-inkomoko-text">Quality Assurance</div>
            </div>
            <p className="text-sm text-inkomoko-muted leading-relaxed">
              This validation framework ensures data defensibility for reporting, regulatory compliance, and decision-making. All contracts are version-controlled and changes trigger full historical re-evaluation to maintain data lineage integrity.
            </p>
          </div>
        </div>

        {/* Summary Footer */}
        <div className="rounded-2xl border-2 border-inkomoko-blue/20 bg-blue-50 p-5">
          <div className="flex items-start gap-4">
            <div className="mt-1">
              <Info size={24} className="text-inkomoko-blue" />
            </div>
            <div className="flex-1">
              <div className="font-bold text-inkomoko-blue mb-2">Quality Score Calculation</div>
              <p className="text-sm text-inkomoko-text leading-relaxed">
                The overall quality score of <strong>{qualityData.quality_score}%</strong> is calculated as the percentage of all validation checks that passed 
                ({qualityData.checks_passed} passed out of {qualityData.checks_total} total checks). Each contracted column runs multiple checks including 
                completeness, uniqueness, range validation, outlier detection, and type consistency. Violations are classified by severity: 
                <strong className="text-red-600"> critical</strong> (missing required columns), 
                <strong className="text-orange-600"> error</strong> (data integrity issues), 
                <strong className="text-yellow-600"> warning</strong> (quality concerns), and 
                <strong className="text-blue-600"> info</strong> (statistical anomalies).
              </p>
            </div>
          </div>
        </div>
      </div>
    </RequireRole>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-xs font-semibold text-inkomoko-muted uppercase tracking-wide">
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
